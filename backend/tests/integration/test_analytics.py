"""Integration tests for app.api.analytics."""

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

ANALYTICS_BASE = "/api/analytics"


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
async def curator_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "curator", "fixture")


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "admin", "fixture")


@pytest_asyncio.fixture
async def viewer_token(viewer_user: User) -> str:
    return create_access_token({"sub": viewer_user.id, "email": viewer_user.email})


@pytest_asyncio.fixture
async def curator_token(curator_user: User) -> str:
    return create_access_token({"sub": curator_user.id, "email": curator_user.email})


@pytest_asyncio.fixture
async def admin_token(admin_user: User) -> str:
    return create_access_token({"sub": admin_user.id, "email": admin_user.email})


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


async def _db_detection(
    db_session: AsyncSession,
    *,
    artifact_id: str,
    detected_by_user_id: str,
    detection_type: str = "scratch",
    is_critical: bool = False,
    **kwargs: Any,
) -> Detection:
    severity = kwargs.pop("severity", "medium")
    confidence = kwargs.pop("confidence", 0.95)
    location_bbox = kwargs.pop("location_bbox", "[0,0,10,10]")
    area_pixels = kwargs.pop("area_pixels", 100)
    area_percent = kwargs.pop("area_percent", 1.5)
    status = kwargs.pop("status", "pending")
    d = Detection(
        artifact_id=artifact_id,
        detection_type=detection_type,
        severity=severity,
        confidence=confidence,
        location_bbox=location_bbox,
        area_pixels=area_pixels,
        area_percent=area_percent,
        is_critical=is_critical,
        status=status,
        detected_by_user_id=detected_by_user_id,
        **kwargs,
    )
    db_session.add(d)
    await db_session.commit()
    await db_session.refresh(d)
    return d


# --- GET /api/analytics/overview ---


@pytest.mark.asyncio
async def test_overview_viewer_forbidden(async_client: AsyncClient, viewer_token: str):
    r = await async_client.get(f"{ANALYTICS_BASE}/overview", headers=auth_headers(viewer_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_overview_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.get(f"{ANALYTICS_BASE}/overview")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_overview_curator_empty_db(async_client: AsyncClient, curator_token: str):
    r = await async_client.get(f"{ANALYTICS_BASE}/overview", headers=auth_headers(curator_token))
    assert r.status_code == 200
    body = r.json()
    assert body["artifacts"]["total"] == 0
    assert body["tickets"]["total"] == 0
    assert body["detections"]["total"] == 0


@pytest.mark.asyncio
async def test_overview_artifact_status_counts(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_token: str,
):
    await _db_artifact(db_session, status="no_defects", title="A1")
    await _db_artifact(db_session, status="no_defects", title="A2")
    await _db_artifact(db_session, status="has_defects", title="A3")
    r = await async_client.get(f"{ANALYTICS_BASE}/overview", headers=auth_headers(curator_token))
    assert r.status_code == 200
    art = r.json()["artifacts"]
    assert art["total"] == 3
    assert art["by_status"]["no_defects"] == 2
    assert art["by_status"]["has_defects"] == 1


@pytest.mark.asyncio
async def test_overview_by_collection(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_token: str,
):
    await _db_artifact(db_session, collection="Живопись", title="P1")
    await _db_artifact(db_session, collection="Живопись", title="P2")
    await _db_artifact(db_session, collection="Скульптура", title="S1")
    r = await async_client.get(f"{ANALYTICS_BASE}/overview", headers=auth_headers(curator_token))
    assert r.status_code == 200
    by_col = r.json()["artifacts"]["by_collection"]
    entry = next((x for x in by_col if x["name"] == "Живопись"), None)
    assert entry is not None
    assert entry["count"] == 2


@pytest.mark.asyncio
async def test_overview_ticket_open_completed(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, title="Art for tickets")
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        status="open",
    )
    now = datetime.now(timezone.utc)
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        status="completed",
        completed_at=now,
    )
    r = await async_client.get(f"{ANALYTICS_BASE}/overview", headers=auth_headers(curator_token))
    assert r.status_code == 200
    tix = r.json()["tickets"]
    assert tix["total"] == 2
    assert tix["open"] == 1
    assert tix["completed"] == 1


@pytest.mark.asyncio
async def test_overview_admin_ok(async_client: AsyncClient, admin_token: str):
    r = await async_client.get(f"{ANALYTICS_BASE}/overview", headers=auth_headers(admin_token))
    assert r.status_code == 200


# --- GET /api/analytics/trends ---


