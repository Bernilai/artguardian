"""Integration tests for app.api.dashboard."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
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

DASHBOARD_BASE = "/api/dashboard"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


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
async def async_client(
    db_session: AsyncSession, _ensure_clean_db: None
) -> AsyncGenerator[AsyncClient, None]:
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


async def _db_artifact(
    db_session: AsyncSession,
    *,
    status: str = "no_defects",
    **kwargs: Any,
) -> Artifact:
    title = kwargs.pop("title", "DB Artifact")
    inventory_number = kwargs.pop("inventory_number", None) or f"INV-{uuid.uuid4().hex[:10]}"
    collection = kwargs.pop("collection", "Main")
    description = kwargs.pop("description", "d")
    current_location = kwargs.pop("current_location", "loc")
    a = Artifact(
        title=title,
        inventory_number=inventory_number,
        collection=collection,
        status=status,
        description=description,
        current_location=current_location,
        **kwargs,
    )
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    return a


async def _db_ticket(
    db_session: AsyncSession,
    *,
    artifact_id: str,
    created_by_id: str,
    status: str = "open",
    **kwargs: Any,
) -> Ticket:
    title = kwargs.pop("title", "DB Ticket")
    description = kwargs.pop("description", "desc")
    priority = kwargs.pop("priority", "medium")
    assigned_to_id = kwargs.pop("assigned_to_id", None)
    notes = kwargs.pop("notes", None)
    completed_at = kwargs.pop("completed_at", None)
    t = Ticket(
        artifact_id=artifact_id,
        title=title,
        description=description,
        status=status,
        priority=priority,
        assigned_to_id=assigned_to_id,
        created_by_id=created_by_id,
        notes=notes,
        completed_at=completed_at,
    )
    db_session.add(t)
    await db_session.commit()
    await db_session.refresh(t)
    return t


@pytest.mark.asyncio
async def test_stats_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.get(f"{DASHBOARD_BASE}/stats")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_stats_response_shape(
    async_client: AsyncClient, viewer_token: str
):
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    body = r.json()
    expected_keys = (
        "total_artifacts",
        "attention_artifacts",
        "critical_artifacts",
        "open_tickets",
    )
    assert set(body) == set(expected_keys)
    for key in expected_keys:
        assert "value" in body[key] and "trend" in body[key]


@pytest.mark.asyncio
async def test_total_artifacts_empty_db(
    async_client: AsyncClient,
    viewer_token: str,
):
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total_artifacts"]["value"] == "0"
    assert body["total_artifacts"]["trend"] == "Без изменений"


@pytest.mark.asyncio
async def test_total_artifacts_counts_three(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
):
    for i in range(3):
        await _db_artifact(db_session, title=f"A{i}")
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["total_artifacts"]["value"] == "3"


@pytest.mark.asyncio
async def test_attention_artifacts_empty(
    async_client: AsyncClient, viewer_token: str
):
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["attention_artifacts"]["value"] == "0"


@pytest.mark.asyncio
async def test_attention_artifacts_counts_requires_attention(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
):
    await _db_artifact(db_session, status="requires_attention")
    await _db_artifact(db_session, status="requires_attention")
    await _db_artifact(db_session, status="no_defects")
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["attention_artifacts"]["value"] == "2"


@pytest.mark.asyncio
async def test_critical_artifacts_empty(
    async_client: AsyncClient, viewer_token: str
):
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["critical_artifacts"]["value"] == "0"


@pytest.mark.asyncio
async def test_critical_artifacts_counts_has_defects(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
):
    await _db_artifact(db_session, status="has_defects")
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["critical_artifacts"]["value"] == "1"


@pytest.mark.asyncio
async def test_open_tickets_empty_trend_all_closed(
    async_client: AsyncClient, viewer_token: str
):
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    ot = r.json()["open_tickets"]
    assert ot["value"] == "0"
    assert ot["trend"] == "Все закрыты"


@pytest.mark.asyncio
async def test_open_tickets_counts_open_excluding_completed(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
    admin_user: User,
):
    art = await _db_artifact(db_session)
    await _db_ticket(
        db_session, artifact_id=art.id, created_by_id=admin_user.id, status="open"
    )
    await _db_ticket(
        db_session, artifact_id=art.id, created_by_id=admin_user.id, status="open"
    )
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=admin_user.id,
        status="completed",
    )
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["open_tickets"]["value"] == "2"


@pytest.mark.asyncio
async def test_open_tickets_mixed_open_and_in_progress_trend(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
    admin_user: User,
):
    art = await _db_artifact(db_session)
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=admin_user.id,
        status="in_progress",
    )
    await _db_ticket(
        db_session, artifact_id=art.id, created_by_id=admin_user.id, status="open"
    )
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    ot = r.json()["open_tickets"]
    assert ot["value"] == "2"
    trend = ot["trend"]
    assert "в работе" in trend
    assert "открыто" in trend


@pytest.mark.asyncio
async def test_total_trend_new_artifact_starts_with_plus(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
):
    await _db_artifact(db_session)
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["total_artifacts"]["trend"].startswith("+")


@pytest.mark.asyncio
async def test_attention_trend_one_new_when_updated_recently(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
):
    now = datetime.now(timezone.utc)
    await _db_artifact(
        db_session,
        status="requires_attention",
        updated_at=now,
    )
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["attention_artifacts"]["trend"] == "1 новых"


@pytest.mark.asyncio
async def test_tickets_trend_only_in_progress(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
    admin_user: User,
):
    art = await _db_artifact(db_session)
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=admin_user.id,
        status="in_progress",
    )
    r = await async_client.get(
        f"{DASHBOARD_BASE}/stats", headers=auth_headers(viewer_token)
    )
    assert r.status_code == 200
    assert r.json()["open_tickets"]["trend"] == "1 в работе"
