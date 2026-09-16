from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from .. import models, schemas
from ..database import get_db
from ..deps import get_owned_session
from ..ws_manager import manager

router = APIRouter(prefix="/sessions/{session_id}/activities", tags=["activities"])


def _is_choice_type(qtype: str) -> bool:
    return qtype in {"multiple_choice", "checkboxes", "dropdown", "multiple_choice_grid", "checkbox_grid"}


def _validate_question(q: schemas.QuestionCreate) -> None:
    if q.question_type not in schemas.QUESTION_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported question type: {q.question_type}")
    if q.mode not in {"poll", "quiz"}:
        raise HTTPException(status_code=400, detail="Question mode must be poll or quiz")

    if q.question_type in {"multiple_choice", "checkboxes", "dropdown"} and len(q.options) < 2:
        raise HTTPException(status_code=400, detail=f"{q.question_type} needs at least two options")
    if q.question_type in {"multiple_choice_grid", "checkbox_grid"}:
        rows = q.settings.get("rows", [])
        cols = q.settings.get("columns", [])
        if len(rows) < 1 or len(cols) < 2:
            raise HTTPException(status_code=400, detail="Grid questions need rows and at least two columns")
    if q.question_type == "linear_scale":
        low = int(q.settings.get("min", 1))
        high = int(q.settings.get("max", 5))
        if high <= low:
            raise HTTPException(status_code=400, detail="Linear scale max must be greater than min")
    if q.mode == "quiz":
        if q.question_type in {"multiple_choice", "dropdown"} and not any(o.is_correct for o in q.options):
            raise HTTPException(status_code=400, detail=f'Quiz question "{q.prompt}" needs a correct answer')
        if q.question_type == "checkboxes" and not any(o.is_correct for o in q.options):
            raise HTTPException(status_code=400, detail=f'Quiz question "{q.prompt}" needs at least one correct option')


