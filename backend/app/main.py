import logging

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from . import models
from .config import settings
from .database import Base, engine, migrate_legacy_schema
from .limiter import limiter
from .routers import activities, ai, auth, responses, results, sessions, ws, uploads

logger = logging.getLogger("app")

# For a first run this creates tables automatically. Once you're iterating
# on the schema for real, switch to Alembic migrations instead of relying
# on create_all.
Base.metadata.create_all(bind=engine)
migrate_legacy_schema()

if settings.secret_key == "dev-only-secret-change-me":
    logger.warning(
        "SECRET_KEY is still the placeholder value from .env.example. "
        "Fine for local dev — generate your own random value before deploying "
        "anywhere real users can reach (see backend/.env.example)."
    )

app = FastAPI(
    title="Live Session Toolkit API",
    description="Backend for creating and running interactive live polls and quizzes.",
    version="0.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sessions.router)
app.include_router(activities.router)
app.include_router(responses.router)
app.include_router(results.router)
app.include_router(ai.router)
app.include_router(ws.router)
app.include_router(uploads.router)
app.mount("/uploads", StaticFiles(directory=str(uploads.UPLOAD_DIR)), name="uploads")


@app.get("/health")
def health_check():
    return {"status": "ok"}
