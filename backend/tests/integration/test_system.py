"""Integration tests for app.api.system."""

from __future__ import annotations

from typing import AsyncGenerator

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

SYSTEM_BASE = "/api/system"


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


# --- GET /api/system/info ---


@pytest.mark.asyncio
async def test_system_info_admin_200_has_expected_keys(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/info", headers=auth_headers(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) >= {"database", "minio", "counts", "app_name", "environment"}


@pytest.mark.asyncio
async def test_system_info_database_type_sqlite(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/info", headers=auth_headers(admin_token))
    assert r.status_code == 200
    assert r.json()["database"]["type"] == "SQLite"


@pytest.mark.asyncio
async def test_system_info_counts_keys_non_negative_ints(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/info", headers=auth_headers(admin_token))
    assert r.status_code == 200
    counts = r.json()["counts"]
    for key in ("artifacts", "tickets", "detections", "users"):
        assert key in counts
        assert isinstance(counts[key], int)
        assert counts[key] >= 0


@pytest.mark.asyncio
async def test_system_info_minio_keys(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/info", headers=auth_headers(admin_token))
    assert r.status_code == 200
    minio = r.json()["minio"]
    assert set(minio.keys()) >= {"endpoint", "bucket", "secure"}


@pytest.mark.asyncio
async def test_system_info_viewer_and_curator_forbidden(
    async_client: AsyncClient,
    viewer_token: str,
    curator_token: str,
):
    for token in (viewer_token, curator_token):
        r = await async_client.get(f"{SYSTEM_BASE}/info", headers=auth_headers(token))
        assert r.status_code == 403
        assert "administrators" in r.json()["detail"]


# --- GET /api/system/performance ---


@pytest.mark.asyncio
async def test_system_performance_admin_200_has_expected_keys(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/performance", headers=auth_headers(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert "connection_pool" in body and "recent_activity" in body


@pytest.mark.asyncio
async def test_system_performance_connection_pool_integer_fields(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/performance", headers=auth_headers(admin_token))
    assert r.status_code == 200
    pool = r.json()["connection_pool"]
    for key in ("size", "checked_in", "checked_out", "overflow"):
        assert key in pool
        assert isinstance(pool[key], int)


@pytest.mark.asyncio
async def test_system_performance_recent_activity_non_negative_ints(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/performance", headers=auth_headers(admin_token))
    assert r.status_code == 200
    activity = r.json()["recent_activity"]
    for key in ("artifacts_created_24h", "tickets_created_24h"):
        assert key in activity
        assert isinstance(activity[key], int)
        assert activity[key] >= 0


@pytest.mark.asyncio
async def test_system_performance_viewer_forbidden(
    async_client: AsyncClient,
    viewer_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/performance", headers=auth_headers(viewer_token))
    assert r.status_code == 403
    assert "administrators" in r.json()["detail"]


# --- POST /api/system/backup/create ---


@pytest.mark.asyncio
async def test_backup_create_admin_sqlite_returns_400_postgresql_message(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.post(f"{SYSTEM_BASE}/backup/create", headers=auth_headers(admin_token))
    assert r.status_code == 400
    assert "PostgreSQL" in r.json()["detail"]


@pytest.mark.asyncio
async def test_backup_create_viewer_forbidden(
    async_client: AsyncClient,
    viewer_token: str,
):
    r = await async_client.post(f"{SYSTEM_BASE}/backup/create", headers=auth_headers(viewer_token))
    assert r.status_code == 403
    assert "administrators" in r.json()["detail"]


@pytest.mark.asyncio
async def test_backup_create_curator_forbidden(
    async_client: AsyncClient,
    curator_token: str,
):
    r = await async_client.post(f"{SYSTEM_BASE}/backup/create", headers=auth_headers(curator_token))
    assert r.status_code == 403
    assert "administrators" in r.json()["detail"]


@pytest.mark.asyncio
async def test_backup_create_unauthenticated(async_client: AsyncClient):
    r = await async_client.post(f"{SYSTEM_BASE}/backup/create")
    assert r.status_code in (401, 403)


# --- GET /api/system/backup/list ---


@pytest.mark.asyncio
async def test_backup_list_admin_200_backups_is_list(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/backup/list", headers=auth_headers(admin_token))
    assert r.status_code == 200
    body = r.json()
    assert "backups" in body
    assert isinstance(body["backups"], list)
    assert "pagination" in body


@pytest.mark.asyncio
async def test_backup_list_viewer_forbidden(
    async_client: AsyncClient,
    viewer_token: str,
):
    r = await async_client.get(f"{SYSTEM_BASE}/backup/list", headers=auth_headers(viewer_token))
    assert r.status_code == 403
    assert "administrators" in r.json()["detail"]


@pytest.mark.asyncio
async def test_backup_list_unauthenticated(async_client: AsyncClient):
    r = await async_client.get(f"{SYSTEM_BASE}/backup/list")
    assert r.status_code in (401, 403)
