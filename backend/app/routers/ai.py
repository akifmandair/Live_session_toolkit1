from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from .. import ai, models, schemas
from ..database import get_db
from ..deps import get_owned_session
from .activities import _build_activity_results

router = APIRouter(tags=["ai"])


def _run_ai(fn, *args):
    try:
        return fn(*args)
    except ai.AIConfigError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
    except ai.AIResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post(
    "/sessions/{session_id}/activities/generate",
    response_model=schemas.GenerateQuestionsResponse,
)
def generate_activity_questions(
    payload: schemas.GenerateQuestionsRequest,
    session: models.LiveSession = Depends(get_owned_session),  # noqa: ARG001 — auth/ownership check
    db: DBSession = Depends(get_db),  # noqa: ARG001 — kept for symmetry with other routes
):
    raw_questions = _run_ai(
        ai.generate_questions,
        payload.topic,
        payload.type,
        payload.count,
        payload.options_per_question,
        payload.source_material,
    )

    # Re-validate through the same schema used to save activities, so the
    # facilitator only ever sees/reviews well-formed drafts.
    try:
        questions = [schemas.QuestionCreate(**q) for q in raw_questions]
    except Exception as exc:  # pydantic ValidationError, wrapped generically on purpose
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"The model returned questions in an unexpected shape: {exc}",
        )

    return schemas.GenerateQuestionsResponse(type=payload.type, questions=questions)


@router.post("/sessions/{session_id}/results/summary", response_model=schemas.SessionSummaryOut)
def summarize_session_results(
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),  # noqa: ARG001
):
    activity_results = [_build_activity_results(a).model_dump() for a in session.activities]

    leaderboard = []
    for participant in session.participants:
        correct = sum(1 for r in participant.responses if r.question.has_correct_answer and r.is_correct)
        answered = sum(1 for r in participant.responses if r.question.has_correct_answer)
        leaderboard.append({"display_name": participant.display_name, "correct": correct, "answered": answered})

    summary = _run_ai(ai.summarize_session, session.title, activity_results, leaderboard)
    return schemas.SessionSummaryOut(summary=summary)
