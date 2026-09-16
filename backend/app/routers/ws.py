from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import models
from ..database import SessionLocal
from ..ws_manager import manager

router = APIRouter()


def _current_state_event(code: str) -> dict | None:
    """Build the event a client would have missed by connecting after an
    activity was already launched (e.g. a participant joining mid-quiz, or
    reconnecting after a page refresh) — without this, they'd wait forever
    for a launch broadcast that already happened.
    """
    db = SessionLocal()
    try:
        session = db.query(models.LiveSession).filter(models.LiveSession.code == code).first()
        if session is None:
            return None
        if session.status == models.SessionStatus.ended:
            return {"event": "session_ended"}
        active = next((a for a in session.activities if a.is_launched and not a.is_closed), None)
        if active is None:
            return None
        return {
            "event": "activity_launched",
            "activity_id": active.id,
            "title": active.title,
            "type": active.type.value,
            "questions": [
                {
                    "id": q.id,
                    "prompt": q.prompt,
                    "question_type": q.question_type,
                    "mode": q.mode,
                    "settings": q.settings or {},
                    "options": [{"id": o.id, "text": o.text} for o in q.options],
                }
                for q in active.questions
            ],
        }
    finally:
        db.close()


@router.websocket("/ws/session/{code}")
async def session_socket(websocket: WebSocket, code: str):
    code = code.upper()
    await manager.connect(code, websocket)
    sync_event = _current_state_event(code)
    if sync_event:
        await websocket.send_json(sync_event)
    try:
        while True:
            # Facilitator/participant clients don't need to send anything;
            # this just keeps the connection open and detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(code, websocket)
