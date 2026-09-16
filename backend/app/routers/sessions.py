from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, get_owned_session
from ..limiter import limiter
from ..ws_manager import manager

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=schemas.SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: schemas.SessionCreate,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = models.LiveSession(
        title=payload.title,
        facilitator_id=current_user.id,
        is_public=payload.is_public,
        city=(payload.city or "").strip() or None,
        country=(payload.country or "").strip() or None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.put("/{session_id}", response_model=schemas.SessionOut)
def update_session(
    payload: schemas.SessionUpdate,
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    if session.status == models.SessionStatus.live:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot edit a live session",
        )

    session.title = payload.title.strip()
    if payload.is_public is not None:
        session.is_public = payload.is_public
    if payload.city is not None:
        session.city = payload.city.strip() or None
    if payload.country is not None:
        session.country = payload.country.strip() or None

    db.commit()
    db.refresh(session)

    return session


@router.get("", response_model=list[schemas.SessionOut])
def list_sessions(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.LiveSession)
        .filter(models.LiveSession.facilitator_id == current_user.id)
        .order_by(models.LiveSession.created_at.desc())
        .all()
    )


@router.get("/public", response_model=list[schemas.PublicSessionOut])
def list_public_sessions(
    db: DBSession = Depends(get_db),
    q: str | None = None,
    city: str | None = None,
    country: str | None = None,
):
    """Public directory of discoverable sessions — no auth required.

    Lets participants search for sessions by keyword and/or location
    (e.g. city="Karachi", country="Pakistan") instead of only joining
    via a shared code/QR.
    """
    query = db.query(models.LiveSession).filter(
        models.LiveSession.is_public.is_(True),
        models.LiveSession.status != models.SessionStatus.ended,
    )
    if city:
        query = query.filter(models.LiveSession.city.ilike(f"%{city.strip()}%"))
    if country:
        query = query.filter(models.LiveSession.country.ilike(f"%{country.strip()}%"))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(models.LiveSession.title.ilike(like))

    sessions = query.order_by(
        models.LiveSession.status.desc(),  # "live" sorts after "draft" alphabetically
        models.LiveSession.created_at.desc(),
    ).all()

    return [
        schemas.PublicSessionOut(
            id=s.id,
            title=s.title,
            code=s.code,
            status=s.status,
            city=s.city,
            country=s.country,
            facilitator_name=s.facilitator.name,
            participant_count=len(s.participants),
            created_at=s.created_at,
        )
        for s in sessions
    ]


@router.get("/{session_id}", response_model=schemas.SessionDetailOut)
def get_session(session: models.LiveSession = Depends(get_owned_session)):
    out = schemas.SessionDetailOut.model_validate(session)
    out.participant_count = len(session.participants)
    return out


@router.post("/{session_id}/launch", response_model=schemas.SessionOut)
def launch_session(
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    if not session.activities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add at least one poll or quiz before launching the session",
        )
    session.status = models.SessionStatus.live
    session.launched_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/end", response_model=schemas.SessionOut)
async def end_session(
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    session.status = models.SessionStatus.ended
    session.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    await manager.broadcast(session.code, {"event": "session_ended"})
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    db.delete(session)
    db.commit()
    return None
@router.post(
    "/{session_id}/reuse",
    response_model=schemas.SessionOut,
    status_code=status.HTTP_201_CREATED,
)
def reuse_session(
    session: models.LiveSession = Depends(get_owned_session),
    db: DBSession = Depends(get_db),
):
    """Create a clean copy of an ended session."""

    new_session = models.LiveSession(
        title=f"{session.title} (copy)",
        facilitator_id=session.facilitator_id,
    )

    db.add(new_session)
    db.flush()

    for activity in session.activities:
        new_activity = models.Activity(
            session_id=new_session.id,
            type=activity.type,
            title=activity.title,
            order_index=activity.order_index,
        )

        db.add(new_activity)
        db.flush()

        for question in activity.questions:
            new_question = models.Question(
                activity_id=new_activity.id,
                prompt=question.prompt,
                order_index=question.order_index,
                question_type=question.question_type,
                mode=question.mode,
                settings=question.settings or {},
                section_title=question.section_title,
                section_description=question.section_description,
                has_correct_answer=question.has_correct_answer,
            )

            db.add(new_question)
            db.flush()

            for option in question.options:
                db.add(
                    models.Option(
                        question_id=new_question.id,
                        text=option.text,
                        order_index=option.order_index,
                        is_correct=option.is_correct,
                    )
                )

    db.commit()
    db.refresh(new_session)

    return new_session

# ---------- Public: participant-facing (no facilitator auth) ----------

@router.get("/by-code/{code}", response_model=schemas.SessionOut)
def get_session_by_code(code: str, db: DBSession = Depends(get_db)):
    session = db.query(models.LiveSession).filter(models.LiveSession.code == code.upper()).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No session found with that code")
    return session


@router.post("/by-code/{code}/join", response_model=schemas.ParticipantOut, status_code=status.HTTP_201_CREATED)
# Higher than the auth limits: a classroom/workshop full of participants can
# share one office/school NAT IP and all join within the same minute.
@limiter.limit("30/minute")
async def join_session(request: Request, code: str, payload: schemas.ParticipantJoin, db: DBSession = Depends(get_db)):
    session = db.query(models.LiveSession).filter(models.LiveSession.code == code.upper()).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No session found with that code")
    if session.status == models.SessionStatus.ended:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This session has ended")

    participant = models.Participant(session_id=session.id, display_name=payload.display_name)
    db.add(participant)
    db.commit()
    db.refresh(participant)

    await manager.broadcast(
        session.code,
        {"event": "participant_joined", "participant_count": len(session.participants)},
    )
    return participant


@router.get("/by-code/{code}/participants/{participant_id}/results", response_model=schemas.ParticipantResultOut)
def get_participant_results(code: str, participant_id: str, db: DBSession = Depends(get_db)):
    session = db.query(models.LiveSession).filter(models.LiveSession.code == code.upper()).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No session found with that code")

    participant = db.get(models.Participant, participant_id)
    if participant is None or participant.session_id != session.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found in this session")

    scores: dict[str, int] = {}
    answered: dict[str, int] = {}
    for p in session.participants:
        correct = sum(1 for r in p.responses if r.question.has_correct_answer and r.is_correct)
        total = sum(1 for r in p.responses if r.question.has_correct_answer)
        scores[p.id] = correct
        answered[p.id] = total

    ranked_ids = sorted(scores, key=lambda pid: scores[pid], reverse=True)
    rank = ranked_ids.index(participant.id) + 1 if scores else 1

    return schemas.ParticipantResultOut(
        display_name=participant.display_name,
        correct_count=scores.get(participant.id, 0),
        total_answered=answered.get(participant.id, 0),
        rank=rank,
        total_participants=len(session.participants),
    )
