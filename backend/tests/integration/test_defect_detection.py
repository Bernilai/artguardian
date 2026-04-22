"""Integration tests for app.api.defect_detection."""

from __future__ import annotations

import uuid
from typing import AsyncGenerator
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.main import app
from app.models import Artifact, Detection, RefreshToken, Ticket, User
from app.security import create_access_token
from tests.conftest import _create_user

DEFECTS_BASE = "/api/defects"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


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
async def restorer_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "restorer", "fixture")


@pytest_asyncio.fixture
async def viewer_token(viewer_user: User) -> str:
    return create_access_token({"sub": viewer_user.id, "email": viewer_user.email})


@pytest_asyncio.fixture
async def admin_token(admin_user: User) -> str:
    return create_access_token({"sub": admin_user.id, "email": admin_user.email})


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


async def _db_detection(
    db_session: AsyncSession,
    *,
    artifact_id: str,
    detected_by_user_id: str,
    detection_type: str = "crack",
    severity: str = "medium",
    confidence: float = 0.9,
    location_bbox: str = "[0,0,10,10]",
    area_pixels: int = 100,
    area_percent: float = 1.5,
    image_path: str | None = None,
) -> Detection:
    d = Detection(
        artifact_id=artifact_id,
        detected_by_user_id=detected_by_user_id,
        detection_type=detection_type,
        severity=severity,
        confidence=confidence,
        location_bbox=location_bbox,
        area_pixels=area_pixels,
        area_percent=area_percent,
        image_path=image_path,
    )
    db_session.add(d)
    await db_session.commit()
    await db_session.refresh(d)
    return d


# --- GET /api/defects/artifact/{artifact_id} ---


@pytest.mark.asyncio
async def test_list_artifact_detections_200_empty_ok(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    r = await async_client.get(
        f"{DEFECTS_BASE}/artifact/{art.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_artifact_detections_200_two_items(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    await _db_detection(db_session, artifact_id=art.id, detected_by_user_id=admin_user.id)
    await _db_detection(db_session, artifact_id=art.id, detected_by_user_id=admin_user.id)
    r = await async_client.get(
        f"{DEFECTS_BASE}/artifact/{art.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2


@pytest.mark.asyncio
async def test_list_artifact_detections_unauthenticated_401_or_403(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    art = await _db_artifact(db_session)
    r = await async_client.get(f"{DEFECTS_BASE}/artifact/{art.id}")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_artifact_detections_no_rows_empty_list(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    r = await async_client.get(
        f"{DEFECTS_BASE}/artifact/{art.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == []


# --- GET /api/defects/results/{detection_id} ---


@pytest.mark.asyncio
async def test_get_detection_result_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    det = await _db_detection(db_session, artifact_id=art.id, detected_by_user_id=admin_user.id)
    r = await async_client.get(
        f"{DEFECTS_BASE}/results/{det.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == det.id
    assert data["artifact_id"] == art.id
    assert data["detection_type"] == "crack"
    assert data["severity"] == "medium"
    assert data["confidence"] == 0.9
    assert data["location_bbox"] == "[0,0,10,10]"
    assert data["area_pixels"] == 100
    assert data["area_percent"] == 1.5
    assert data["is_critical"] is False
    assert data["status"] == "pending"
    assert "created_at" in data


@pytest.mark.asyncio
async def test_get_detection_result_not_found_404(
    async_client: AsyncClient,
    admin_token: str,
):
    r = await async_client.get(
        f"{DEFECTS_BASE}/results/nonexistent-id-{uuid.uuid4().hex}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "Detection not found"


@pytest.mark.asyncio
async def test_get_detection_result_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.get(f"{DEFECTS_BASE}/results/some-id")
    assert r.status_code in (401, 403)


# --- DELETE /api/defects/{detection_id} ---


@pytest.mark.asyncio
async def test_delete_detection_no_image_path_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    det = await _db_detection(db_session, artifact_id=art.id, detected_by_user_id=admin_user.id, image_path=None)
    r = await async_client.delete(
        f"{DEFECTS_BASE}/{det.id}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 200
    assert r.json() == {"status": "success", "message": "Detection deleted"}


@pytest.mark.asyncio
async def test_delete_detection_with_image_path_calls_remove(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    path = "/tmp/fake_detection_image.png"
    det = await _db_detection(
        db_session,
        artifact_id=art.id,
        detected_by_user_id=admin_user.id,
        image_path=path,
    )
    with (
        patch("app.api.defect_detection.os.path.exists", return_value=True) as m_exists,
        patch("app.api.defect_detection.os.remove") as m_remove,
    ):
        r = await async_client.delete(
            f"{DEFECTS_BASE}/{det.id}",
            headers=auth_headers(admin_token),
        )
    assert r.status_code == 200
    m_exists.assert_called()
    m_remove.assert_called_once_with(path)


@pytest.mark.asyncio
async def test_delete_detection_image_path_exists_false_no_remove(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    path = "/tmp/missing_file.png"
    det = await _db_detection(
        db_session,
        artifact_id=art.id,
        detected_by_user_id=admin_user.id,
        image_path=path,
    )
    with (
        patch("app.api.defect_detection.os.path.exists", return_value=False),
        patch("app.api.defect_detection.os.remove") as m_remove,
    ):
        r = await async_client.delete(
            f"{DEFECTS_BASE}/{det.id}",
            headers=auth_headers(admin_token),
        )
    assert r.status_code == 200
    m_remove.assert_not_called()


@pytest.mark.asyncio
async def test_delete_detection_not_found_404(async_client: AsyncClient, admin_token: str):
    r = await async_client.delete(
        f"{DEFECTS_BASE}/missing-{uuid.uuid4().hex}",
        headers=auth_headers(admin_token),
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "Detection not found"


@pytest.mark.asyncio
async def test_delete_detection_unauthenticated_401_or_403(async_client: AsyncClient):
    r = await async_client.delete(f"{DEFECTS_BASE}/any-id")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_delete_detection_then_get_results_404(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_user: User,
    admin_token: str,
):
    art = await _db_artifact(db_session)
    det = await _db_detection(db_session, artifact_id=art.id, detected_by_user_id=admin_user.id)
    del_r = await async_client.delete(
        f"{DEFECTS_BASE}/{det.id}",
        headers=auth_headers(admin_token),
    )
    assert del_r.status_code == 200
    get_r = await async_client.get(
        f"{DEFECTS_BASE}/results/{det.id}",
        headers=auth_headers(admin_token),
    )
    assert get_r.status_code == 404


@pytest.mark.asyncio
async def test_delete_detection_viewer_allowed_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    viewer_user: User,
    viewer_token: str,
):
    art = await _db_artifact(db_session)
    det = await _db_detection(db_session, artifact_id=art.id, detected_by_user_id=viewer_user.id)
    r = await async_client.delete(
        f"{DEFECTS_BASE}/{det.id}",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_delete_detection_restorer_allowed_200(
    async_client: AsyncClient,
    db_session: AsyncSession,
    restorer_user: User,
    restorer_token: str,
):
    art = await _db_artifact(db_session)
    det = await _db_detection(db_session, artifact_id=art.id, detected_by_user_id=restorer_user.id)
    r = await async_client.delete(
        f"{DEFECTS_BASE}/{det.id}",
        headers=auth_headers(restorer_token),
    )
    assert r.status_code == 200
