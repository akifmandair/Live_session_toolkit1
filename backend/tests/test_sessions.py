def test_create_and_list_sessions(client, facilitator):
    headers, _ = facilitator

    create_res = client.post("/sessions", json={"title": "Intro to Networking"}, headers=headers)
    assert create_res.status_code == 201
    session = create_res.json()
    assert session["title"] == "Intro to Networking"
    assert session["status"] == "draft"
    assert len(session["code"]) >= 4

    list_res = client.get("/sessions", headers=headers)
    assert list_res.status_code == 200
    titles = [s["title"] for s in list_res.json()]
    assert "Intro to Networking" in titles


def test_sessions_are_scoped_to_their_facilitator(client, facilitator):
    headers_a, _ = facilitator
    client.post("/sessions", json={"title": "Facilitator A's session"}, headers=headers_a)

    res = client.post(
        "/auth/register",
        json={"name": "Other Facilitator", "email": "other-facilitator@example.com", "password": "password123"},
    )
    headers_b = {"Authorization": f"Bearer {res.json()['access_token']}"}

    list_res = client.get("/sessions", headers=headers_b)
    assert list_res.status_code == 200
    assert list_res.json() == []


def test_public_directory_filters_by_city_and_excludes_private_sessions(client, facilitator):
    headers, _ = facilitator

    client.post(
        "/sessions",
        json={"title": "Private session"},
        headers=headers,
    )
    client.post(
        "/sessions",
        json={"title": "Intro to Networking", "is_public": True, "city": "Karachi", "country": "Pakistan"},
        headers=headers,
    )

    all_public = client.get("/sessions/public")
    assert all_public.status_code == 200
    titles = [s["title"] for s in all_public.json()]
    assert "Intro to Networking" in titles
    assert "Private session" not in titles

    filtered = client.get("/sessions/public", params={"city": "karachi"})
    assert filtered.status_code == 200
    assert len(filtered.json()) == 1
    assert filtered.json()[0]["city"] == "Karachi"

    no_match = client.get("/sessions/public", params={"city": "Lahore"})
    assert no_match.status_code == 200
    assert no_match.json() == []


def test_join_session_by_code(client, facilitator):
    headers, _ = facilitator
    session = client.post("/sessions", json={"title": "Join me"}, headers=headers).json()

    join_res = client.post(
        f"/sessions/by-code/{session['code']}/join",
        json={"display_name": "Participant One"},
    )
    assert join_res.status_code == 201
    assert join_res.json()["display_name"] == "Participant One"


def test_join_with_unknown_code_returns_404(client):
    res = client.post("/sessions/by-code/ZZZZZZ/join", json={"display_name": "Nobody"})
    assert res.status_code == 404
