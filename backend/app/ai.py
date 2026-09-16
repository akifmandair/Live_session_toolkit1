import json

from google import genai
from google.genai import types

from .config import settings


class AIConfigError(Exception):
    """Raised when Gemini AI is not configured."""


class AIResponseError(Exception):
    """Raised when Gemini returns an unusable response."""


_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client

    if not settings.gemini_api_key:
        raise AIConfigError(
            "AI features need GEMINI_API_KEY set in the backend's .env file."
        )

    if _client is None:
        _client = genai.Client(api_key=settings.gemini_api_key)

    return _client


def generate_questions(
    topic: str,
    activity_type: str,
    count: int,
    options_per_question: int = 4,
    source_material: str | None = None,
) -> list[dict]:
    """
    Generate classroom-ready questions using Gemini.

    When source_material is provided (e.g. pasted lecture notes/slides text),
    questions are derived from that material rather than just the topic
    label — this covers the PRD's "suggest questions based on session
    content" AI requirement.

    Returns:
    [
        {
            "prompt": "...",
            "options": [
                {"text": "...", "is_correct": true},
                {"text": "...", "is_correct": false}
            ]
        }
    ]
    """

    client = _get_client()

    if count < 1 or count > 20:
        raise ValueError("Question count must be between 1 and 20.")

    if activity_type == "quiz":
        correctness_rule = (
            'Each question must have exactly ONE correct option. '
            'Set "is_correct": true for the correct option and false for all others.'
        )
    else:
        correctness_rule = (
            'This is a poll, not a quiz. '
            'Set "is_correct": false for every option.'
        )

    source_material = (source_material or "").strip()
    if source_material:
        content_instructions = f"""
Base the questions directly on the material below — reference specific facts,
terms, and details from it rather than writing generic questions. Use the
topic label only for framing/context.

Topic label: {topic}

Source material:
{source_material}
"""
    else:
        content_instructions = f"""
Create {count} {activity_type} question(s) about:

{topic}
"""

    prompt = f"""
{content_instructions}

Requirements:

- Create exactly {count} {activity_type} question(s).
- Each question must have exactly {options_per_question} options.
- Questions must be clear and suitable for a classroom or live session.
- Keep questions concise.
- Do not duplicate questions.
- {correctness_rule}

Return ONLY a JSON array in this exact structure:

[
  {{
    "prompt": "Question text",
    "options": [
      {{
        "text": "Option 1",
        "is_correct": false
      }},
      {{
        "text": "Option 2",
        "is_correct": true
      }},
      {{
        "text": "Option 3",
        "is_correct": false
      }},
      {{
        "text": "Option 4",
        "is_correct": false
      }}
    ]
  }}
]
"""

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.7,
            ),
        )
    except Exception as exc:
        raise AIResponseError(
            f"Gemini request failed: {exc}"
        ) from exc

    text = (response.text or "").strip()

    if not text:
        raise AIResponseError("Gemini returned an empty response.")

    try:
        questions = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIResponseError(
            f"Gemini didn't return valid JSON: {exc}"
        ) from exc

    if not isinstance(questions, list) or not questions:
        raise AIResponseError(
            "Gemini didn't return a non-empty list of questions."
        )

    for question in questions:
        if not isinstance(question, dict):
            raise AIResponseError("Gemini returned a malformed question.")

        if "prompt" not in question or "options" not in question:
            raise AIResponseError(
                "Gemini returned a question without prompt/options."
            )

        if not isinstance(question["options"], list):
            raise AIResponseError(
                "Gemini returned invalid question options."
            )

        if activity_type == "quiz":
            correct_options = [
                option
                for option in question["options"]
                if option.get("is_correct") is True
            ]

            if len(correct_options) == 0:
                question["options"][0]["is_correct"] = True

            elif len(correct_options) > 1:
                found = False

                for option in question["options"]:
                    if option.get("is_correct") is True:
                        if not found:
                            found = True
                        else:
                            option["is_correct"] = False

    return questions


def grade_open_answer(
    prompt: str,
    expected_answer: str,
    submitted_answer: str,
) -> bool:
    """
    Ask Gemini whether a free-text answer is semantically correct.

    Only called as a fallback when a plain normalized string match already
    failed — this catches answers that mean the same thing but are phrased
    differently ("Paris" vs "the capital is paris, france"). Raises
    AIConfigError/AIResponseError like the other AI functions; callers should
    treat those as "couldn't confirm" rather than a hard failure.
    """

    client = _get_client()

    grading_prompt = f"""
You are grading a short-answer question from a live classroom quiz.

Question:
{prompt}

Expected (correct) answer:
{expected_answer}

Participant's submitted answer:
{submitted_answer}

Decide if the submitted answer is correct. It does not need to match the
expected answer word-for-word — accept answers that are factually/semantically
equivalent, including minor spelling issues, different phrasing, extra words,
or different capitalization. Reject answers that are wrong, blank, off-topic,
or only partially correct.

Return ONLY a JSON object in this exact structure, with no other text:

{{"correct": true}}

or

{{"correct": false}}
"""

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=grading_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0,
            ),
        )
    except Exception as exc:
        raise AIResponseError(f"Gemini request failed: {exc}") from exc

    text = (response.text or "").strip()
    if not text:
        raise AIResponseError("Gemini returned an empty grading response.")

    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIResponseError(f"Gemini didn't return valid JSON: {exc}") from exc

    if not isinstance(result, dict) or "correct" not in result:
        raise AIResponseError("Gemini returned a malformed grading response.")

    return bool(result["correct"])


def summarize_session(
    title: str,
    activities: list[dict],
    leaderboard: list[dict],
) -> str:
    """
    Generate a facilitator-facing summary of session results.
    """

    client = _get_client()

    data = {
        "title": title,
        "activities": activities,
        "leaderboard": leaderboard,
    }

    prompt = f"""
You are analyzing results from a live classroom session.

Session title:
{title}

Session data:
{json.dumps(data, indent=2)}

Write a concise facilitator-facing summary.

Cover:

1. Overall participant engagement.
2. Questions that many participants got wrong.
3. Important patterns in the responses.
4. One concrete recommendation for what the facilitator should revisit.

Keep the summary between 120 and 180 words.

Return plain text only.
Do not use markdown headings.
"""

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.5,
            ),
        )
    except Exception as exc:
        raise AIResponseError(
            f"Gemini request failed: {exc}"
        ) from exc

    text = (response.text or "").strip()

    if not text:
        raise AIResponseError(
            "Gemini returned an empty summary."
        )

    return text