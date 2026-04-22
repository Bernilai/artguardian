"""Integration tests for app.api.notifications."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
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

NOTIFICATIONS_BASE = "/api/notifications"


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


async def _db_notification(
    db_session: AsyncSession,
    *,
    user_id: str,
    title: str = "Test notification",
    message: str = "Test message",
    notification_type: str = "info",
    is_read: bool = False,
) -> Notification:
    read_at = datetime.now(timezone.utc) if is_read else None
    n = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        is_read=is_read,
        read_at=read_at,
    )
    db_session.add(n)
    await db_session.commit()
    await db_session.refresh(n)
    return n


# --- GET /api/notifications/ ---


@pytest.mark.asyncio
async def test_list_notifications_200_empty(
    async_client: AsyncClient,
    admin_user: User,
    admin_token: str,
):
    r = await async_client.get(f"{NOTIFICATIONS_BASE}/", headers=auth_headers(admin_token))
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_notifications_200_two_items(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    await _db_notification(db_session, user_id=admin_user.id, title="N1")
    await _db_notification(db_session, user_id=admin_user.id, title="N2")
    r = await async_client.get(f"{NOTIFICATIONS_BASE}/", headers=auth_headers(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    titles = {row["title"] for row in body}
    assert titles == {"N1", "N2"}
    for row in body:
        assert row["user_id"] == admin_user.id
        assert "id" in row and "type" in row and "message" in row
        assert "is_read" in row and "created_at" in row


@pytest.mark.asyncio
async def test_list_notifications_unread_filter(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    await _db_notification(db_session, user_id=admin_user.id, title="Read one", is_read=True)
    await _db_notification(db_session, user_id=admin_user.id, title="Unread one", is_read=False)
    r = await async_client.get(
        f"{NOTIFICATIONS_BASE}/",
        params={"unread": "true"},
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["title"] == "Unread one"
    assert body[0]["is_read"] is False


@pytest.mark.asyncio
async def test_list_notifications_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.get(f"{NOTIFICATIONS_BASE}/")
    assert r.status_code in (401, 403)


# --- GET /api/notifications/unread-count ---


@pytest.mark.asyncio
async def test_unread_count_zero(
    async_client: AsyncClient,
    admin_user: User,
    admin_token: str,
):
    r = await async_client.get(
        f"{NOTIFICATIONS_BASE}/unread-count",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == {"count": 0}


@pytest.mark.asyncio
async def test_unread_count_two(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    await _db_notification(db_session, user_id=admin_user.id, is_read=False)
    await _db_notification(db_session, user_id=admin_user.id, is_read=False)
    r = await async_client.get(
        f"{NOTIFICATIONS_BASE}/unread-count",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == {"count": 2}


@pytest.mark.asyncio
async def test_unread_count_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.get(f"{NOTIFICATIONS_BASE}/unread-count")
    assert r.status_code in (401, 403)


# --- PUT /api/notifications/{id} ---


@pytest.mark.asyncio
async def test_put_notification_mark_read(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    n = await _db_notification(db_session, user_id=admin_user.id, is_read=False)
    r = await async_client.put(
        f"{NOTIFICATIONS_BASE}/{n.id}",
        headers=auth_headers(admin_token),
        json={"is_read": True},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["is_read"] is True
    assert data["read_at"] is not None
    await db_session.refresh(n)
    assert n.is_read is True
    assert n.read_at is not None


@pytest.mark.asyncio
async def test_put_notification_mark_unread(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    n = await _db_notification(db_session, user_id=admin_user.id, is_read=True)
    r = await async_client.put(
        f"{NOTIFICATIONS_BASE}/{n.id}",
        headers=auth_headers(admin_token),
        json={"is_read": False},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["is_read"] is False
    assert data["read_at"] is None
    await db_session.refresh(n)
    assert n.is_read is False
    assert n.read_at is None


@pytest.mark.asyncio
async def test_put_notification_other_user_404(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_user: User,
    admin_token: str,
):
    n = await _db_notification(db_session, user_id=viewer_user.id)
    r = await async_client.put(
        f"{NOTIFICATIONS_BASE}/{n.id}",
        headers=auth_headers(admin_token),
        json={"is_read": True},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_put_notification_not_found_404(
    async_client: AsyncClient,
    admin_token: str,
):
    missing_id = str(uuid.uuid4())
    r = await async_client.put(
        f"{NOTIFICATIONS_BASE}/{missing_id}",
        headers=auth_headers(admin_token),
        json={"is_read": True},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_put_notification_unauthenticated_401_or_403(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
):
    n = await _db_notification(db_session, user_id=admin_user.id)
    r = await async_client.put(
        f"{NOTIFICATIONS_BASE}/{n.id}",
        json={"is_read": True},
    )
    assert r.status_code in (401, 403)


# --- DELETE /api/notifications/{id} ---


@pytest.mark.asyncio
async def test_delete_own_notification_204(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    n = await _db_notification(db_session, user_id=admin_user.id)
    r = await async_client.delete(
        f"{NOTIFICATIONS_BASE}/{n.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 204
    assert r.content == b"" or r.text == ""


@pytest.mark.asyncio
async def test_delete_other_user_notification_404(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_user: User,
    admin_token: str,
):
    n = await _db_notification(db_session, user_id=viewer_user.id)
    r = await async_client.delete(
        f"{NOTIFICATIONS_BASE}/{n.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_notification_not_found_404(
    async_client: AsyncClient,
    admin_token: str,
):
    missing_id = str(uuid.uuid4())
    r = await async_client.delete(
        f"{NOTIFICATIONS_BASE}/{missing_id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_then_list_excludes_notification(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    n = await _db_notification(db_session, user_id=admin_user.id, title="To remove")
    r_del = await async_client.delete(
        f"{NOTIFICATIONS_BASE}/{n.id}",
        headers=auth_headers(admin_token),
    )
    assert r_del.status_code == 204
    r_list = await async_client.get(f"{NOTIFICATIONS_BASE}/", headers=auth_headers(admin_token))
    assert r_list.status_code == 200
    ids = {row["id"] for row in r_list.json()}
    assert n.id not in ids


# --- POST /api/notifications/mark-all-read ---


@pytest.mark.asyncio
async def test_mark_all_read_three_unread(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    for _ in range(3):
        await _db_notification(db_session, user_id=admin_user.id, is_read=False)
    r = await async_client.post(
        f"{NOTIFICATIONS_BASE}/mark-all-read",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == {"marked": 3}
    r_cnt = await async_client.get(
        f"{NOTIFICATIONS_BASE}/unread-count",
        headers=auth_headers(admin_token),
    )
    assert r_cnt.json() == {"count": 0}


@pytest.mark.asyncio
async def test_mark_all_read_already_all_read(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    await _db_notification(db_session, user_id=admin_user.id, is_read=True)
    r = await async_client.post(
        f"{NOTIFICATIONS_BASE}/mark-all-read",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == {"marked": 0}


@pytest.mark.asyncio
async def test_mark_all_read_only_current_user(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    viewer_user: User,
    admin_token: str,
):
    await _db_notification(db_session, user_id=admin_user.id, is_read=False)
    await _db_notification(db_session, user_id=admin_user.id, is_read=False)
    v = await _db_notification(db_session, user_id=viewer_user.id, is_read=False)
    r = await async_client.post(
        f"{NOTIFICATIONS_BASE}/mark-all-read",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == {"marked": 2}
    await db_session.refresh(v)
    assert v.is_read is False
    assert v.read_at is None


# --- GET /api/notifications/preferences ---


@pytest.mark.asyncio
async def test_get_preferences_autocreates_defaults(
    async_client: AsyncClient,
    admin_user: User,
    admin_token: str,
):
    r = await async_client.get(
        f"{NOTIFICATIONS_BASE}/preferences",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ticket_assigned"] is True
    assert data["push_notifications"] is True
    assert data["email_notifications"] is False
    assert data["user_id"] == admin_user.id
    assert "id" in data


@pytest.mark.asyncio
async def test_get_preferences_second_call_no_duplicates(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    r1 = await async_client.get(
        f"{NOTIFICATIONS_BASE}/preferences",
        headers=auth_headers(admin_token),
    )
    assert r1.status_code == 200
    first_id = r1.json()["id"]
    r2 = await async_client.get(
        f"{NOTIFICATIONS_BASE}/preferences",
        headers=auth_headers(admin_token),
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == first_id
    cnt = await db_session.scalar(
        select(func.count()).select_from(NotificationPreferences).where(
            NotificationPreferences.user_id == admin_user.id
        )
    )
    assert cnt == 1


# --- PUT /api/notifications/preferences ---


@pytest.mark.asyncio
async def test_put_preferences_updates_fields(
    async_client: AsyncClient,
    admin_token: str,
):
    await async_client.get(f"{NOTIFICATIONS_BASE}/preferences", headers=auth_headers(admin_token))
    payload = {
        "ticket_assigned": False,
        "ticket_created_unassigned": False,
        "artifact_created": True,
        "artifact_status_changed": False,
        "user_created": True,
        "backup_completed": False,
        "ai_error": True,
        "email_notifications": True,
        "push_notifications": False,
    }
    r = await async_client.put(
        f"{NOTIFICATIONS_BASE}/preferences",
        headers=auth_headers(admin_token),
        json=payload,
    )
    assert r.status_code == 200
    data = r.json()
    for k, v in payload.items():
        assert data[k] is v


@pytest.mark.asyncio
async def test_put_preferences_creates_when_missing(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_user: User,
    viewer_token: str,
):
    cnt = await db_session.scalar(
        select(func.count()).select_from(NotificationPreferences).where(
            NotificationPreferences.user_id == viewer_user.id
        )
    )
    assert cnt == 0
    payload = {
        "ticket_assigned": False,
        "ticket_created_unassigned": True,
        "artifact_created": False,
        "artifact_status_changed": True,
        "user_created": False,
        "backup_completed": True,
        "ai_error": False,
        "email_notifications": True,
        "push_notifications": False,
    }
    r = await async_client.put(
        f"{NOTIFICATIONS_BASE}/preferences",
        headers=auth_headers(viewer_token),
        json=payload,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == viewer_user.id
    for k, v in payload.items():
        assert data[k] is v
