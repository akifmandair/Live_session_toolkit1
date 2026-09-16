from unittest.mock import patch


def _create_and_launch_quiz(client, headers):
    session = client.post("/sessions", json={"title": "Geography Quiz"}, headers=headers).json()

    activity_payload = {
        "type": "quiz",
        "title": "Round 1",
        "questions": [
            {
                "prompt": "What is the capital of France?",
                "question_type": "multiple_choice",
                "mode": "quiz",
                "options": [
                    {"text": "Paris", "is_correct": True},
                    {"text": "Berlin", "is_correct": False},
                    {"text": "Madrid", "is_correct": False},
                ],
            },
            {
                "prompt": "Name the capital of Japan.",
                "question_type": "short_answer",
                "mode": "quiz",
                "settings": {"correct_answer": "Tokyo"},
            },
        ],
    }
    activity_res = client.post(f"/sessions/{session['id']}/activities", json=activity_payload, headers=headers)
    assert activity_res.status_code == 201, activity_res.text
    activity = activity_res.json()

    launch_res = client.post(f"/sessions/{session['id']}/activities/{activity['id']}/launch", headers=headers)
    assert launch_res.status_code == 200

    mc_question = next(q for q in activity["questions"] if q["question_type"] == "multiple_choice")
    sa_question = next(q for q in activity["questions"] if q["question_type"] == "short_answer")
    return session, activity, mc_question, sa_question


def _join(client, code, name="Participant"):
    res = client.post(f"/sessions/by-code/{code}/join", json={"display_name": name})
    assert res.status_code == 201
    return res.json()


def test_multiple_choice_is_auto_evaluated(client, facilitator):
    headers, _ = facilitator
    session, activity, mc_question, _sa_question = _create_and_launch_quiz(client, headers)
    participant = _join(client, session["code"])

    correct_option = next(o for o in mc_question["options"] if o["text"] == "Paris")
    res = client.post(
        f"/questions/{mc_question['id']}/responses",
        json={"participant_id": participant["id"], "option_id": correct_option["id"]},
    )
    assert res.status_code == 201
    assert res.json()["is_correct"] is True
    assert res.json()["answer_data"]["graded_by"] == "exact"


def test_multiple_choice_wrong_option_is_marked_incorrect(client, facilitator):
    headers, _ = facilitator
    session, activity, mc_question, _sa_question = _create_and_launch_quiz(client, headers)
    participant = _join(client, session["code"])

    wrong_option = next(o for o in mc_question["options"] if o["text"] == "Berlin")
    res = client.post(
        f"/questions/{mc_question['id']}/responses",
        json={"participant_id": participant["id"], "option_id": wrong_option["id"]},
    )
    assert res.status_code == 201
    assert res.json()["is_correct"] is False


def test_short_answer_exact_match_does_not_call_ai(client, facilitator):
    headers, _ = facilitator
    session, activity, _mc_question, sa_question = _create_and_launch_quiz(client, headers)
    participant = _join(client, session["code"])

    with patch("app.ai.grade_open_answer") as mock_grade:
        res = client.post(
            f"/questions/{sa_question['id']}/responses",
            json={"participant_id": participant["id"], "text_answer": "  tokyo  "},
        )
        mock_grade.assert_not_called()

    assert res.status_code == 201
    assert res.json()["is_correct"] is True
    assert res.json()["answer_data"]["graded_by"] == "exact"


def test_short_answer_falls_back_to_ai_when_not_an_exact_match(client, facilitator):
    headers, _ = facilitator
    session, activity, _mc_question, sa_question = _create_and_launch_quiz(client, headers)
    participant = _join(client, session["code"])

    with patch("app.ai.grade_open_answer", return_value=True) as mock_grade:
        res = client.post(
            f"/questions/{sa_question['id']}/responses",
            json={"participant_id": participant["id"], "text_answer": "it's the city of Tokyo, Japan"},
        )
        mock_grade.assert_called_once()

    assert res.status_code == 201
    assert res.json()["is_correct"] is True
    assert res.json()["answer_data"]["graded_by"] == "ai"


def test_short_answer_stays_incorrect_when_ai_is_unavailable(client, facilitator):
    """AI grading must never break submission — an unconfigured/erroring
    Gemini key should just leave the exact-match result (wrong) in place."""
    headers, _ = facilitator
    session, activity, _mc_question, sa_question = _create_and_launch_quiz(client, headers)
    participant = _join(client, session["code"])

    from app.ai import AIConfigError

    with patch("app.ai.grade_open_answer", side_effect=AIConfigError("no key configured")):
        res = client.post(
            f"/questions/{sa_question['id']}/responses",
            json={"participant_id": participant["id"], "text_answer": "some other city entirely"},
        )

    assert res.status_code == 201
    assert res.json()["is_correct"] is False
    assert res.json()["answer_data"]["graded_by"] == "exact"


def test_cannot_answer_the_same_question_twice(client, facilitator):
    headers, _ = facilitator
    session, activity, mc_question, _sa_question = _create_and_launch_quiz(client, headers)
    participant = _join(client, session["code"])
    option = mc_question["options"][0]

    first = client.post(
        f"/questions/{mc_question['id']}/responses",
        json={"participant_id": participant["id"], "option_id": option["id"]},
    )
    assert first.status_code == 201

    second = client.post(
        f"/questions/{mc_question['id']}/responses",
        json={"participant_id": participant["id"], "option_id": option["id"]},
    )
    assert second.status_code == 400


def test_results_and_leaderboard_reflect_scores(client, facilitator):
    headers, _ = facilitator
    session, activity, mc_question, sa_question = _create_and_launch_quiz(client, headers)
    participant = _join(client, session["code"], name="Scorer")

    correct_option = next(o for o in mc_question["options"] if o["text"] == "Paris")
    client.post(
        f"/questions/{mc_question['id']}/responses",
        json={"participant_id": participant["id"], "option_id": correct_option["id"]},
    )
    client.post(
        f"/questions/{sa_question['id']}/responses",
        json={"participant_id": participant["id"], "text_answer": "tokyo"},
    )

    results = client.get(f"/sessions/{session['id']}/results", headers=headers)
    assert results.status_code == 200
    body = results.json()

    entry = next(e for e in body["leaderboard"] if e["display_name"] == "Scorer")
    assert entry["correct_count"] == 2
    assert entry["total_answered"] == 2

    mc_result = next(
        q for a in body["activities"] for q in a["questions"] if q["question_id"] == mc_question["id"]
    )
    assert mc_result["accuracy_percent"] == 100.0
