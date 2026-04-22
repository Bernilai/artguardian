"""Integration tests for app.api.tickets."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models import Artifact, Detection, RefreshToken, Ticket, User
from app.security import create_access_token
from tests.conftest import _create_user

# main.py: app.include_router(tickets.router, prefix="/api/tickets", ...)
TICKETS_BASE = "/api/tickets"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def ticket_payload(artifact_id: str, **overrides: object) -> dict:
    base: dict = {
        "artifact_id": artifact_id,
        "title": "Test Ticket",
        "description": "Test description",
        "priority": "medium",
        "assigned_to_id": None,
        "notes": None,
    }
    base.update(overrides)  # type: ignore[arg-type]
    return base


@pytest_asyncio.fixture
async def _ensure_clean_db(db_session: AsyncSession) -> None:
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
async def curator_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "curator", "fixture")


@pytest_asyncio.fixture
async def restorer_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "restorer", "fixture")


@pytest_asyncio.fixture
async def viewer_token(viewer_user: User) -> str:
    return create_access_token({"sub": viewer_user.id, "email": viewer_user.email})


@pytest_asyncio.fixture
async def admin_token(admin_user: User) -> str:
    return create_access_token({"sub": admin_user.id, "email": admin_user.email})


@pytest_asyncio.fixture
async def curator_token(curator_user: User) -> str:
    return create_access_token({"sub": curator_user.id, "email": curator_user.email})


@pytest_asyncio.fixture
async def restorer_token(restorer_user: User) -> str:
    return create_access_token({"sub": restorer_user.id, "email": restorer_user.email})


async def _db_artifact(
    db_session: AsyncSession,
    *,
    title: str = "DB Artifact",
    inventory_number: str | None = None,
    collection: str = "Main",
    status: str = "no_defects",
) -> Artifact:
    inv = inventory_number or f"INV-{uuid.uuid4().hex[:10]}"
    a = Artifact(
        title=title,
        inventory_number=inv,
        collection=collection,
        status=status,
        description="d",
        current_location="loc",
    )
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    return a


async def _db_user(db_session: AsyncSession, role: str, suffix: str = "db") -> User:
    return await _create_user(db_session, role, suffix)


async def _db_ticket(
    db_session: AsyncSession,
    artifact_id: str,
    created_by_id: str,
    *,
    title: str = "DB Ticket",
    description: str | None = "desc",
    status: str = "open",
    priority: str = "medium",
    assigned_to_id: str | None = None,
    notes: str | None = None,
    completed_at=None,
) -> Ticket:
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


@contextmanager
def patched_ticket_notifications():
    with (
        patch("app.api.tickets.notify_ticket_assigned", new_callable=AsyncMock) as m_assigned,
        patch(
            "app.api.tickets.notify_ticket_created_unassigned",
            new_callable=AsyncMock,
        ) as m_unassigned,
    ):
        yield m_assigned, m_unassigned


# --- GET /tickets/ ---


@pytest.mark.asyncio
async def test_list_tickets_restorer_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    restorer_user: User,
    restorer_token: str,
):
    art = await _db_artifact(db_session, title="ListedArt")
    t = await _db_ticket(db_session, art.id, restorer_user.id, title="T1")
    r = await async_client.get(f"{TICKETS_BASE}/", headers=auth_headers(restorer_token))
    assert r.status_code == 200
    body = r.json()
    assert "tickets" in body and "pagination" in body
    ids = {x["id"] for x in body["tickets"]}
    assert t.id in ids
    row = next(x for x in body["tickets"] if x["id"] == t.id)
    assert row["artifact_title"] == "ListedArt"
    assert row["status"] == "open"


@pytest.mark.asyncio
async def test_list_tickets_curator_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session)
    await _db_ticket(db_session, art.id, curator_user.id)
    r = await async_client.get(f"{TICKETS_BASE}/", headers=auth_headers(curator_token))
    assert r.status_code == 200
    assert isinstance(r.json()["tickets"], list)


@pytest.mark.asyncio
async def test_list_tickets_viewer_403(async_client: AsyncClient, viewer_token: str):
    r = await async_client.get(f"{TICKETS_BASE}/", headers=auth_headers(viewer_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_tickets_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.get(f"{TICKETS_BASE}/")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_tickets_filter_artifact_id(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    a1 = await _db_artifact(db_session, title="A1", inventory_number=f"I1-{uuid.uuid4().hex[:8]}")
    a2 = await _db_artifact(db_session, title="A2", inventory_number=f"I2-{uuid.uuid4().hex[:8]}")
    t1 = await _db_ticket(db_session, a1.id, curator_user.id, title="Ticket A1")
    await _db_ticket(db_session, a2.id, curator_user.id, title="Ticket A2")
    r = await async_client.get(
        f"{TICKETS_BASE}/",
        headers=auth_headers(curator_token),
        params={"artifact_id": a1.id},
    )
    assert r.status_code == 200
    ids = {x["id"] for x in r.json()["tickets"]}
    assert ids == {t1.id}


# --- GET /tickets/{id} ---


@pytest.mark.asyncio
async def test_get_ticket_200_with_artifact_title(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, title="DetailTitle")
    t = await _db_ticket(db_session, art.id, curator_user.id)
    r = await async_client.get(f"{TICKETS_BASE}/{t.id}", headers=auth_headers(curator_token))
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == t.id
    assert data["artifact_title"] == "DetailTitle"
    assert data["status"] == "open"


@pytest.mark.asyncio
async def test_get_ticket_not_found_404(async_client: AsyncClient, admin_token: str):
    r = await async_client.get(
        f"{TICKETS_BASE}/{uuid.uuid4()}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_ticket_viewer_403(async_client: AsyncClient, viewer_token: str):
    r = await async_client.get(f"{TICKETS_BASE}/{uuid.uuid4()}", headers=auth_headers(viewer_token))
    assert r.status_code == 403


# --- POST /tickets/ ---


@pytest.mark.asyncio
async def test_create_ticket_unassigned_notifies_unassigned_once(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, status="no_defects")
    with patched_ticket_notifications() as (mock_assigned, mock_unassigned):
        r = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(curator_token),
            json=ticket_payload(art.id),
        )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "open"
    assert data["created_by_id"] == curator_user.id
    mock_unassigned.assert_awaited_once()
    mock_assigned.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_ticket_assigned_notifies_assigned_once(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
    restorer_user: User,
):
    art = await _db_artifact(db_session)
    with patched_ticket_notifications() as (mock_assigned, mock_unassigned):
        r = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(curator_token),
            json=ticket_payload(art.id, assigned_to_id=restorer_user.id),
        )
    assert r.status_code == 200
    assert r.json()["assigned_to_id"] == restorer_user.id
    assert r.json()["assigned_to_name"] == restorer_user.name
    mock_assigned.assert_awaited_once()
    mock_unassigned.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_ticket_restorer_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    restorer_user: User,
    restorer_token: str,
):
    art = await _db_artifact(db_session)
    with patched_ticket_notifications():
        r = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(restorer_token),
            json=ticket_payload(art.id),
        )
    assert r.status_code == 200
    assert r.json()["status"] == "open"


@pytest.mark.asyncio
async def test_create_ticket_viewer_403(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_token: str,
):
    art = await _db_artifact(db_session)
    with patched_ticket_notifications():
        r = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(viewer_token),
            json=ticket_payload(art.id),
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_ticket_artifact_not_found_404(
    async_client: AsyncClient,
    curator_token: str,
):
    with patched_ticket_notifications():
        r = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(curator_token),
            json=ticket_payload(str(uuid.uuid4())),
        )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_ticket_assigned_user_not_found_404(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_token: str,
):
    art = await _db_artifact(db_session)
    with patched_ticket_notifications():
        r = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(curator_token),
            json=ticket_payload(art.id, assigned_to_id=str(uuid.uuid4())),
        )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_create_ticket_sets_artifact_requires_attention_when_not_under_restoration(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_token: str,
):
    art = await _db_artifact(db_session, status="no_defects")
    with patched_ticket_notifications():
        r = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(curator_token),
            json=ticket_payload(art.id),
        )
    assert r.status_code == 200
    await db_session.refresh(art)
    row = (await db_session.execute(select(Artifact).where(Artifact.id == art.id))).scalar_one()
    assert row.status == "requires_attention"


@pytest.mark.asyncio
async def test_create_ticket_does_not_change_artifact_when_already_under_restoration(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_token: str,
):
    art = await _db_artifact(db_session, status="under_restoration")
    with patched_ticket_notifications():
        r = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(curator_token),
            json=ticket_payload(art.id),
        )
    assert r.status_code == 200
    row = (await db_session.execute(select(Artifact).where(Artifact.id == art.id))).scalar_one()
    assert row.status == "under_restoration"


# --- PUT /tickets/{id} ---


@pytest.mark.asyncio
async def test_update_ticket_title_curator_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id, title="Old")
    with patched_ticket_notifications():
        r = await async_client.put(
            f"{TICKETS_BASE}/{t.id}",
            headers=auth_headers(curator_token),
            json={"title": "New Title"},
        )
    assert r.status_code == 200
    assert r.json()["title"] == "New Title"
    row = (await db_session.execute(select(Ticket).where(Ticket.id == t.id))).scalar_one()
    assert row.title == "New Title"


@pytest.mark.asyncio
async def test_update_ticket_status_in_progress_sets_artifact_under_restoration(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, status="requires_attention")
    t = await _db_ticket(db_session, art.id, curator_user.id)
    with patched_ticket_notifications():
        r = await async_client.put(
            f"{TICKETS_BASE}/{t.id}",
            headers=auth_headers(curator_token),
            json={"status": "in_progress"},
        )
    assert r.status_code == 200
    row_a = (await db_session.execute(select(Artifact).where(Artifact.id == art.id))).scalar_one()
    assert row_a.status == "under_restoration"
    assert r.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_update_ticket_status_completed_sets_artifact_and_completed_at(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, status="under_restoration")
    t = await _db_ticket(db_session, art.id, curator_user.id, status="in_progress")
    with patched_ticket_notifications():
        r = await async_client.put(
            f"{TICKETS_BASE}/{t.id}",
            headers=auth_headers(curator_token),
            json={"status": "completed"},
        )
    assert r.status_code == 200
    assert r.json()["completed_at"] is not None
    row_a = (await db_session.execute(select(Artifact).where(Artifact.id == art.id))).scalar_one()
    assert row_a.status == "no_defects"
    row_t = (await db_session.execute(select(Ticket).where(Ticket.id == t.id))).scalar_one()
    assert row_t.completed_at is not None


@pytest.mark.asyncio
async def test_update_ticket_reopen_completed_clears_completed_at_and_artifact_attention(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session, status="no_defects")
    done_at = datetime.now(timezone.utc)
    t = await _db_ticket(
        db_session,
        art.id,
        curator_user.id,
        status="completed",
        completed_at=done_at,
    )
    with patched_ticket_notifications():
        r = await async_client.put(
            f"{TICKETS_BASE}/{t.id}",
            headers=auth_headers(curator_token),
            json={"status": "open"},
        )
    assert r.status_code == 200
    assert r.json()["completed_at"] is None
    row_a = (await db_session.execute(select(Artifact).where(Artifact.id == art.id))).scalar_one()
    assert row_a.status == "requires_attention"
    row_t = (await db_session.execute(select(Ticket).where(Ticket.id == t.id))).scalar_one()
    assert row_t.completed_at is None


@pytest.mark.asyncio
async def test_update_ticket_new_assignment_notifies_assigned_once(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
    restorer_user: User,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id, assigned_to_id=None)
    with patched_ticket_notifications() as (mock_assigned, _):
        r = await async_client.put(
            f"{TICKETS_BASE}/{t.id}",
            headers=auth_headers(curator_token),
            json={"assigned_to_id": restorer_user.id},
        )
    assert r.status_code == 200
    mock_assigned.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_ticket_same_assigned_to_id_does_not_notify(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
    restorer_user: User,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id, assigned_to_id=restorer_user.id)
    with patched_ticket_notifications() as (mock_assigned, _):
        r = await async_client.put(
            f"{TICKETS_BASE}/{t.id}",
            headers=auth_headers(curator_token),
            json={"assigned_to_id": restorer_user.id},
        )
    assert r.status_code == 200
    mock_assigned.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_ticket_viewer_403(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    viewer_token: str,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id)
    r = await async_client.put(
        f"{TICKETS_BASE}/{t.id}",
        headers=auth_headers(viewer_token),
        json={"title": "X"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_ticket_not_found_404(async_client: AsyncClient, admin_token: str):
    with patched_ticket_notifications():
        r = await async_client.put(
            f"{TICKETS_BASE}/{uuid.uuid4()}",
            headers=auth_headers(admin_token),
            json={"title": "Nope"},
        )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_ticket_assigned_to_nonexistent_user_404(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id)
    with patched_ticket_notifications():
        r = await async_client.put(
            f"{TICKETS_BASE}/{t.id}",
            headers=auth_headers(curator_token),
            json={"assigned_to_id": str(uuid.uuid4())},
        )
    assert r.status_code == 404


# --- DELETE /tickets/{id} ---


@pytest.mark.asyncio
async def test_delete_ticket_admin_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id)
    r = await async_client.delete(f"{TICKETS_BASE}/{t.id}", headers=auth_headers(admin_token))
    assert r.status_code == 200
    gone = (await db_session.execute(select(Ticket).where(Ticket.id == t.id))).scalar_one_or_none()
    assert gone is None


@pytest.mark.asyncio
async def test_delete_ticket_creator_curator_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    curator_token: str,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id)
    r = await async_client.delete(f"{TICKETS_BASE}/{t.id}", headers=auth_headers(curator_token))
    assert r.status_code == 200
    gone = (await db_session.execute(select(Ticket).where(Ticket.id == t.id))).scalar_one_or_none()
    assert gone is None


@pytest.mark.asyncio
async def test_delete_ticket_non_creator_restorer_403(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    restorer_user: User,
    restorer_token: str,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id)
    r = await async_client.delete(f"{TICKETS_BASE}/{t.id}", headers=auth_headers(restorer_token))
    assert r.status_code == 403
    still = (await db_session.execute(select(Ticket).where(Ticket.id == t.id))).scalar_one_or_none()
    assert still is not None
    assert still.created_by_id == curator_user.id
    assert still.created_by_id != restorer_user.id


@pytest.mark.asyncio
async def test_delete_ticket_viewer_non_creator_403(
    async_client: AsyncClient,
    db_session: AsyncSession,
    curator_user: User,
    viewer_token: str,
):
    art = await _db_artifact(db_session)
    t = await _db_ticket(db_session, art.id, curator_user.id)
    r = await async_client.delete(f"{TICKETS_BASE}/{t.id}", headers=auth_headers(viewer_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_delete_ticket_not_found_404(async_client: AsyncClient, admin_token: str):
    r = await async_client.delete(f"{TICKETS_BASE}/{uuid.uuid4()}", headers=auth_headers(admin_token))
    assert r.status_code == 404
