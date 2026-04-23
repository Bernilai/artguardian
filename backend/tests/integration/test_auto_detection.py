"""Integration tests for app.api.auto_detection (prefix /api/auto-detection)."""

from __future__ import annotations

import uuid
from typing import Any, AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
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
from tests.conftest import _create_user

AUTO_BASE = "/api/auto-detection"


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
    db_session: AsyncSession, _ensure_clean_db: None, viewer_user: User
) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_active_user] = lambda: viewer_user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def viewer_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "viewer", "autodet")


async def _db_artifact(
    db_session: AsyncSession,
    *,
    status: str = "no_defects",
    image_path: str | None = None,
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
        image_path=image_path,
        **kwargs,
    )
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    return a


def _detect_result(
    *,
    detected: bool,
    damage_percentage: float = 0.0,
    damage_count: int = 0,
    damage_areas: list | None = None,
) -> dict:
    areas = damage_areas if damage_areas is not None else []
    if detected and not areas:
        areas = [{"bbox": [0, 0, 10, 10], "confidence": 0.95}]
    if not detected:
        damage_count = damage_count or 0
    elif damage_count == 0:
        damage_count = len(areas) or 1
    return {
        "detected": detected,
        "damage_count": damage_count,
        "damage_percentage": damage_percentage,
        "damage_areas": areas,
    }


@pytest.mark.asyncio
async def test_status_artdet_unavailable(async_client: AsyncClient) -> None:
    with patch("app.api.auto_detection.is_artdet_available", return_value=False):
        r = await async_client.get(f"{AUTO_BASE}/status")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False


@pytest.mark.asyncio
async def test_status_artdet_available(async_client: AsyncClient) -> None:
    with patch("app.api.auto_detection.is_artdet_available", return_value=True):
        r = await async_client.get(f"{AUTO_BASE}/status")
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True


@pytest.mark.asyncio
async def test_auto_detect_artifact_not_found(async_client: AsyncClient) -> None:
    with patch("app.api.auto_detection.is_artdet_available", return_value=True):
        r = await async_client.post(f"{AUTO_BASE}/artifact/{uuid.uuid4()}/auto-detect")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_auto_detect_no_image_path(async_client: AsyncClient, db_session: AsyncSession) -> None:
    art = await _db_artifact(db_session, image_path=None)
    with patch("app.api.auto_detection.is_artdet_available", return_value=True):
        r = await async_client.post(f"{AUTO_BASE}/artifact/{art.id}/auto-detect")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_auto_detect_artdet_unavailable_503(async_client: AsyncClient, db_session: AsyncSession) -> None:
    art = await _db_artifact(db_session, image_path="artifacts/x.jpg")
    with patch("app.api.auto_detection.is_artdet_available", return_value=False):
        r = await async_client.post(f"{AUTO_BASE}/artifact/{art.id}/auto-detect")
    assert r.status_code == 503


