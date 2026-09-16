# Live Session Toolkit

A responsive web application for live interactive sessions, built around the PRD priorities: Interactive Polls & Quizzes, Instant Feedback, and Automatic Answer Evaluation.

## Stack

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: FastAPI + Python
- Database: PostgreSQL or SQLite for local development
- ORM: SQLAlchemy
- Real-time: WebSockets
- Auth: JWT
- Optional AI: Google Gemini API (free tier) — question generation, open-ended grading, and session summaries

## New Google-Forms-inspired authoring

The activity builder now supports:

- Quiz as the default mode, with an independent Quiz/Poll toggle on every question
- 1–20 questions per activity
- Short answer and paragraph responses
- Multiple choice, checkboxes, and drop-down
- File upload (10 MB local upload endpoint)
- Linear scale and rating
- Multiple-choice grid and tick-box grid
- Sections
- Image/video URL helpers
- Import questions from JSON or text
- Preview, undo/redo, theme toggle, and share/copy helpers

The existing core live-session flow remains: facilitator creates/launches an activity, participants join by code/QR, responses arrive through WebSockets, and supported quiz answers are evaluated automatically.

## Database migrations

Schema changes are managed with Alembic (`backend/alembic/`). For a fresh database (a new Postgres database, or a deleted local `dev.db`):

```bash
cd backend
alembic upgrade head
```

This creates all tables from the current models. When you change a model in `app/models.py`, generate a new migration instead of relying on `create_all`:

```bash
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

### Upgrading an old local database

If you have a `dev.db` from before Alembic was added to this project, the backend still runs its old compatibility migration (`migrate_legacy_schema()` in `app/database.py`) on startup, so it keeps working without extra steps. For a clean class-project database, deleting `backend/dev.db` and running `alembic upgrade head` (or just starting the backend, which calls `create_all`) is also fine.
