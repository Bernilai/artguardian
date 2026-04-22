from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.dependencies import (
    get_current_active_user,
    get_current_user,
    get_optional_current_user,
    require_admin,
    require_curator_or_admin,
    require_restorer_curator_or_admin,
)


def make_user(role="viewer", is_active=True, user_id="user-123") -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.role = role
    user.is_active = is_active
    return user


def make_credentials(token="valid.token.here") -> MagicMock:
    creds = MagicMock(spec=HTTPAuthorizationCredentials)
    creds.credentials = token
    return creds


def make_db_with_user(user) -> AsyncMock:
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result)
    return db


async def test_get_current_user_valid_token_returns_user():
    user = make_user(user_id="user-abc")
    db = make_db_with_user(user)
    creds = make_credentials()
    with patch("app.dependencies.verify_access_token", return_value={"sub": "user-abc"}):
        out = await get_current_user(creds, db)
    assert out is user
    db.execute.assert_awaited_once()


async def test_get_current_user_invalid_token_raises_401():
    db = make_db_with_user(None)
    creds = make_credentials()
    with patch("app.dependencies.verify_access_token", return_value=None):
        with pytest.raises(HTTPException) as exc:
            await get_current_user(creds, db)
    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid authentication credentials"
    db.execute.assert_not_awaited()


async def test_get_current_user_user_not_found_raises_401():
    db = make_db_with_user(None)
    creds = make_credentials()
    with patch("app.dependencies.verify_access_token", return_value={"sub": "missing-id"}):
        with pytest.raises(HTTPException) as exc:
            await get_current_user(creds, db)
    assert exc.value.status_code == 401
    assert "not found" in exc.value.detail.lower()
    db.execute.assert_awaited_once()


async def test_get_current_active_user_active_returns_user():
    user = make_user(is_active=True)
    out = await get_current_active_user(user)
    assert out is user


async def test_get_current_active_user_inactive_raises_400():
    user = make_user(is_active=False)
    with pytest.raises(HTTPException) as exc:
        await get_current_active_user(user)
    assert exc.value.status_code == 400
    assert "inactive" in exc.value.detail.lower()


async def test_get_optional_current_user_no_credentials_returns_none():
    db = make_db_with_user(make_user())
    with patch("app.dependencies.verify_access_token", return_value={"sub": "user-123"}):
        out = await get_optional_current_user(None, db)
    assert out is None
    db.execute.assert_not_awaited()


async def test_get_optional_current_user_invalid_token_returns_none():
    db = make_db_with_user(make_user())
    creds = make_credentials()
    with patch("app.dependencies.verify_access_token", return_value=None):
        out = await get_optional_current_user(creds, db)
    assert out is None
    db.execute.assert_not_awaited()


async def test_get_optional_current_user_valid_token_user_found_returns_user():
    user = make_user(user_id="opt-user")
    db = make_db_with_user(user)
    creds = make_credentials()
    with patch("app.dependencies.verify_access_token", return_value={"sub": "opt-user"}):
        out = await get_optional_current_user(creds, db)
    assert out is user
    db.execute.assert_awaited_once()


async def test_get_optional_current_user_valid_token_user_not_in_db_returns_none():
    db = make_db_with_user(None)
    creds = make_credentials()
    with patch("app.dependencies.verify_access_token", return_value={"sub": "ghost-id"}):
        out = await get_optional_current_user(creds, db)
    assert out is None
    db.execute.assert_awaited_once()


async def test_require_admin_admin_role_returns_user():
    user = make_user(role="admin")
    out = await require_admin(user)
    assert out is user


@pytest.mark.parametrize("role", ["viewer", "curator", "restorer"])
async def test_require_admin_non_admin_raises_403(role):
    user = make_user(role=role)
    with pytest.raises(HTTPException) as exc:
        await require_admin(user)
    assert exc.value.status_code == 403


@pytest.mark.parametrize("role", ["curator", "admin"])
async def test_require_curator_or_admin_allowed_roles_return_user(role):
    user = make_user(role=role)
    out = await require_curator_or_admin(user)
    assert out is user


@pytest.mark.parametrize("role", ["viewer", "restorer"])
async def test_require_curator_or_admin_forbidden_roles_raise_403(role):
    user = make_user(role=role)
    with pytest.raises(HTTPException) as exc:
        await require_curator_or_admin(user)
    assert exc.value.status_code == 403


@pytest.mark.parametrize("role", ["restorer", "curator", "admin"])
async def test_require_restorer_curator_or_admin_allowed_roles_return_user(role):
    user = make_user(role=role)
    out = await require_restorer_curator_or_admin(user)
    assert out is user


async def test_require_restorer_curator_or_admin_viewer_raises_403():
    user = make_user(role="viewer")
    with pytest.raises(HTTPException) as exc:
        await require_restorer_curator_or_admin(user)
    assert exc.value.status_code == 403
    assert "viewer" in exc.value.detail.lower()
