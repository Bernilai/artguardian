"""Integration tests for app.api.auth (HTTP API + real DB session from conftest)."""

from __future__ import annotations

import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import hash_token
from app.database import get_db
from app.main import app
from app.models import RefreshToken, User
from app.security import create_access_token, get_password_hash
from tests.conftest import _create_user

AUTH_BASE = "/api/auth"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def _ensure_clean_db(db_session: AsyncSession) -> None:
    await db_session.execute(delete(RefreshToken))
    await db_session.execute(delete(User))
    await db_session.commit()


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession, _ensure_clean_db: None) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def viewer_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "viewer", "fixture")


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "admin", "fixture")


@pytest_asyncio.fixture
async def curator_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "curator", "fixture")


@pytest_asyncio.fixture
async def viewer_token(viewer_user: User) -> str:
    return create_access_token({"sub": viewer_user.id, "email": viewer_user.email})


@pytest_asyncio.fixture
async def admin_token(admin_user: User) -> str:
    return create_access_token({"sub": admin_user.id, "email": admin_user.email})


def _set_cookie_values(response) -> list[str]:
    out: list[str] = []
    for key, val in response.headers.multi_items():
        if key.lower() == "set-cookie":
            out.append(val)
    return out


def _has_refresh_token_set_cookie(response) -> bool:
    for raw in _set_cookie_values(response):
        if raw.lower().startswith("refresh_token="):
            return True
    return False


# --- POST /register ---


@pytest.mark.asyncio
async def test_register_valid_defaults_to_viewer(async_client: AsyncClient):
    email = f"reg_{uuid.uuid4().hex[:12]}@example.com"
    body = {
        "email": email,
        "name": "Мария",
        "password": "Secret123!",
    }
    with patch("app.utils.notifications.notify_user_created", new=AsyncMock()):
        r = await async_client.post(f"{AUTH_BASE}/register", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == email.lower()
    assert data["role"] == "viewer"


@pytest.mark.asyncio
async def test_register_duplicate_email_400(async_client: AsyncClient, viewer_user: User):
    body = {
        "email": viewer_user.email,
        "name": "Пётр",
        "password": "Secret123!",
    }
    with patch("app.utils.notifications.notify_user_created", new=AsyncMock()):
        r = await async_client.post(f"{AUTH_BASE}/register", json=body)
    assert r.status_code == 400
    assert "already registered" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_register_with_explicit_role(async_client: AsyncClient):
    email = f"cur_{uuid.uuid4().hex[:12]}@example.com"
    body = {
        "email": email,
        "name": "Анна",
        "password": "Secret123!",
        "role": "curator",
    }
    with patch("app.utils.notifications.notify_user_created", new=AsyncMock()):
        r = await async_client.post(f"{AUTH_BASE}/register", json=body)
    assert r.status_code == 200
    assert r.json()["role"] == "curator"


@pytest.mark.asyncio
async def test_register_calls_notify_user_created_once(async_client: AsyncClient):
    email = f"ntf_{uuid.uuid4().hex[:12]}@example.com"
    body = {
        "email": email,
        "name": "Олег",
        "password": "Secret123!",
    }
    mock_notify = AsyncMock()
    with patch("app.utils.notifications.notify_user_created", new=mock_notify):
        r = await async_client.post(f"{AUTH_BASE}/register", json=body)
    assert r.status_code == 200
    assert mock_notify.await_count == 1


# --- POST /login ---


@pytest.mark.asyncio
async def test_login_valid_returns_bearer_and_access_token(async_client: AsyncClient, viewer_user: User):
    r = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["user"]["email"] == viewer_user.email


@pytest.mark.asyncio
async def test_login_wrong_password_401(async_client: AsyncClient, viewer_user: User):
    r = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "wrongpassword1"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email_401(async_client: AsyncClient):
    r = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": f"missing_{uuid.uuid4().hex}@example.com", "password": "testpassword123"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_user_400(async_client: AsyncClient, db_session: AsyncSession):
    email = f"inact_{uuid.uuid4().hex[:10]}@example.com"
    user = User(
        email=email,
        hashed_password=get_password_hash("testpassword123"),
        name="Иван",
        role="viewer",
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()
    r = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": email, "password": "testpassword123"},
    )
    assert r.status_code == 400
    assert "inactive" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_first_time_sets_refresh_cookie(async_client: AsyncClient, viewer_user: User):
    r = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    assert r.status_code == 200
    assert _has_refresh_token_set_cookie(r)


@pytest.mark.asyncio
async def test_login_second_time_reuses_token_no_new_refresh_cookie(
    async_client: AsyncClient, viewer_user: User
):
    r1 = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    assert r1.status_code == 200
    assert _has_refresh_token_set_cookie(r1)
    r2 = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    assert r2.status_code == 200
    assert not _has_refresh_token_set_cookie(r2)


# --- POST /refresh ---


@pytest.mark.asyncio
async def test_refresh_valid_cookie_200(async_client: AsyncClient, viewer_user: User):
    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    assert r_login.status_code == 200
    r = await async_client.post(f"{AUTH_BASE}/refresh")
    assert r.status_code == 200
    data = r.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]