@pytest.mark.asyncio
async def test_auto_detect_minio_path_not_detected(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    art = await _db_artifact(db_session, image_path="artifacts/obj.jpg")
    mock_obj = MagicMock()
    mock_obj.read.return_value = b"fake-image-data"
    mock_service = MagicMock()
    mock_service.detect_damage.return_value = _detect_result(detected=False)

    with (
        patch("app.api.auto_detection.is_artdet_available", return_value=True),
        patch("app.api.auto_detection.get_artdet_service", return_value=mock_service),
        patch("app.api.auto_detection.minio_service.get_object", return_value=mock_obj),
    ):
        r = await async_client.post(f"{AUTO_BASE}/artifact/{art.id}/auto-detect")

    assert r.status_code == 200
    data = r.json()
    assert data["detected"] is False
    assert data["detections_created"] == 0


@pytest.mark.asyncio
async def test_auto_detect_detected_non_critical_no_ticket(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    art = await _db_artifact(db_session, image_path="artifacts/obj.jpg")
    mock_obj = MagicMock()
    mock_obj.read.return_value = b"fake-image-data"
    mock_service = MagicMock()
    mock_service.detect_damage.return_value = _detect_result(
        detected=True,
        damage_percentage=3.0,
        damage_count=1,
        damage_areas=[{"bbox": [0, 0, 10, 10], "confidence": 0.95}],
    )

    with (
        patch("app.api.auto_detection.is_artdet_available", return_value=True),
        patch("app.api.auto_detection.get_artdet_service", return_value=mock_service),
        patch("app.api.auto_detection.minio_service.get_object", return_value=mock_obj),
    ):
        r = await async_client.post(
            f"{AUTO_BASE}/artifact/{art.id}/auto-detect",
            params={"create_tickets": False},
        )

    assert r.status_code == 200
    data = r.json()
    assert data["detections_created"] >= 1
    assert data["ticket_created"] is False


@pytest.mark.asyncio
async def test_auto_detect_critical_creates_ticket_updates_status(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    art = await _db_artifact(db_session, status="no_defects", image_path="artifacts/crit.jpg")
    mock_obj = MagicMock()
    mock_obj.read.return_value = b"fake-image-data"
    mock_service = MagicMock()
    mock_service.detect_damage.return_value = _detect_result(
        detected=True,
        damage_percentage=12.0,
        damage_count=1,
        damage_areas=[{"bbox": [0, 0, 10, 10], "confidence": 0.95}],
    )

    with (
        patch("app.api.auto_detection.is_artdet_available", return_value=True),
        patch("app.api.auto_detection.get_artdet_service", return_value=mock_service),
        patch("app.api.auto_detection.minio_service.get_object", return_value=mock_obj),
        patch("app.api.auto_detection.create_notification", new_callable=AsyncMock),
    ):
        r = await async_client.post(
            f"{AUTO_BASE}/artifact/{art.id}/auto-detect",
            params={"create_tickets": True},
        )

    assert r.status_code == 200
    data = r.json()
    assert data["ticket_created"] is True

    res = await db_session.execute(select(Artifact).where(Artifact.id == art.id))
    updated = res.scalar_one()
    assert updated.status == "requires_attention"


@pytest.mark.asyncio
async def test_auto_detect_local_path_exists_not_detected(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    art = await _db_artifact(db_session, image_path="/tmp/local-artifact.jpg")
    mock_service = MagicMock()
    mock_service.detect_damage.return_value = _detect_result(detected=False)

    with (
        patch("app.api.auto_detection.is_artdet_available", return_value=True),
        patch("app.api.auto_detection.get_artdet_service", return_value=mock_service),
        patch("app.api.auto_detection.os.path.exists", return_value=True),
    ):
        r = await async_client.post(f"{AUTO_BASE}/artifact/{art.id}/auto-detect")

    assert r.status_code == 200
    assert r.json()["detected"] is False


@pytest.mark.asyncio
async def test_auto_detect_local_path_missing_file_404(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    art = await _db_artifact(db_session, image_path="/tmp/missing.jpg")
    mock_service = MagicMock()

    with (
        patch("app.api.auto_detection.is_artdet_available", return_value=True),
        patch("app.api.auto_detection.get_artdet_service", return_value=mock_service),
        patch("app.api.auto_detection.os.path.exists", return_value=False),
    ):
        r = await async_client.post(f"{AUTO_BASE}/artifact/{art.id}/auto-detect")

    assert r.status_code == 404


@pytest.mark.asyncio
async def test_auto_detect_artdet_raises_500(async_client: AsyncClient, db_session: AsyncSession) -> None:
    art = await _db_artifact(db_session, image_path="artifacts/boom.jpg")
    mock_obj = MagicMock()
    mock_obj.read.return_value = b"fake-image-data"
    mock_service = MagicMock()
    mock_service.detect_damage.side_effect = RuntimeError("model failure")

    with (
        patch("app.api.auto_detection.is_artdet_available", return_value=True),
        patch("app.api.auto_detection.get_artdet_service", return_value=mock_service),
        patch("app.api.auto_detection.minio_service.get_object", return_value=mock_obj),
    ):
        r = await async_client.post(f"{AUTO_BASE}/artifact/{art.id}/auto-detect")

    assert r.status_code == 500


@pytest.mark.asyncio
async def test_auto_detect_min_confidence_query_passed_through(
    async_client: AsyncClient, db_session: AsyncSession
) -> None:
    art = await _db_artifact(db_session, image_path="artifacts/param.jpg")
    mock_obj = MagicMock()
    mock_obj.read.return_value = b"fake-image-data"
    mock_service = MagicMock()
    mock_service.detect_damage.return_value = _detect_result(detected=False)

    with (
        patch("app.api.auto_detection.is_artdet_available", return_value=True),
        patch("app.api.auto_detection.get_artdet_service", return_value=mock_service),
        patch("app.api.auto_detection.minio_service.get_object", return_value=mock_obj),
    ):
        r = await async_client.post(
            f"{AUTO_BASE}/artifact/{art.id}/auto-detect",
            params={"min_confidence": 0.37},
        )

    assert r.status_code == 200
    mock_service.detect_damage.assert_called_once()
    assert mock_service.detect_damage.call_args.kwargs["min_confidence"] == 0.37
