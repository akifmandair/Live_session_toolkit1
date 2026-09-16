"""Shared pytest fixtures for the backend test suite.

Runs entirely against a throwaway SQLite file (never the real dev.db) and
overrides FastAPI's get_db dependency so tests never touch application state.
No network calls are made — any AI-backed code path under test must be
mocked (see test_activities_and_responses.py for the pattern).
"""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

# Point at a throwaway SQLite file before importing the app, so
# app.config.settings (and app.database's engine, built from it) picks this
# up at import time instead of the real dev.db.
TEST_DB_PATH = f"./test_{uuid.uuid4().hex}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"

from app.database import Base, SessionLocal, engine, get_db  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)


@pytest.fixture()
def client():
    def _override_get_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    # All TestClient requests share one fake IP, so the rate limiter's
    # in-memory counters must be reset between tests — otherwise tests bleed
    # into each other's limits, which is what the limiter is correctly doing
    # in production (see app/limiter.py) but not what we want per-test here.
    limiter.reset()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def facilitator(client):
    """Register a facilitator and return (headers, user_json)."""
    res = client.post(
        "/auth/register",
        json={"name": "Test Facilitator", "email": f"{uuid.uuid4().hex}@example.com", "password": "password123"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    return headers, body["user"]
