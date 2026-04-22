"""Integration tests for app.api.artifacts."""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

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

ARTIFACTS_BASE = "/api/artifacts"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def artifact_payload(**overrides: object) -> dict:
    """Body for ArtifactCreate — field names are snake_case (see schemas.ArtifactBase)."""
    base: dict = {
        "title": "Test Artifact",
        "inventory_number": "INV-001",
        "collection": "Test Collection",
        "status": "good",
        "description": "A test artifact",
        "current_location": "Room 1",
        "dimensions": None,
        "materials": None,
        "image_path": None,
        "creation_date": "XVIII век",
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
    image_path: str | None = None,
    last_inspection=None,
    last_inspector_id: str | None = None,
) -> Artifact:
    inv = inventory_number or f"INV-{uuid.uuid4().hex[:10]}"
    a = Artifact(
        title=title,
        inventory_number=inv,
        collection=collection,
        status=status,
        description="d",
        current_location="loc",
        image_path=image_path,
        last_inspection=last_inspection,
        last_inspector_id=last_inspector_id,
    )
    db_session.add(a)
    await db_session.commit()
    await db_session.refresh(a)
    return a


MOCK_IMG_URL = "http://mock-url/img.jpg"


@contextmanager
def patched_minio():
    with (
        patch("app.api.artifacts.minio_service.get_presigned_url", return_value=MOCK_IMG_URL),
        patch("app.api.artifacts.minio_service.get_public_url", return_value=MOCK_IMG_URL),
        patch("app.api.artifacts.minio_service.delete_object", return_value=None),
    ):
        yield


# --- GET /artifacts/ ---


@pytest.mark.asyncio
async def test_list_artifacts_unauthenticated_200(async_client: AsyncClient):
    r = await async_client.get(f"{ARTIFACTS_BASE}/")
    assert r.status_code == 200
    body = r.json()
    assert "artifacts" in body
    assert isinstance(body["artifacts"], list)
    assert "pagination" in body


@pytest.mark.asyncio
async def test_list_artifacts_authenticated_200(async_client: AsyncClient, viewer_token: str):
    r = await async_client.get(f"{ARTIFACTS_BASE}/", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    assert "artifacts" in r.json()


@pytest.mark.asyncio
async def test_list_artifacts_search_q_filters_title(
    async_client: AsyncClient, db_session: AsyncSession
):
    inv_a = f"SRCH-A-{uuid.uuid4().hex[:8]}"
    inv_b = f"SRCH-B-{uuid.uuid4().hex[:8]}"
    await _db_artifact(db_session, title="UniqueAlphaTitle", inventory_number=inv_a)
    await _db_artifact(db_session, title="OtherBeta", inventory_number=inv_b)
    r = await async_client.get(f"{ARTIFACTS_BASE}/", params={"q": "Alpha"})
    assert r.status_code == 200
    titles = [a["title"] for a in r.json()["artifacts"]]
    assert "UniqueAlphaTitle" in titles
    assert "OtherBeta" not in titles


@pytest.mark.asyncio
async def test_list_last_inspection_visible_for_admin_not_viewer(
    async_client: AsyncClient,
    db_session: AsyncSession,
    admin_token: str,
    viewer_token: str,
    admin_user: User,
):
    inv = f"I-INSPECT-{uuid.uuid4().hex[:8]}"
    a = await _db_artifact(db_session, title="InspectMe", inventory_number=inv)
    a.last_inspection = datetime.now(timezone.utc)
    a.last_inspector_id = admin_user.id
    await db_session.commit()

    r_admin = await async_client.get(f"{ARTIFACTS_BASE}/", headers=auth_headers(admin_token))
    r_viewer = await async_client.get(f"{ARTIFACTS_BASE}/", headers=auth_headers(viewer_token))
    assert r_admin.status_code == 200
    assert r_viewer.status_code == 200
    admin_item = next(x for x in r_admin.json()["artifacts"] if x["title"] == "InspectMe")
    viewer_item = next(x for x in r_viewer.json()["artifacts"] if x["title"] == "InspectMe")
    assert "lastInspection" in admin_item
    assert admin_item["lastInspection"]
    assert "lastInspection" not in viewer_item


# --- GET /artifacts/{id} ---


@pytest.mark.asyncio
async def test_get_artifact_by_id_200(async_client: AsyncClient, db_session: AsyncSession):
    a = await _db_artifact(db_session, title="Single", inventory_number="I-SINGLE")
    r = await async_client.get(f"{ARTIFACTS_BASE}/{a.id}")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == a.id
    assert data["title"] == "Single"


@pytest.mark.asyncio
async def test_get_artifact_not_found_404(async_client: AsyncClient):
    r = await async_client.get(f"{ARTIFACTS_BASE}/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_artifact_presigned_url_for_non_http_image_path(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _db_artifact(
        db_session,
        title="Img",
        inventory_number="I-IMG",
        image_path="private/object-key",
    )
    row = await db_session.execute(select(Artifact).where(Artifact.inventory_number == "I-IMG"))
    art = row.scalar_one()
    with patch("app.api.artifacts.minio_service.get_presigned_url", return_value=MOCK_IMG_URL):
        r = await async_client.get(f"{ARTIFACTS_BASE}/{art.id}")
    assert r.status_code == 200
    assert r.json()["images"] == [MOCK_IMG_URL]


# --- POST /artifacts/ ---


@pytest.mark.asyncio
async def test_create_artifact_curator_200(async_client: AsyncClient, curator_token: str):
    inv = f"INV-{uuid.uuid4().hex[:8]}"
    body = artifact_payload(inventory_number=inv)
    mock_notify = AsyncMock()
    with patched_minio(), patch("app.api.artifacts.notify_artifact_created", new=mock_notify):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(curator_token),
            json=body,
        )
    assert r.status_code == 200
    assert r.json()["inventoryNumber"] == inv
    assert mock_notify.await_count == 1


