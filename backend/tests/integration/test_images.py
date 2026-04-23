"""Integration tests for app.api.images (prefix /api/images)."""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
from app.main import app
from app.models import (
    AIPreferences,
    Notification,
    NotificationPreferences,
    RefreshToken,
    User,
)
from tests.conftest import _create_user

IMAGES_BASE = "/api/images"


def make_image_file(
    content: bytes = b"fake-jpeg",
    content_type: str = "image/jpeg",
    filename: str = "test.jpg",
) -> tuple[str, bytes, str]:
    return (filename, content, content_type)


@pytest_asyncio.fixture
async def _ensure_clean_db(db_session: AsyncSession) -> None:
    await db_session.execute(delete(Notification))
    await db_session.execute(delete(NotificationPreferences))
    await db_session.execute(delete(AIPreferences))
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
async def async_client_viewer(
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
    return await _create_user(db_session, "viewer", "images")


def _minio_mock() -> MagicMock:
    m = MagicMock()
    m.upload_image.return_value = "artifacts/test-uuid.jpg"
    m.get_presigned_url.return_value = "https://minio.example.com/presigned"
    m.get_public_url.return_value = "https://minio.example.com/public"
    m.object_exists.return_value = True
    m.delete_object.return_value = True
    return m


@pytest.mark.asyncio
async def test_upload_unauthenticated(async_client: AsyncClient) -> None:
    fn, content, ct = make_image_file()
    r = await async_client.post(
        f"{IMAGES_BASE}/upload",
        files={"file": (fn, content, ct)},
    )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_upload_invalid_content_type(async_client_viewer: AsyncClient) -> None:
    fn, content, ct = ("x.txt", b"hello", "text/plain")
    with patch("app.api.images.minio_service", _minio_mock()):
        r = await async_client_viewer.post(
            f"{IMAGES_BASE}/upload",
            files={"file": (fn, content, ct)},
        )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_upload_file_too_large(async_client_viewer: AsyncClient) -> None:
    fn, content, ct = make_image_file(content=b"x" * (10 * 1024 * 1024 + 1))
    with patch("app.api.images.minio_service", _minio_mock()):
        r = await async_client_viewer.post(
            f"{IMAGES_BASE}/upload",
            files={"file": (fn, content, ct)},
        )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_upload_valid_jpeg(async_client_viewer: AsyncClient) -> None:
    fn, content, ct = make_image_file()
    with patch("app.api.images.minio_service", _minio_mock()):
        r = await async_client_viewer.post(
            f"{IMAGES_BASE}/upload",
            files={"file": (fn, content, ct)},
        )
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) >= {"object_path", "url", "filename"}
    assert data["object_path"] == "artifacts/test-uuid.jpg"


@pytest.mark.asyncio
async def test_upload_custom_folder_param(async_client_viewer: AsyncClient) -> None:
    fn, content, ct = make_image_file()
    mock_minio = _minio_mock()
    with patch("app.api.images.minio_service", mock_minio):
        r = await async_client_viewer.post(
            f"{IMAGES_BASE}/upload?folder=defects",
            files={"file": (fn, content, ct)},
        )
    assert r.status_code == 200
    mock_minio.upload_image.assert_called_once()
    assert mock_minio.upload_image.call_args.kwargs["folder"] == "defects"


@pytest.mark.asyncio
async def test_upload_minio_raises_500(async_client_viewer: AsyncClient) -> None:
    fn, content, ct = make_image_file()
    mock_minio = _minio_mock()
    mock_minio.upload_image.side_effect = RuntimeError("upload failed")
    with patch("app.api.images.minio_service", mock_minio):
        r = await async_client_viewer.post(
            f"{IMAGES_BASE}/upload",
            files={"file": (fn, content, ct)},
        )
    assert r.status_code == 500


@pytest.mark.asyncio
async def test_upload_multiple_two_valid(async_client_viewer: AsyncClient) -> None:
    a = make_image_file(filename="a.jpg")
    b = make_image_file(filename="b.jpg")
    with patch("app.api.images.minio_service", _minio_mock()):
        r = await async_client_viewer.post(
            f"{IMAGES_BASE}/upload-multiple",
            files=[("files", a), ("files", b)],
        )
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 2
    assert all(item["success"] for item in results)


@pytest.mark.asyncio
async def test_upload_multiple_valid_and_invalid_type(async_client_viewer: AsyncClient) -> None:
    good = make_image_file(filename="ok.jpg")
    bad = ("bad.txt", b"txt", "text/plain")
    with patch("app.api.images.minio_service", _minio_mock()):
        r = await async_client_viewer.post(
            f"{IMAGES_BASE}/upload-multiple",
            files=[("files", good), ("files", bad)],
        )
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 2
    assert sum(1 for x in results if x["success"]) == 1
    assert sum(1 for x in results if not x["success"]) == 1


@pytest.mark.asyncio
async def test_upload_multiple_valid_and_too_large(async_client_viewer: AsyncClient) -> None:
    good = make_image_file(filename="ok.jpg")
    huge = make_image_file(
        filename="huge.jpg",
        content=b"y" * (10 * 1024 * 1024 + 1),
    )
    with patch("app.api.images.minio_service", _minio_mock()):
        r = await async_client_viewer.post(
            f"{IMAGES_BASE}/upload-multiple",
            files=[("files", good), ("files", huge)],
        )
    assert r.status_code == 200
    results = r.json()["results"]
    assert len(results) == 2
    assert sum(1 for x in results if x["success"]) == 1
    assert sum(1 for x in results if not x["success"]) == 1


@pytest.mark.asyncio
async def test_get_image_object_not_found(async_client_viewer: AsyncClient) -> None:
    mock_minio = _minio_mock()
    mock_minio.object_exists.return_value = False
    with patch("app.api.images.minio_service", mock_minio):
        r = await async_client_viewer.get(f"{IMAGES_BASE}/artifacts/missing.jpg")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_image_redirect(async_client_viewer: AsyncClient) -> None:
    mock_minio = _minio_mock()
    with patch("app.api.images.minio_service", mock_minio):
        r = await async_client_viewer.get(
            f"{IMAGES_BASE}/artifacts/exists.jpg",
            follow_redirects=False,
        )
    assert r.status_code in (301, 302, 307, 308)
    assert r.headers.get("location") == "https://minio.example.com/presigned"


@pytest.mark.asyncio
async def test_delete_image_not_found(async_client_viewer: AsyncClient) -> None:
    mock_minio = _minio_mock()
    mock_minio.delete_object.return_value = False
    with patch("app.api.images.minio_service", mock_minio):
        r = await async_client_viewer.delete(f"{IMAGES_BASE}/artifacts/nope.jpg")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_image_success(async_client_viewer: AsyncClient) -> None:
    mock_minio = _minio_mock()
    with patch("app.api.images.minio_service", mock_minio):
        r = await async_client_viewer.delete(f"{IMAGES_BASE}/artifacts/ok.jpg")
    assert r.status_code == 200
    assert r.json()["success"] is True