@router.post("", response_model=schemas.ActivityOut, status_code=status.HTTP_201_CREATED)
def create_activity(
    payload: schemas.ActivityCreate,
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    for q in payload.questions:
        _validate_question(q)

    activity = models.Activity(
        session_id=session.id,
        type=models.ActivityType.quiz,
        title=payload.title or "Live activity",
        order_index=len(session.activities),
    )
    db.add(activity)
    db.flush()

    for q_index, q in enumerate(payload.questions):
        has_correct = q.mode == "quiz" and (
            any(opt.is_correct for opt in q.options)
            or "correct_value" in q.settings
            or "correct_answer" in q.settings
            or bool(q.settings.get("correct_grid"))
        )
        question = models.Question(
            activity_id=activity.id,
            prompt=q.prompt,
            order_index=q_index,
            question_type=q.question_type,
            mode=q.mode,
            settings=q.settings,
            section_title=q.section_title,
            section_description=q.section_description,
            has_correct_answer=has_correct,
        )
        db.add(question)
        db.flush()
        for o_index, opt in enumerate(q.options):
            db.add(models.Option(
                question_id=question.id,
                text=opt.text,
                order_index=o_index,
                is_correct=bool(opt.is_correct and q.mode == "quiz"),
            ))

    db.commit()
    db.refresh(activity)
    return activity
@router.put("/{activity_id}", response_model=schemas.ActivityOut)
def update_activity(
    activity_id: str,
    payload: schemas.ActivityCreate,
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    if session.status != models.SessionStatus.draft:
        raise HTTPException(
            status_code=400,
            detail="Only draft sessions can be edited",
        )

    activity = _get_activity(db, session, activity_id)

    for q in payload.questions:
        _validate_question(q)

    activity.type = models.ActivityType(payload.type)
    activity.title = payload.title.strip()

    # Remove the old questions and their options.
    for old_question in list(activity.questions):
        db.delete(old_question)

    db.flush()

    # Re-create the edited questions.
    for q_index, q in enumerate(payload.questions):
        has_correct = q.mode == "quiz" and (
            any(opt.is_correct for opt in q.options)
            or "correct_value" in q.settings
            or "correct_answer" in q.settings
            or bool(q.settings.get("correct_grid"))
        )

        question = models.Question(
            activity_id=activity.id,
            prompt=q.prompt,
            order_index=q_index,
            question_type=q.question_type,
            mode=q.mode,
            settings=q.settings,
            section_title=q.section_title,
            section_description=q.section_description,
            has_correct_answer=has_correct,
        )

        db.add(question)
        db.flush()

        for o_index, opt in enumerate(q.options):
            db.add(
                models.Option(
                    question_id=question.id,
                    text=opt.text,
                    order_index=o_index,
                    is_correct=bool(
                        opt.is_correct and q.mode == "quiz"
                    ),
                )
            )

    db.commit()
    db.refresh(activity)

    return activity

@router.post("/{activity_id}/launch", response_model=schemas.ActivityOut)
async def launch_activity(
    activity_id: str,
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    activity = _get_activity(db, session, activity_id)
    activity.is_launched = True
    activity.launched_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)

    await manager.broadcast(session.code, {
        "event": "activity_launched",
        "activity_id": activity.id,
        "title": activity.title,
        "type": activity.type.value,
        "questions": [
            {
                "id": q.id,
                "prompt": q.prompt,
                "question_type": q.question_type,
                "mode": q.mode,
                "settings": q.settings or {},
                "options": [{"id": o.id, "text": o.text} for o in q.options],
            }
            for q in activity.questions
        ],
    })
    return activity


@router.post("/{activity_id}/close", response_model=schemas.ActivityResultsOut)
async def close_activity(
    activity_id: str,
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    activity = _get_activity(db, session, activity_id)
    activity.is_closed = True
    activity.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(activity)
    results = _build_activity_results(activity)
    await manager.broadcast(session.code, {"event": "activity_closed", "results": results.model_dump()})
    return results


@router.get("/{activity_id}/results", response_model=schemas.ActivityResultsOut)
def get_activity_results(
    activity_id: str,
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    return _build_activity_results(_get_activity(db, session, activity_id))


def _get_activity(db: DBSession, session: models.LiveSession, activity_id: str) -> models.Activity:
    activity = db.get(models.Activity, activity_id)
    if activity is None or activity.session_id != session.id:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


def _build_activity_results(activity: models.Activity) -> schemas.ActivityResultsOut:
    question_results = []
    for question in activity.questions:
        counts = {opt.id: 0 for opt in question.options}
        text_responses = []
        for response in question.responses:
            if response.option_id in counts:
                counts[response.option_id] += 1
            data = response.answer_data or {}
            if data.get("text_answer"):
                text_responses.append(str(data["text_answer"]))

        # "Commonly misunderstood topics" (PRD AI nice-to-have) as a concrete,
        # always-available metric — no AI call needed, works even without a
        # Gemini key configured.
        accuracy_percent = None
        if question.mode == "quiz" and question.has_correct_answer:
            graded = [r for r in question.responses if r.is_correct is not None]
            if graded:
                correct = sum(1 for r in graded if r.is_correct)
                accuracy_percent = round(correct / len(graded) * 100, 1)

        question_results.append(schemas.QuestionResultOut(
            question_id=question.id,
            prompt=question.prompt,
            question_type=question.question_type,
            mode=question.mode,
            total_responses=len(question.responses),
            options=[schemas.OptionResultOut(
                option_id=opt.id,
                text=opt.text,
                is_correct=opt.is_correct,
                vote_count=counts[opt.id],
            ) for opt in question.options],
            text_responses=text_responses,
            accuracy_percent=accuracy_percent,
        ))
    return schemas.ActivityResultsOut(
        activity_id=activity.id,
        title=activity.title,
        type=activity.type.value,
        questions=question_results,
    )
