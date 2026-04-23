"""Integration tests for app.api.defect_detection (prefix /api/defects)."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
from app.main import app
from app.models import Artifact, Detection, RefreshToken, Ticket, User
from tests.conftest import _create_user

DEFECTS_BASE = "/api/defects"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def detection_like(
    detection_id: str = "det-1",
    artifact_id: str = "art-1",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=detection_id,
        artifact_id=artifact_id,
        detection_type="scratch",
        severity="low",
        confidence=0.91,
        location_bbox="[0,0,10,10]",
        area_pixels=100,
        area_percent=1.0,
        is_critical=False,
        status="pending",
        created_at=datetime.now(timezone.utc),
        image_path=None,
    )


def scalars_all_result(rows: list) -> MagicMock:
    out = MagicMock()
    out.scalars.return_value.all.return_value = rows
    return out


def scalar_one_result(obj: object | None) -> MagicMock:
    out = MagicMock()
    out.scalar_one_or_none.return_value = obj
    return out


@pytest_asyncio.fixture
async def _ensure_clean_db(db_session: AsyncSession) -> None:
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
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def viewer_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "viewer", "defects")


@pytest_asyncio.fixture
async def viewer_token(viewer_user: User) -> str:
    from app.security import create_access_token

    return create_access_token({"sub": viewer_user.id, "email": viewer_user.email})


@pytest_asyncio.fixture
async def defect_mock_db_client(
    db_session: AsyncSession, _ensure_clean_db: None, viewer_user: User
) -> AsyncGenerator[tuple[AsyncClient, AsyncMock], None]:
    """Auth resolved to viewer_user; DB is AsyncMock (no real ORM for defect routes)."""
    mock_db = AsyncMock()

    async def override_get_db() -> AsyncGenerator[AsyncMock, None]:
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_active_user] = lambda: viewer_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client, mock_db
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_artifact_detections_unauthenticated(async_client: AsyncClient) -> None:
    r = await async_client.get(f"{DEFECTS_BASE}/artifact/any-id")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_detection_result_unauthenticated(async_client: AsyncClient) -> None:
    r = await async_client.get(f"{DEFECTS_BASE}/results/some-id")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_delete_detection_unauthenticated(async_client: AsyncClient) -> None:
    r = await async_client.delete(f"{DEFECTS_BASE}/some-id")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_artifact_detections_empty(
    defect_mock_db_client: tuple[AsyncClient, AsyncMock],
    viewer_token: str,
) -> None:
    client, mock_db = defect_mock_db_client
    mock_db.execute = AsyncMock(return_value=scalars_all_result([]))

    r = await client.get(
        f"{DEFECTS_BASE}/artifact/art-1",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_get_detection_result_found(
    defect_mock_db_client: tuple[AsyncClient, AsyncMock],
    viewer_token: str,
) -> None:
    client, mock_db = defect_mock_db_client
    det = detection_like()
    mock_db.execute = AsyncMock(return_value=scalar_one_result(det))

    r = await client.get(
        f"{DEFECTS_BASE}/results/{det.id}",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == det.id


@pytest.mark.asyncio
async def test_get_detection_result_not_found(
    defect_mock_db_client: tuple[AsyncClient, AsyncMock],
    viewer_token: str,
) -> None:
    client, mock_db = defect_mock_db_client
    mock_db.execute = AsyncMock(return_value=scalar_one_result(None))

    r = await client.get(
        f"{DEFECTS_BASE}/results/missing-id",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_detection_success(
    defect_mock_db_client: tuple[AsyncClient, AsyncMock],
    viewer_token: str,
) -> None:
    client, mock_db = defect_mock_db_client
    det = detection_like()
    mock_db.execute = AsyncMock(return_value=scalar_one_result(det))
    mock_db.delete = AsyncMock()
    mock_db.commit = AsyncMock()

    r = await client.delete(
        f"{DEFECTS_BASE}/{det.id}",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "success"


@pytest.mark.asyncio
async def test_delete_detection_not_found(
    defect_mock_db_client: tuple[AsyncClient, AsyncMock],
    viewer_token: str,
) -> None:
    client, mock_db = defect_mock_db_client
    mock_db.execute = AsyncMock(return_value=scalar_one_result(None))

    r = await client.delete(
        f"{DEFECTS_BASE}/missing-id",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 404