@pytest.mark.asyncio
async def test_trends_viewer_forbidden(async_client: AsyncClient, viewer_token: str):
    r = await async_client.get(f"{ANALYTICS_BASE}/trends", headers=auth_headers(viewer_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_trends_curator_empty_default_period(
    async_client: AsyncClient, curator_token: str
):
    r = await async_client.get(f"{ANALYTICS_BASE}/trends", headers=auth_headers(curator_token))
    assert r.status_code == 200
    body = r.json()
    assert body["period_days"] == 30
    assert body["artifacts_created"] == []
    assert body["tickets_created"] == []
    assert body["tickets_completed"] == []
    assert body["detections_created"] == []


@pytest.mark.asyncio
async def test_trends_days_query_param(async_client: AsyncClient, curator_token: str):
    r = await async_client.get(
        f"{ANALYTICS_BASE}/trends?days=7", headers=auth_headers(curator_token)
    )
    assert r.status_code == 200
    assert r.json()["period_days"] == 7


@pytest.mark.asyncio
async def test_trends_artifacts_created_one(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_token: str,
):
    await _db_artifact(db_session, title="Trend artifact")
    r = await async_client.get(f"{ANALYTICS_BASE}/trends", headers=auth_headers(curator_token))
    assert r.status_code == 200
    series = r.json()["artifacts_created"]
    assert len(series) == 1
    assert series[0]["count"] == 1


@pytest.mark.asyncio
async def test_trends_tickets_created_one(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, title="Art for ticket trend")
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        status="open",
    )
    r = await async_client.get(f"{ANALYTICS_BASE}/trends", headers=auth_headers(curator_token))
    assert r.status_code == 200
    series = r.json()["tickets_created"]
    assert len(series) == 1
    assert series[0]["count"] == 1


# --- GET /api/analytics/restoration ---


@pytest.mark.asyncio
async def test_restoration_viewer_forbidden(async_client: AsyncClient, viewer_token: str):
    r = await async_client.get(f"{ANALYTICS_BASE}/restoration", headers=auth_headers(viewer_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_restoration_curator_empty(
    async_client: AsyncClient, curator_token: str
):
    r = await async_client.get(
        f"{ANALYTICS_BASE}/restoration", headers=auth_headers(curator_token)
    )
    assert r.status_code == 200
    body = r.json()
    assert body["tickets_by_restorer"] == []
    assert body["average_completion_days"] is None
    assert body["priority_completion"] == []
    assert body["recent_completions_30d"] == 0


@pytest.mark.asyncio
async def test_restoration_tickets_by_restorer_completed_assigned(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    admin_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, title="Restoration art")
    now = datetime.now(timezone.utc)
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        status="completed",
        assigned_to_id=admin_user.id,
        completed_at=now,
    )
    r = await async_client.get(
        f"{ANALYTICS_BASE}/restoration", headers=auth_headers(curator_token)
    )
    assert r.status_code == 200
    rows = r.json()["tickets_by_restorer"]
    assert len(rows) == 1
    assert rows[0]["restorer"] == admin_user.name
    assert rows[0]["count"] == 1


@pytest.mark.asyncio
async def test_restoration_recent_completions_30d(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, title="Recent completion art")
    now = datetime.now(timezone.utc)
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        status="completed",
        completed_at=now,
    )
    r = await async_client.get(
        f"{ANALYTICS_BASE}/restoration", headers=auth_headers(curator_token)
    )
    assert r.status_code == 200
    assert r.json()["recent_completions_30d"] >= 1


@pytest.mark.asyncio
async def test_restoration_priority_completion_rate(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, title="Priority art")
    now = datetime.now(timezone.utc)
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        priority="high",
        status="completed",
        completed_at=now,
    )
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        priority="high",
        status="open",
    )
    r = await async_client.get(
        f"{ANALYTICS_BASE}/restoration", headers=auth_headers(curator_token)
    )
    assert r.status_code == 200
    pc = r.json()["priority_completion"]
    high = next((x for x in pc if x["priority"] == "high"), None)
    assert high is not None
    assert high["total"] == 2
    assert high["completed"] == 1
    assert high["completion_rate"] == 50.0


@pytest.mark.asyncio
async def test_restoration_average_completion_float_or_none_no_crash(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, title="Avg completion art")
    now = datetime.now(timezone.utc)
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        status="completed",
        completed_at=now,
    )
    await _db_ticket(
        db_session,
        artifact_id=art.id,
        created_by_id=curator_user.id,
        status="open",
    )
    r = await async_client.get(
        f"{ANALYTICS_BASE}/restoration", headers=auth_headers(curator_token)
    )
    assert r.status_code == 200
    avg = r.json()["average_completion_days"]
    assert avg is None or isinstance(avg, float)
