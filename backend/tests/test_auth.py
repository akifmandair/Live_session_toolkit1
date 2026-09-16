import uuid


def test_register_creates_account_and_returns_token(client):
    email = f"{uuid.uuid4().hex}@example.com"
    res = client.post(
        "/auth/register",
        json={"name": "Ada Lovelace", "email": email, "password": "password123"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["access_token"]
    assert body["user"]["email"] == email
    assert body["user"]["name"] == "Ada Lovelace"


def test_register_rejects_duplicate_email(client):
    email = f"{uuid.uuid4().hex}@example.com"
    payload = {"name": "Ada", "email": email, "password": "password123"}
    first = client.post("/auth/register", json=payload)
    assert first.status_code == 201

    second = client.post("/auth/register", json=payload)
    assert second.status_code == 400


def test_login_with_correct_credentials(client):
    email = f"{uuid.uuid4().hex}@example.com"
    client.post("/auth/register", json={"name": "Grace", "email": email, "password": "password123"})

    res = client.post("/auth/login", json={"email": email, "password": "password123"})
    assert res.status_code == 200
    assert res.json()["access_token"]


def test_login_with_wrong_password_is_rejected(client):
    email = f"{uuid.uuid4().hex}@example.com"
    client.post("/auth/register", json={"name": "Grace", "email": email, "password": "password123"})

    res = client.post("/auth/login", json={"email": email, "password": "wrong-password"})
    assert res.status_code == 401


def test_me_requires_a_valid_token(client, facilitator):
    headers, user = facilitator
    res = client.get("/auth/me", headers=headers)
    assert res.status_code == 200
    assert res.json()["id"] == user["id"]

    unauthenticated = client.get("/auth/me")
    assert unauthenticated.status_code == 401
