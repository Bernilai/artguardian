"""Integration tests for app.api.ai_preferences."""

from __future__ import annotations

from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models import (
    AIPreferences,
    Artifact,
    Detection,
    Notification,
    NotificationPreferences,
    RefreshToken,
    Ticket,
    User,
)
from app.security import create_access_token
from tests.conftest import _create_user

AI_BASE = "/api/ai"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _detail_contains_min_confidence(response) -> None:
    detail = response.json().get("detail", "")
    if isinstance(detail, list):
        text = " ".join(str(item) for item in detail)
    else:
        text = str(detail)
    assert "min_confidence" in text


@pytest_asyncio.fixture
async def _ensure_clean_db(db_session: AsyncSession) -> None:
    await db_session.execute(delete(Notification))
    await db_session.execute(delete(NotificationPreferences))
    await db_session.execute(delete(AIPreferences))
    await db_session.execute(delete(Detection))
    await db_session.execute(delete(Ticket))
    await db_session.execute(delete(Artifact))
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
async def viewer_token(viewer_user: User) -> str:
    return create_access_token({"sub": viewer_user.id, "email": viewer_user.email})


@pytest_asyncio.fixture
async def admin_token(admin_user: User) -> str:
    return create_access_token({"sub": admin_user.id, "email": admin_user.email})


@pytest.mark.asyncio
async def test_get_preferences_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.get(f"{AI_BASE}/preferences")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_preferences_first_call_auto_creates_defaults(
    async_client: AsyncClient,
    viewer_user: User,
    viewer_token: str,
):
    r = await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    body = r.json()
    assert body["auto_create_tickets"] is False
    assert body["min_confidence"] == 0.9
    assert body["enabled"] is True
    assert body["user_id"] == viewer_user.id


@pytest.mark.asyncio
async def test_get_preferences_second_call_same_id_single_db_row(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_user: User,
    viewer_token: str,
):
    r1 = await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(viewer_token))
    assert r1.status_code == 200
    id1 = r1.json()["id"]

    r2 = await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(viewer_token))
    assert r2.status_code == 200
    assert r2.json()["id"] == id1

    result = await db_session.execute(
        select(func.count()).select_from(AIPreferences).where(AIPreferences.user_id == viewer_user.id)
    )
    assert result.scalar_one() == 1


@pytest.mark.asyncio
async def test_get_preferences_viewer_own_user_id(
    async_client: AsyncClient,
    viewer_user: User,
    viewer_token: str,
):
    r = await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    assert r.json()["user_id"] == viewer_user.id


@pytest.mark.asyncio
async def test_get_preferences_viewer_and_admin_separate_rows(
    async_client: AsyncClient,
    viewer_user: User,
    admin_user: User,
    viewer_token: str,
    admin_token: str,
):
    rv = await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(viewer_token))
    ra = await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(admin_token))
    assert rv.status_code == 200
    assert ra.status_code == 200
    viewer_prefs = rv.json()
    admin_prefs = ra.json()
    assert viewer_prefs["id"] != admin_prefs["id"]
    assert viewer_prefs["user_id"] == viewer_user.id
    assert admin_prefs["user_id"] == admin_user.id


@pytest.mark.asyncio
async def test_put_preferences_updates_all_fields(
    async_client: AsyncClient,
    viewer_user: User,
    viewer_token: str,
):
    await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(viewer_token))
    payload = {"auto_create_tickets": True, "min_confidence": 0.75, "enabled": False}
    r = await async_client.put(
        f"{AI_BASE}/preferences",
        headers=auth_headers(viewer_token),
        json=payload,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["auto_create_tickets"] is True
    assert body["min_confidence"] == 0.75
    assert body["enabled"] is False
    assert body["user_id"] == viewer_user.id


@pytest.mark.asyncio
async def test_put_preferences_min_confidence_zero_boundary(
    async_client: AsyncClient,
    viewer_token: str,
):
    await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(viewer_token))
    r = await async_client.put(
        f"{AI_BASE}/preferences",
        headers=auth_headers(viewer_token),
        json={"min_confidence": 0.0},
    )
    assert r.status_code == 200
    assert r.json()["min_confidence"] == 0.0


@pytest.mark.asyncio
async def test_put_preferences_min_confidence_one_boundary(
    async_client: AsyncClient,
    viewer_token: str,
):
    await async_client.get(f"{AI_BASE}/preferences", headers=auth_headers(viewer_token))
    r = await async_client.put(
        f"{AI_BASE}/preferences",
        headers=auth_headers(viewer_token),
        json={"min_confidence": 1.0},
    )
    assert r.status_code == 200
    assert r.json()["min_confidence"] == 1.0


@pytest.mark.asyncio
async def test_put_preferences_min_confidence_below_zero_400(
    async_client: AsyncClient,
    viewer_token: str,
):
    r = await async_client.put(
        f"{AI_BASE}/preferences",
        headers=auth_headers(viewer_token),
        json={"min_confidence": -0.01},
    )
    assert r.status_code == 400
    _detail_contains_min_confidence(r)


@pytest.mark.asyncio
async def test_put_preferences_min_confidence_above_one_400(
    async_client: AsyncClient,
    viewer_token: str,
):
    r = await async_client.put(
        f"{AI_BASE}/preferences",
        headers=auth_headers(viewer_token),
        json={"min_confidence": 1.01},
    )
    assert r.status_code == 400
    _detail_contains_min_confidence(r)


@pytest.mark.asyncio
async def test_put_preferences_without_prior_get_creates_row(
    async_client: AsyncClient,
    viewer_user: User,
    viewer_token: str,
):
    payload = {"auto_create_tickets": True, "min_confidence": 0.5, "enabled": False}
    r = await async_client.put(
        f"{AI_BASE}/preferences",
        headers=auth_headers(viewer_token),
        json=payload,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == viewer_user.id
    assert body["auto_create_tickets"] is True
    assert body["min_confidence"] == 0.5
    assert body["enabled"] is False


@pytest.mark.asyncio
async def test_put_preferences_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.put(
        f"{AI_BASE}/preferences",
        json={"auto_create_tickets": False, "min_confidence": 0.5, "enabled": True},
    )
    assert r.status_code in (401, 403)
