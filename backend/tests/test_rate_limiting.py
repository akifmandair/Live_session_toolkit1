def test_login_is_rate_limited_after_repeated_attempts(client):
    """Hammering /auth/login should eventually get a 429, not unlimited tries."""
    payload = {"email": "nobody@example.com", "password": "wrong-password"}

    statuses = [client.post("/auth/login", json=payload).status_code for _ in range(15)]

    assert 401 in statuses  # normal "wrong credentials" responses
    assert 429 in statuses  # the limiter kicked in before all 15 went through


def test_normal_usage_under_the_limit_is_unaffected(client, facilitator):
    """A handful of requests well under the limit should never be blocked."""
    headers, _ = facilitator
    for _ in range(3):
        res = client.get("/sessions", headers=headers)
        assert res.status_code == 200
