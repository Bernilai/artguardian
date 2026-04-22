import re
from datetime import datetime, timedelta, timezone

from freezegun import freeze_time

from app.config import settings
from app.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_access_token,
    verify_password,
)


def test_get_password_hash_hash_not_equal_plain_password():
    plain = "my-secret-password"
    hashed = get_password_hash(plain)
    assert hashed != plain


def test_verify_password_returns_true_for_correct_password():
    plain = "correct-horse-battery-staple"
    hashed = get_password_hash(plain)
    assert verify_password(plain, hashed) is True


def test_verify_password_returns_false_for_wrong_password():
    hashed = get_password_hash("original-password")
    assert verify_password("wrong-password", hashed) is False


def test_get_password_hash_two_hashes_same_password_not_equal():
    plain = "same-password-twice"
    first = get_password_hash(plain)
    second = get_password_hash(plain)
    assert first != second


def test_create_access_token_returns_nonempty_string():
    token = create_access_token({"sub": "user-1"})
    assert isinstance(token, str)
    assert len(token) > 0


def test_create_access_token_payload_contains_sub():
    subject = "expected-subject-id"
    token = create_access_token({"sub": subject})
    payload = verify_access_token(token)
    assert payload is not None
    assert payload["sub"] == subject


def test_create_access_token_payload_contains_exp():
    token = create_access_token({"sub": "user-exp"})
    payload = verify_access_token(token)
    assert payload is not None
    assert "exp" in payload


def test_create_access_token_expires_after_configured_lifetime():
    frozen = datetime(2025, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    with freeze_time(frozen):
        token = create_access_token({"sub": "lifetime-user"})
    later = frozen + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES + 1)
    with freeze_time(later):
        assert verify_access_token(token) is None


def test_create_access_token_embeds_custom_data():
    token = create_access_token({"sub": "u1", "custom_claim": "embedded-value"})
    payload = verify_access_token(token)
    assert payload is not None
    assert payload["custom_claim"] == "embedded-value"


def test_create_refresh_token_returns_nonempty_string():
    token = create_refresh_token()
    assert isinstance(token, str)
    assert len(token) > 0


def test_create_refresh_token_is_urlsafe_random_not_jwt():
    token = create_refresh_token()
    assert re.fullmatch(r"[A-Za-z0-9_-]+", token)
    assert token.count(".") != 2


def test_verify_access_token_returns_payload_for_valid_token():
    token = create_access_token({"sub": "valid-user"})
    payload = verify_access_token(token)
    assert payload is not None and payload["sub"] == "valid-user"


def test_verify_access_token_returns_none_for_expired_token():
    token = create_access_token({"sub": "expired-user"}, expires_delta=timedelta(minutes=-5))
    assert verify_access_token(token) is None


def test_verify_access_token_returns_none_for_tampered_token():
    token = create_access_token({"sub": "tamper-user"})
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    assert verify_access_token(tampered) is None


def test_verify_access_token_returns_none_for_malformed_token():
    assert verify_access_token("not-a-valid-jwt-structure") is None
