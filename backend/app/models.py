import enum
import secrets
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship

from .database import Base


def gen_id() -> str:
    return uuid.uuid4().hex


def gen_session_code(length: int = 6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


class ActivityType(str, enum.Enum):
    poll = "poll"
    quiz = "quiz"


class SessionStatus(str, enum.Enum):
    draft = "draft"
    live = "live"
    ended = "ended"


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    sessions = relationship("LiveSession", back_populates="facilitator", cascade="all, delete-orphan")


class LiveSession(Base):
    __tablename__ = "sessions"
    id = Column(String, primary_key=True, default=gen_id)
    title = Column(String, nullable=False)
    code = Column(String(8), unique=True, index=True, default=gen_session_code)
    status = Column(Enum(SessionStatus), default=SessionStatus.draft, nullable=False)
    facilitator_id = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    launched_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    # Public discovery: facilitators can opt in to listing a session in the
    # public directory so participants can search/browse instead of only
    # joining via a shared code/QR.
    is_public = Column(Boolean, default=False, nullable=False)
    city = Column(String, nullable=True)
    country = Column(String, nullable=True)
    facilitator = relationship("User", back_populates="sessions")
    activities = relationship("Activity", back_populates="session", cascade="all, delete-orphan", order_by="Activity.order_index")
    participants = relationship("Participant", back_populates="session", cascade="all, delete-orphan")


class Activity(Base):
    __tablename__ = "activities"
    id = Column(String, primary_key=True, default=gen_id)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    type = Column(Enum(ActivityType), nullable=False, default=ActivityType.quiz)
    title = Column(String, nullable=False, default="Live activity")
    order_index = Column(Integer, default=0)
    is_launched = Column(Boolean, default=False)
    is_closed = Column(Boolean, default=False)
    launched_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    session = relationship("LiveSession", back_populates="activities")
    questions = relationship("Question", back_populates="activity", cascade="all, delete-orphan", order_by="Question.order_index")


class Question(Base):
    __tablename__ = "questions"
    id = Column(String, primary_key=True, default=gen_id)
    activity_id = Column(String, ForeignKey("activities.id"), nullable=False)
    prompt = Column(Text, nullable=False)
    order_index = Column(Integer, default=0)
    # Google-Forms-inspired question type. Examples: multiple_choice, short_answer, rating.
    question_type = Column(String, nullable=False, default="multiple_choice")
    # Each question independently behaves as a quiz or poll.
    mode = Column(String, nullable=False, default="quiz")
    # Flexible settings: scale limits, grid rows/columns, correct text/value, media URLs, etc.
    settings = Column(JSON, nullable=True, default=dict)
    section_title = Column(String, nullable=True)
    section_description = Column(Text, nullable=True)
    has_correct_answer = Column(Boolean, default=False)
    activity = relationship("Activity", back_populates="questions")
    options = relationship("Option", back_populates="question", cascade="all, delete-orphan", order_by="Option.order_index")
    responses = relationship("ResponseRecord", back_populates="question", cascade="all, delete-orphan")


class Option(Base):
    __tablename__ = "options"
    id = Column(String, primary_key=True, default=gen_id)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    text = Column(String, nullable=False)
    order_index = Column(Integer, default=0)
    is_correct = Column(Boolean, default=False)
    question = relationship("Question", back_populates="options")


class Participant(Base):
    __tablename__ = "participants"
    id = Column(String, primary_key=True, default=gen_id)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    display_name = Column(String, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)
    session = relationship("LiveSession", back_populates="participants")
    responses = relationship("ResponseRecord", back_populates="participant", cascade="all, delete-orphan")


class ResponseRecord(Base):
    __tablename__ = "responses"
    id = Column(String, primary_key=True, default=gen_id)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    participant_id = Column(String, ForeignKey("participants.id"), nullable=False)
    option_id = Column(String, ForeignKey("options.id"), nullable=True)
    # Stores all non-option answers in one JSON payload so the API can support many form types.
    answer_data = Column(JSON, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    is_correct = Column(Boolean, nullable=True)
    question = relationship("Question", back_populates="responses")
    participant = relationship("Participant", back_populates="responses")
    option = relationship("Option")