@pytest.mark.asyncio
async def test_create_artifact_admin_200(async_client: AsyncClient, admin_token: str):
    inv = f"INV-{uuid.uuid4().hex[:8]}"
    body = artifact_payload(inventory_number=inv, title="Admin Made")
    with patched_minio(), patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(admin_token),
            json=body,
        )
    assert r.status_code == 200
    assert r.json()["title"] == "Admin Made"


@pytest.mark.asyncio
async def test_create_artifact_viewer_403(async_client: AsyncClient, viewer_token: str):
    inv = f"INV-{uuid.uuid4().hex[:8]}"
    with patched_minio(), patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(viewer_token),
            json=artifact_payload(inventory_number=inv),
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_artifact_restorer_403(async_client: AsyncClient, restorer_token: str):
    inv = f"INV-{uuid.uuid4().hex[:8]}"
    with patched_minio(), patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(restorer_token),
            json=artifact_payload(inventory_number=inv),
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_create_artifact_duplicate_inventory_400(
    async_client: AsyncClient, curator_token: str, db_session: AsyncSession
):
    inv = f"DUP-{uuid.uuid4().hex[:8]}"
    await _db_artifact(db_session, title="Existing", inventory_number=inv)
    with patched_minio(), patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(curator_token),
            json=artifact_payload(inventory_number=inv, title="New"),
        )
    assert r.status_code == 400
    assert inv in r.json()["detail"]


@pytest.mark.asyncio
async def test_create_artifact_missing_title_422(async_client: AsyncClient, curator_token: str):
    body = artifact_payload()
    del body["title"]
    body["inventory_number"] = f"INV-{uuid.uuid4().hex[:8]}"
    with patched_minio(), patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(curator_token),
            json=body,
        )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_create_artifact_status_good_maps_to_no_defects_in_db(
    async_client: AsyncClient, curator_token: str, db_session: AsyncSession
):
    inv = f"INV-{uuid.uuid4().hex[:8]}"
    with patched_minio(), patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(curator_token),
            json=artifact_payload(inventory_number=inv, status="good"),
        )
    assert r.status_code == 200
    row = await db_session.execute(select(Artifact).where(Artifact.inventory_number == inv))
    art = row.scalar_one()
    assert art.status == "no_defects"


