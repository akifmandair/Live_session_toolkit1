from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SessionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    is_public: bool = False
    city: Optional[str] = Field(default=None, max_length=120)
    country: Optional[str] = Field(default=None, max_length=120)


class SessionUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    is_public: Optional[bool] = None
    city: Optional[str] = Field(default=None, max_length=120)
    country: Optional[str] = Field(default=None, max_length=120)


class SessionOut(BaseModel):
    id: str
    title: str
    code: str
    status: str
    created_at: datetime
    launched_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    is_public: bool = False
    city: Optional[str] = None
    country: Optional[str] = None
    model_config = {"from_attributes": True}


class SessionDetailOut(SessionOut):
    activities: list["ActivityOut"] = []
    participant_count: int = 0


class PublicSessionOut(BaseModel):
    id: str
    title: str
    code: str
    status: str
    city: Optional[str] = None
    country: Optional[str] = None
    facilitator_name: str
    participant_count: int = 0
    created_at: datetime
    model_config = {"from_attributes": True}


QUESTION_TYPES = {
    "short_answer", "paragraph", "multiple_choice", "checkboxes", "dropdown",
    "file_upload", "linear_scale", "rating", "multiple_choice_grid", "checkbox_grid"
}


class OptionCreate(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    is_correct: bool = False


class QuestionCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=500)
    question_type: str = Field(default="multiple_choice")
    mode: str = Field(default="quiz", pattern="^(poll|quiz)$")
    options: list[OptionCreate] = Field(default_factory=list, max_length=8)
    settings: dict[str, Any] = Field(default_factory=dict)
    section_title: Optional[str] = Field(default=None, max_length=160)
    section_description: Optional[str] = Field(default=None, max_length=1000)


class ActivityCreate(BaseModel):
    type: str = Field(default="quiz", pattern="^(poll|quiz)$")
    title: str = Field(default="Live activity", min_length=1, max_length=160)
    questions: list[QuestionCreate] = Field(min_length=1, max_length=20)

class ActivityUpdate(ActivityCreate):
    pass

class OptionOut(BaseModel):
    id: str
    text: str
    is_correct: bool
    model_config = {"from_attributes": True}


class QuestionOut(BaseModel):
    id: str
    prompt: str
    question_type: str
    mode: str
    has_correct_answer: bool
    settings: dict[str, Any] = {}
    section_title: Optional[str] = None
    section_description: Optional[str] = None
    options: list[OptionOut] = []
    model_config = {"from_attributes": True}


class ActivityOut(BaseModel):
    id: str
    type: str
    title: str
    is_launched: bool
    is_closed: bool
    questions: list[QuestionOut] = []
    model_config = {"from_attributes": True}


SessionDetailOut.model_rebuild()


class ParticipantJoin(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)


class ParticipantOut(BaseModel):
    id: str
    display_name: str
    session_id: str
    model_config = {"from_attributes": True}


class ResponseSubmit(BaseModel):
    participant_id: str
    option_id: Optional[str] = None
    selected_option_ids: list[str] = Field(default_factory=list)
    text_answer: Optional[str] = None
    numeric_answer: Optional[int] = None
    grid_answers: dict[str, Any] = Field(default_factory=dict)
    file_url: Optional[str] = None


class ResponseOut(BaseModel):
    id: str
    question_id: str
    option_id: Optional[str] = None
    answer_data: dict[str, Any] = {}
    is_correct: Optional[bool] = None
    model_config = {"from_attributes": True}


class OptionResultOut(BaseModel):
    option_id: str
    text: str
    is_correct: bool
    vote_count: int


class QuestionResultOut(BaseModel):
    question_id: str
    prompt: str
    question_type: str
    mode: str = "poll"
    total_responses: int
    options: list[OptionResultOut]
    text_responses: list[str] = []
    accuracy_percent: Optional[float] = None


class ActivityResultsOut(BaseModel):
    activity_id: str
    title: str
    type: str
    questions: list[QuestionResultOut]


class LeaderboardEntryOut(BaseModel):
    participant_id: str
    display_name: str
    correct_count: int
    total_answered: int


class SessionResultsOut(BaseModel):
    session_id: str
    title: str
    activities: list[ActivityResultsOut]
    leaderboard: list[LeaderboardEntryOut]


class ParticipantResultOut(BaseModel):
    display_name: str
    correct_count: int
    total_answered: int
    rank: int
    total_participants: int


class GenerateQuestionsRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=300)
    type: str = Field(pattern="^(poll|quiz)$")
    count: int = Field(ge=1, le=20, default=3)
    options_per_question: int = Field(ge=2, le=6, default=4)
    source_material: Optional[str] = Field(default=None, max_length=8000)


class GenerateQuestionsResponse(BaseModel):
    type: str
    questions: list[QuestionCreate]


class SessionSummaryOut(BaseModel):
    summary: str