@pytest.mark.asyncio
async def test_refresh_missing_cookie_401(async_client: AsyncClient, viewer_user: User):
    async with AsyncClient(
        transport=async_client._transport,
        base_url=async_client.base_url,
    ) as bare_client:
        r = await bare_client.post(f"{AUTH_BASE}/refresh")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_refresh_tampered_cookie_401(async_client: AsyncClient, viewer_user: User):
    await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as bare:
        r = await bare.post(
            f"{AUTH_BASE}/refresh",
            cookies={"refresh_token": "not-a-valid-token-value"},
        )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_refresh_revoked_token_401(async_client: AsyncClient, viewer_user: User):
    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    assert r_login.status_code == 200
    cookie_val = r_login.cookies.get("refresh_token")
    assert cookie_val
    await async_client.post(f"{AUTH_BASE}/logout")
    r = await async_client.post(
        f"{AUTH_BASE}/refresh",
        cookies={"refresh_token": cookie_val},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_refresh_inactive_user_400(
    async_client: AsyncClient, viewer_user: User, admin_token: str
):
    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    assert r_login.status_code == 200
    r_deact = await async_client.put(
        f"{AUTH_BASE}/users/{viewer_user.id}",
        headers=auth_headers(admin_token),
        json={"is_active": False},
    )
    assert r_deact.status_code == 200
    r = await async_client.post(f"{AUTH_BASE}/refresh")
    assert r.status_code == 400
    assert "inactive" in r.json()["detail"].lower()


# --- POST /logout ---


@pytest.mark.asyncio
async def test_logout_with_valid_cookie_revokes_db_token(
    async_client: AsyncClient, viewer_user: User, db_session: AsyncSession
):
    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    assert r_login.status_code == 200
    token_hash = hash_token(r_login.cookies["refresh_token"])
    r = await async_client.post(f"{AUTH_BASE}/logout")
    assert r.status_code == 200
    row = await db_session.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    db_token = row.scalar_one_or_none()
    assert db_token is not None
    assert db_token.revoked is True


@pytest.mark.asyncio
async def test_logout_without_cookie_still_200(async_client: AsyncClient):
    async with AsyncClient(
        transport=async_client._transport,
        base_url=async_client.base_url,
    ) as bare_client:
        r = await bare_client.post(f"{AUTH_BASE}/logout")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_logout_then_refresh_same_cookie_401(async_client: AsyncClient, viewer_user: User):
    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    cookie_val = r_login.cookies["refresh_token"]
    await async_client.post(f"{AUTH_BASE}/logout")
    r = await async_client.post(
        f"{AUTH_BASE}/refresh",
        cookies={"refresh_token": cookie_val},
    )
    assert r.status_code == 401


# --- GET /me ---


@pytest.mark.asyncio
async def test_me_authenticated_200(async_client: AsyncClient, viewer_user: User, viewer_token: str):
    r = await async_client.get(f"{AUTH_BASE}/me", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == viewer_user.id
    assert data["email"] == viewer_user.email


@pytest.mark.asyncio
async def test_me_no_credentials_401(async_client: AsyncClient):
    r = await async_client.get(f"{AUTH_BASE}/me")
    assert r.status_code == 401


# --- GET /users ---


@pytest.mark.asyncio
async def test_users_any_authenticated_200(
    async_client: AsyncClient, viewer_user: User, admin_user: User, viewer_token: str
):
    r = await async_client.get(f"{AUTH_BASE}/users", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    data = r.json()
    assert "users" in data
    emails = {u["email"] for u in data["users"]}
    assert viewer_user.email in emails
    assert admin_user.email in emails


@pytest.mark.asyncio
async def test_users_filter_role_admin_only(
    async_client: AsyncClient, viewer_user: User, admin_user: User, viewer_token: str
):
    r = await async_client.get(
        f"{AUTH_BASE}/users",
        params={"role": "admin"},
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 200
    users = r.json()["users"]
    assert all(u["role"] == "admin" for u in users)
    assert any(u["email"] == admin_user.email for u in users)
    assert all(u["email"] != viewer_user.email for u in users)


@pytest.mark.asyncio
async def test_users_include_inactive_true(
    async_client: AsyncClient, viewer_user: User, viewer_token: str, db_session: AsyncSession
):
    hidden_email = f"hid_{uuid.uuid4().hex[:10]}@example.com"
    u = User(
        email=hidden_email,
        hashed_password=get_password_hash("testpassword123"),
        name="Скрытый",
        role="viewer",
        is_active=False,
    )
    db_session.add(u)
    await db_session.commit()

    r_active = await async_client.get(f"{AUTH_BASE}/users", headers=auth_headers(viewer_token))
    r_all = await async_client.get(
        f"{AUTH_BASE}/users",
        params={"include_inactive": "true"},
        headers=auth_headers(viewer_token),
    )
    assert r_active.status_code == 200
    assert r_all.status_code == 200
    active_emails = {x["email"] for x in r_active.json()["users"]}
    all_emails = {x["email"] for x in r_all.json()["users"]}
    assert hidden_email not in active_emails
    assert hidden_email in all_emails


@pytest.mark.asyncio
async def test_users_unauthenticated_401(async_client: AsyncClient):
    r = await async_client.get(f"{AUTH_BASE}/users")
    assert r.status_code == 401


# --- PUT /users/{id} ---


@pytest.mark.asyncio
async def test_put_user_admin_updates_role(
    async_client: AsyncClient, viewer_user: User, admin_token: str
):
    r = await async_client.put(
        f"{AUTH_BASE}/users/{viewer_user.id}",
        headers=auth_headers(admin_token),
        json={"role": "curator"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "curator"


@pytest.mark.asyncio
async def test_put_user_non_admin_403(
    async_client: AsyncClient, viewer_user: User, curator_user: User, viewer_token: str
):
    r = await async_client.put(
        f"{AUTH_BASE}/users/{curator_user.id}",
        headers=auth_headers(viewer_token),
        json={"role": "viewer"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_put_user_admin_self_deactivate_400(async_client: AsyncClient, admin_user: User, admin_token: str):
    r = await async_client.put(
        f"{AUTH_BASE}/users/{admin_user.id}",
        headers=auth_headers(admin_token),
        json={"is_active": False},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_put_user_admin_missing_user_404(async_client: AsyncClient, admin_token: str):
    missing_id = str(uuid.uuid4())
    r = await async_client.put(
        f"{AUTH_BASE}/users/{missing_id}",
        headers=auth_headers(admin_token),
        json={"name": "Никто"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_put_user_admin_updates_name(
    async_client: AsyncClient, viewer_user: User, admin_token: str
):
    r = await async_client.put(
        f"{AUTH_BASE}/users/{viewer_user.id}",
        headers=auth_headers(admin_token),
        json={"name": "Новое Имя"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Новое Имя"


# --- DELETE /users/{id} ---


@pytest.mark.asyncio
async def test_delete_user_admin_soft_deletes(
    async_client: AsyncClient, viewer_user: User, admin_token: str, db_session: AsyncSession
):
    r = await async_client.delete(
        f"{AUTH_BASE}/users/{viewer_user.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    await db_session.refresh(viewer_user)
    row = await db_session.execute(select(User).where(User.id == viewer_user.id))
    u = row.scalar_one()
    assert u.is_active is False


@pytest.mark.asyncio
async def test_delete_user_non_admin_403(
    async_client: AsyncClient, curator_user: User, viewer_token: str
):
    r = await async_client.delete(
        f"{AUTH_BASE}/users/{curator_user.id}",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_delete_user_admin_self_400(async_client: AsyncClient, admin_user: User, admin_token: str):
    r = await async_client.delete(
        f"{AUTH_BASE}/users/{admin_user.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 400


# --- POST /change-password ---


@pytest.mark.asyncio
async def test_change_password_success(async_client: AsyncClient, viewer_user: User, viewer_token: str):
    with patch("app.api.auth.notify_password_changed", new=AsyncMock()):
        r = await async_client.post(
            f"{AUTH_BASE}/change-password",
            headers=auth_headers(viewer_token),
            json={"current_password": "testpassword123", "new_password": "Newpass123!"},
        )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current_400(async_client: AsyncClient, viewer_token: str):
    with patch("app.api.auth.notify_password_changed", new=AsyncMock()):
        r = await async_client.post(
            f"{AUTH_BASE}/change-password",
            headers=auth_headers(viewer_token),
            json={"current_password": "wrongpassword1", "new_password": "Newpass123!"},
        )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_change_password_new_same_as_current_400(async_client: AsyncClient, viewer_token: str):
    with patch("app.api.auth.notify_password_changed", new=AsyncMock()):
        r = await async_client.post(
            f"{AUTH_BASE}/change-password",
            headers=auth_headers(viewer_token),
            json={"current_password": "testpassword123", "new_password": "testpassword123"},
        )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_admin_change_user_password_success(
    async_client: AsyncClient, viewer_user: User, admin_token: str
):
    with patch("app.api.auth.notify_password_changed", new=AsyncMock()):
        r = await async_client.post(
            f"{AUTH_BASE}/users/{viewer_user.id}/change-password",
            headers=auth_headers(admin_token),
            json={"new_password": "Adminset999!"},
        )
    assert r.status_code == 200
    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "Adminset999!"},
    )
    assert r_login.status_code == 200


@pytest.mark.asyncio
async def test_admin_change_user_password_non_admin_403(
    async_client: AsyncClient, admin_user: User, viewer_token: str
):
    with patch("app.api.auth.notify_password_changed", new=AsyncMock()):
        r = await async_client.post(
            f"{AUTH_BASE}/users/{admin_user.id}/change-password",
            headers=auth_headers(viewer_token),
            json={"new_password": "Shouldfail9!"},
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_change_user_password_new_same_as_current_400(
    async_client: AsyncClient, viewer_user: User, admin_token: str
):
    with patch("app.api.auth.notify_password_changed", new=AsyncMock()):
        r = await async_client.post(
            f"{AUTH_BASE}/users/{viewer_user.id}/change-password",
            headers=auth_headers(admin_token),
            json={"new_password": "testpassword123"},
        )
    assert r.status_code == 400


# --- POST /revoke-all ---


@pytest.mark.asyncio
async def test_revoke_all_revokes_active_tokens(
    async_client: AsyncClient, viewer_user: User, viewer_token: str, db_session: AsyncSession
):
    await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    r = await async_client.post(f"{AUTH_BASE}/revoke-all", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    data = r.json()
    assert data["revoked_count"] >= 1
    active = await db_session.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == viewer_user.id,
            RefreshToken.revoked.is_(False),
        )
    )
    assert active.scalars().all() == []


@pytest.mark.asyncio
async def test_revoke_all_no_active_tokens_revoked_count_zero(
    async_client: AsyncClient, viewer_token: str
):
    r = await async_client.post(f"{AUTH_BASE}/revoke-all", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    assert r.json()["revoked_count"] == 0


# --- GET /sessions ---


@pytest.mark.asyncio
async def test_sessions_lists_active_fields(async_client: AsyncClient, viewer_user: User, viewer_token: str):
    await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    r = await async_client.get(f"{AUTH_BASE}/sessions", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    payload = r.json()
    assert "sessions" in payload
    assert payload["total"] >= 1
    s0 = payload["sessions"][0]
    assert "id" in s0 and s0["id"]
    assert "expires_at" in s0
    assert "device_info" in s0


# --- DELETE /sessions/{id} ---


@pytest.mark.asyncio
async def test_delete_session_own_200(async_client: AsyncClient, viewer_user: User, viewer_token: str):
    await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": viewer_user.email, "password": "testpassword123"},
    )
    r_list = await async_client.get(f"{AUTH_BASE}/sessions", headers=auth_headers(viewer_token))
    sid = r_list.json()["sessions"][0]["id"]
    r = await async_client.delete(
        f"{AUTH_BASE}/sessions/{sid}",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_delete_session_missing_404(async_client: AsyncClient, viewer_user: User, viewer_token: str):
    r = await async_client.delete(
        f"{AUTH_BASE}/sessions/{uuid.uuid4()}",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_auth_options_handlers_return_ok(async_client: AsyncClient):
    for suffix in ("/register", "/login", "/refresh", "/logout"):
        r = await async_client.options(f"{AUTH_BASE}{suffix}")
        assert r.status_code == 200
        assert r.json() == {"message": "OK"}