@pytest.mark.asyncio
async def test_create_artifact_notify_called_once(async_client: AsyncClient, curator_token: str):
    inv = f"INV-{uuid.uuid4().hex[:8]}"
    mock_notify = AsyncMock()
    with patched_minio(), patch("app.api.artifacts.notify_artifact_created", new=mock_notify):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(curator_token),
            json=artifact_payload(inventory_number=inv),
        )
    assert r.status_code == 200
    assert mock_notify.await_count == 1


# --- PUT /artifacts/{id} ---


@pytest.mark.asyncio
async def test_update_artifact_curator_title_200(
    async_client: AsyncClient, curator_token: str, db_session: AsyncSession
):
    a = await _db_artifact(db_session, title="Old", inventory_number="I-PUT-1")
    body = artifact_payload(
        title="NewTitle",
        inventory_number=a.inventory_number,
        collection=a.collection,
    )
    mock_status = AsyncMock()
    with patched_minio(), patch("app.api.artifacts.notify_artifact_status_changed", new=mock_status):
        r = await async_client.put(
            f"{ARTIFACTS_BASE}/{a.id}",
            headers=auth_headers(curator_token),
            json=body,
        )
    assert r.status_code == 200
    await db_session.refresh(a)
    assert a.title == "NewTitle"
    mock_status.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_artifact_status_change_calls_notify(
    async_client: AsyncClient, curator_token: str, db_session: AsyncSession
):
    a = await _db_artifact(db_session, title="S", inventory_number="I-ST-1", status="no_defects")
    body = artifact_payload(
        title=a.title,
        inventory_number=a.inventory_number,
        collection=a.collection,
        status="critical",
    )
    mock_status = AsyncMock()
    with patched_minio(), patch("app.api.artifacts.notify_artifact_status_changed", new=mock_status):
        r = await async_client.put(
            f"{ARTIFACTS_BASE}/{a.id}",
            headers=auth_headers(curator_token),
            json=body,
        )
    assert r.status_code == 200
    mock_status.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_artifact_status_unchanged_notify_not_called(
    async_client: AsyncClient, curator_token: str, db_session: AsyncSession
):
    a = await _db_artifact(db_session, title="S2", inventory_number="I-ST-2", status="no_defects")
    body = artifact_payload(
        title="S2b",
        inventory_number=a.inventory_number,
        collection=a.collection,
        status="good",
    )
    mock_status = AsyncMock()
    with patched_minio(), patch("app.api.artifacts.notify_artifact_status_changed", new=mock_status):
        r = await async_client.put(
            f"{ARTIFACTS_BASE}/{a.id}",
            headers=auth_headers(curator_token),
            json=body,
        )
    assert r.status_code == 200
    mock_status.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_artifact_viewer_403(
    async_client: AsyncClient, viewer_token: str, db_session: AsyncSession
):
    a = await _db_artifact(db_session, inventory_number="I-V-PUT")
    body = artifact_payload(title="X", inventory_number=a.inventory_number, collection=a.collection)
    with patched_minio(), patch("app.api.artifacts.notify_artifact_status_changed", new=AsyncMock()):
        r = await async_client.put(
            f"{ARTIFACTS_BASE}/{a.id}",
            headers=auth_headers(viewer_token),
            json=body,
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_artifact_not_found_404(async_client: AsyncClient, curator_token: str):
    body = artifact_payload(inventory_number="INV-NONE")
    with patched_minio(), patch("app.api.artifacts.notify_artifact_status_changed", new=AsyncMock()):
        r = await async_client.put(
            f"{ARTIFACTS_BASE}/{uuid.uuid4()}",
            headers=auth_headers(curator_token),
            json=body,
        )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_artifact_inventory_conflict_400(
    async_client: AsyncClient, curator_token: str, db_session: AsyncSession
):
    inv1 = f"I-C1-{uuid.uuid4().hex[:8]}"
    inv2 = f"I-C2-{uuid.uuid4().hex[:8]}"
    a1 = await _db_artifact(db_session, title="A1", inventory_number=inv1)
    a2 = await _db_artifact(db_session, title="A2", inventory_number=inv2)
    body = artifact_payload(
        title=a2.title,
        inventory_number=a1.inventory_number,
        collection=a2.collection,
    )
    with patched_minio(), patch("app.api.artifacts.notify_artifact_status_changed", new=AsyncMock()):
        r = await async_client.put(
            f"{ARTIFACTS_BASE}/{a2.id}",
            headers=auth_headers(curator_token),
            json=body,
        )
    assert r.status_code == 400
    assert inv1 in r.json()["detail"]


# --- DELETE /artifacts/{id} ---


@pytest.mark.asyncio
async def test_delete_artifact_curator_200(async_client: AsyncClient, curator_token: str, db_session: AsyncSession):
    a = await _db_artifact(db_session, inventory_number=f"I-DEL-1-{uuid.uuid4().hex[:8]}")
    with patched_minio():
        r = await async_client.delete(f"{ARTIFACTS_BASE}/{a.id}", headers=auth_headers(curator_token))
    assert r.status_code == 200
    assert r.json() == {"success": True, "message": "Artifact deleted successfully"}
    row = await db_session.execute(select(Artifact).where(Artifact.id == a.id))
    assert row.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_artifact_with_image_calls_delete_object(
    async_client: AsyncClient, curator_token: str, db_session: AsyncSession
):
    a = await _db_artifact(
        db_session,
        inventory_number="I-DEL-IMG",
        image_path="old/minio/key",
    )
    mock_del = MagicMock(return_value=None)
    with patch("app.api.artifacts.minio_service.delete_object", new=mock_del):
        r = await async_client.delete(f"{ARTIFACTS_BASE}/{a.id}", headers=auth_headers(curator_token))
    assert r.status_code == 200
    mock_del.assert_called_once_with("old/minio/key")


@pytest.mark.asyncio
async def test_delete_artifact_viewer_403(async_client: AsyncClient, viewer_token: str, db_session: AsyncSession):
    a = await _db_artifact(db_session, inventory_number="I-DEL-V")
    with patch("app.api.artifacts.minio_service.delete_object", return_value=None):
        r = await async_client.delete(f"{ARTIFACTS_BASE}/{a.id}", headers=auth_headers(viewer_token))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_delete_artifact_not_found_404(async_client: AsyncClient, curator_token: str):
    with patch("app.api.artifacts.minio_service.delete_object", return_value=None):
        r = await async_client.delete(
            f"{ARTIFACTS_BASE}/{uuid.uuid4()}",
            headers=auth_headers(curator_token),
        )
    assert r.status_code == 404


# --- POST /artifacts/{id}/inspect ---


@pytest.mark.asyncio
async def test_inspect_restorer_200(
    async_client: AsyncClient, restorer_token: str, restorer_user: User, db_session: AsyncSession
):
    a = await _db_artifact(db_session, inventory_number=f"I-INSP-R-{uuid.uuid4().hex[:8]}")
    r = await async_client.post(
        f"{ARTIFACTS_BASE}/{a.id}/inspect",
        headers=auth_headers(restorer_token),
    )
    assert r.status_code == 200
    row = await db_session.execute(select(Artifact).where(Artifact.id == a.id))
    art = row.scalar_one()
    assert art.last_inspector_id == restorer_user.id
    assert art.last_inspection is not None


@pytest.mark.asyncio
async def test_inspect_curator_200(
    async_client: AsyncClient, curator_token: str, curator_user: User, db_session: AsyncSession
):
    a = await _db_artifact(db_session, inventory_number=f"I-INSP-C-{uuid.uuid4().hex[:8]}")
    r = await async_client.post(
        f"{ARTIFACTS_BASE}/{a.id}/inspect",
        headers=auth_headers(curator_token),
    )
    assert r.status_code == 200
    row = await db_session.execute(select(Artifact).where(Artifact.id == a.id))
    art = row.scalar_one()
    assert art.last_inspector_id == curator_user.id


@pytest.mark.asyncio
async def test_inspect_viewer_403(async_client: AsyncClient, viewer_token: str, db_session: AsyncSession):
    a = await _db_artifact(db_session, inventory_number=f"I-INSP-V-{uuid.uuid4().hex[:8]}")
    r = await async_client.post(
        f"{ARTIFACTS_BASE}/{a.id}/inspect",
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_inspect_not_found_404(async_client: AsyncClient, curator_token: str):
    r = await async_client.post(
        f"{ARTIFACTS_BASE}/{uuid.uuid4()}/inspect",
        headers=auth_headers(curator_token),
    )
    assert r.status_code == 404
