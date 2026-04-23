"""E2E tests for main backend user flows."""

from __future__ import annotations

import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Request, Response
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_met_museum_service
from app.main import app
from app.models import Artifact, Detection, RefreshToken, Ticket, User
from app.security import create_access_token
from tests.conftest import TestSessionLocal, _create_user

AUTH_BASE = "/api/auth"
ARTIFACTS_BASE = "/api/artifacts"
TICKETS_BASE = "/api/tickets"
IMAGES_BASE = "/api/images"
MUSEUM_BASE = "/api/museum"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def make_artifact_payload(title: str, collection: str) -> dict:
    return {
        "title": title,
        "inventory_number": f"INV-{uuid.uuid4().hex[:10]}",
        "collection": collection,
        "status": "good",
        "description": f"Описание {title}",
        "current_location": "Зал 1",
        "dimensions": None,
        "materials": None,
        "image_path": None,
        "creation_date": "XVIII век",
    }


def make_ticket_payload(artifact_id: str) -> dict:
    return {
        "artifact_id": artifact_id,
        "title": "Реставрационный тикет",
        "description": "Проверить состояние объекта",
        "priority": "medium",
        "assigned_to_id": None,
        "notes": "Создано в E2E тесте",
    }


def _refresh_cookie_set(response: httpx.Response) -> bool:
    for key, value in response.headers.multi_items():
        if key.lower() == "set-cookie" and value.lower().startswith("refresh_token="):
            return True
    return False


def _refresh_cookie_cleared(response: httpx.Response) -> bool:
    for key, value in response.headers.multi_items():
        if key.lower() == "set-cookie" and value.lower().startswith("refresh_token="):
            low = value.lower()
            if "max-age=0" in low or "expires=" in low:
                return True
    return False


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
        finally:
            await session.rollback()
            await session.close()


@pytest_asyncio.fixture(scope="function")
async def _ensure_clean_db(db_session: AsyncSession) -> None:
    # Полная очистка таблиц перед каждым сценарием E2E.
    await db_session.execute(delete(RefreshToken))
    await db_session.execute(delete(Detection))
    await db_session.execute(delete(Ticket))
    await db_session.execute(delete(Artifact))
    await db_session.execute(delete(User))
    await db_session.commit()


@pytest_asyncio.fixture(scope="function")
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


@pytest_asyncio.fixture(scope="function")
async def viewer_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "viewer", "e2e_viewer")


@pytest_asyncio.fixture(scope="function")
async def admin_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "admin", "e2e_admin")


@pytest_asyncio.fixture(scope="function")
async def curator_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "curator", "e2e_curator")


@pytest_asyncio.fixture(scope="function")
async def restorer_user(db_session: AsyncSession, _ensure_clean_db: None) -> User:
    return await _create_user(db_session, "restorer", "e2e_restorer")


@pytest_asyncio.fixture(scope="function")
async def viewer_token(viewer_user: User) -> str:
    return create_access_token({"sub": viewer_user.id, "email": viewer_user.email})


@pytest_asyncio.fixture(scope="function")
async def admin_token(admin_user: User) -> str:
    return create_access_token({"sub": admin_user.id, "email": admin_user.email})


@pytest_asyncio.fixture(scope="function")
async def curator_token(curator_user: User) -> str:
    return create_access_token({"sub": curator_user.id, "email": curator_user.email})


@pytest_asyncio.fixture(scope="function")
async def restorer_token(restorer_user: User) -> str:
    return create_access_token({"sub": restorer_user.id, "email": restorer_user.email})


# --- 4.1 Session lifecycle ---


@pytest.mark.asyncio
async def test_01_register_login_me(async_client: AsyncClient):
    email = f"e2e_{uuid.uuid4().hex[:12]}@example.com"
    body = {"email": email, "name": "Мария", "password": "testpassword123"}
    with patch("app.utils.notifications.notify_user_created", new=AsyncMock()):
        r_register = await async_client.post(f"{AUTH_BASE}/register", json=body)
    assert r_register.status_code == 200

    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": email, "password": "testpassword123"},
    )
    assert r_login.status_code == 200
    token = r_login.json()["access_token"]

    r_me = await async_client.get(f"{AUTH_BASE}/me", headers=auth_headers(token))
    assert r_me.status_code == 200
    assert r_me.json()["email"] == email


@pytest.mark.asyncio
async def test_02_logout_blocks_session_or_clears_cookie(async_client: AsyncClient):
    email = f"e2e_{uuid.uuid4().hex[:12]}@example.com"
    with patch("app.utils.notifications.notify_user_created", new=AsyncMock()):
        await async_client.post(
            f"{AUTH_BASE}/register",
            json={"email": email, "name": "Олег", "password": "testpassword123"},
        )
    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": email, "password": "testpassword123"},
    )
    token = r_login.json()["access_token"]

    r_logout = await async_client.post(f"{AUTH_BASE}/logout")
    assert r_logout.status_code == 200
    r_me = await async_client.get(f"{AUTH_BASE}/me", headers=auth_headers(token))
    if r_me.status_code == 401:
        assert True
    else:
        assert r_me.status_code == 200
        assert _refresh_cookie_cleared(r_logout)


@pytest.mark.asyncio
async def test_03_refresh_after_logout_same_cookie_401(async_client: AsyncClient):
    email = f"e2e_{uuid.uuid4().hex[:12]}@example.com"
    with patch("app.utils.notifications.notify_user_created", new=AsyncMock()):
        await async_client.post(
            f"{AUTH_BASE}/register",
            json={"email": email, "name": "Анна", "password": "testpassword123"},
        )
    r_login = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": email, "password": "testpassword123"},
    )
    cookie = r_login.cookies.get("refresh_token")
    assert cookie
    await async_client.post(f"{AUTH_BASE}/logout")
    r_refresh = await async_client.post(f"{AUTH_BASE}/refresh", cookies={"refresh_token": cookie})
    assert r_refresh.status_code == 401


@pytest.mark.asyncio
async def test_04_second_login_reuses_refresh_cookie(async_client: AsyncClient):
    email = f"e2e_{uuid.uuid4().hex[:12]}@example.com"
    with patch("app.utils.notifications.notify_user_created", new=AsyncMock()):
        await async_client.post(
            f"{AUTH_BASE}/register",
            json={"email": email, "name": "Иван", "password": "testpassword123"},
        )
    r_first = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": email, "password": "testpassword123"},
    )
    assert r_first.status_code == 200
    assert _refresh_cookie_set(r_first)

    r_second = await async_client.post(
        f"{AUTH_BASE}/login",
        json={"email": email, "password": "testpassword123"},
    )
    assert r_second.status_code == 200
    assert not _refresh_cookie_set(r_second)


# --- 4.2 CRUD по ролям ---


@pytest.mark.asyncio
async def test_05_admin_creates_artifact(async_client: AsyncClient, admin_token: str):
    payload = make_artifact_payload("Админ-артефакт", "Коллекция A")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(admin_token),
            json=payload,
        )
    assert r.status_code in (200, 201)
    assert isinstance(r.json().get("id"), str) and r.json()["id"]


@pytest.mark.asyncio
async def test_06_viewer_cannot_create_artifact(async_client: AsyncClient, viewer_token: str):
    payload = make_artifact_payload("Viewer-артефакт", "Коллекция B")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r = await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(viewer_token),
            json=payload,
        )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_07_admin_updates_artifact(async_client: AsyncClient, admin_token: str):
    payload = make_artifact_payload("Обновление-админ", "Коллекция C")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r_create = await async_client.post(
            f"{ARTIFACTS_BASE}/", headers=auth_headers(admin_token), json=payload
        )
    artifact_id = r_create.json()["id"]
    payload["title"] = "Обновление-админ-2"
    with patch("app.api.artifacts.notify_artifact_status_changed", new=AsyncMock()):
        r_update = await async_client.put(
            f"{ARTIFACTS_BASE}/{artifact_id}",
            headers=auth_headers(admin_token),
            json=payload,
        )
    assert r_update.status_code == 200


@pytest.mark.asyncio
async def test_08_curator_updates_artifact(async_client: AsyncClient, admin_token: str, curator_token: str):
    payload = make_artifact_payload("Обновление-куратор", "Коллекция D")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r_create = await async_client.post(
            f"{ARTIFACTS_BASE}/", headers=auth_headers(admin_token), json=payload
        )
    artifact_id = r_create.json()["id"]
    payload["title"] = "Обновление-куратор-2"
    with patch("app.api.artifacts.notify_artifact_status_changed", new=AsyncMock()):
        r_update = await async_client.put(
            f"{ARTIFACTS_BASE}/{artifact_id}",
            headers=auth_headers(curator_token),
            json=payload,
        )
    assert r_update.status_code == 200


@pytest.mark.asyncio
async def test_09_viewer_cannot_delete_artifact(async_client: AsyncClient, admin_token: str, viewer_token: str):
    payload = make_artifact_payload("Удаление-viewer", "Коллекция E")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r_create = await async_client.post(
            f"{ARTIFACTS_BASE}/", headers=auth_headers(admin_token), json=payload
        )
    artifact_id = r_create.json()["id"]
    with patch("app.api.artifacts.minio_service.delete_object", return_value=None):
        r_delete = await async_client.delete(
            f"{ARTIFACTS_BASE}/{artifact_id}",
            headers=auth_headers(viewer_token),
        )
    assert r_delete.status_code == 403


@pytest.mark.asyncio
async def test_10_admin_deletes_artifact(async_client: AsyncClient, admin_token: str):
    payload = make_artifact_payload("Удаление-admin", "Коллекция F")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r_create = await async_client.post(
            f"{ARTIFACTS_BASE}/", headers=auth_headers(admin_token), json=payload
        )
    artifact_id = r_create.json()["id"]
    with patch("app.api.artifacts.minio_service.delete_object", return_value=None):
        r_delete = await async_client.delete(
            f"{ARTIFACTS_BASE}/{artifact_id}",
            headers=auth_headers(admin_token),
        )
    assert r_delete.status_code in (200, 204)


@pytest.mark.asyncio
async def test_11_restorer_creates_ticket(async_client: AsyncClient, admin_token: str, restorer_token: str):
    payload = make_artifact_payload("Тикет-основа", "Коллекция T1")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r_artifact = await async_client.post(
            f"{ARTIFACTS_BASE}/", headers=auth_headers(admin_token), json=payload
        )
    artifact_id = r_artifact.json()["id"]
    with (
        patch("app.api.tickets.notify_ticket_assigned", new=AsyncMock()),
        patch("app.api.tickets.notify_ticket_created_unassigned", new=AsyncMock()),
    ):
        r_ticket = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(restorer_token),
            json=make_ticket_payload(artifact_id),
        )
    assert r_ticket.status_code in (200, 201)


@pytest.mark.asyncio
async def test_12_viewer_cannot_create_ticket(async_client: AsyncClient, admin_token: str, viewer_token: str):
    payload = make_artifact_payload("Тикет-viewer", "Коллекция T2")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r_artifact = await async_client.post(
            f"{ARTIFACTS_BASE}/", headers=auth_headers(admin_token), json=payload
        )
    artifact_id = r_artifact.json()["id"]
    with (
        patch("app.api.tickets.notify_ticket_assigned", new=AsyncMock()),
        patch("app.api.tickets.notify_ticket_created_unassigned", new=AsyncMock()),
    ):
        r_ticket = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(viewer_token),
            json=make_ticket_payload(artifact_id),
        )
    assert r_ticket.status_code == 403


@pytest.mark.asyncio
async def test_13_admin_resolves_ticket(async_client: AsyncClient, admin_token: str, restorer_token: str):
    payload = make_artifact_payload("Тикет-resolve", "Коллекция T3")
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        r_artifact = await async_client.post(
            f"{ARTIFACTS_BASE}/", headers=auth_headers(admin_token), json=payload
        )
    artifact_id = r_artifact.json()["id"]
    with (
        patch("app.api.tickets.notify_ticket_assigned", new=AsyncMock()),
        patch("app.api.tickets.notify_ticket_created_unassigned", new=AsyncMock()),
    ):
        r_ticket = await async_client.post(
            f"{TICKETS_BASE}/",
            headers=auth_headers(restorer_token),
            json=make_ticket_payload(artifact_id),
        )
    ticket_id = r_ticket.json()["id"]
    with patch("app.api.tickets.notify_ticket_assigned", new=AsyncMock()):
        r_update = await async_client.put(
            f"{TICKETS_BASE}/{ticket_id}",
            headers=auth_headers(admin_token),
            json={"status": "completed"},
        )
    assert r_update.status_code == 200


# --- 4.3 Фильтрация, сортировка, пагинация ---


@pytest.mark.asyncio
async def test_14_filter_artifacts_by_collection(async_client: AsyncClient, admin_token: str):
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(admin_token),
            json=make_artifact_payload("Фильтр-1", "Europe"),
        )
        await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(admin_token),
            json=make_artifact_payload("Фильтр-2", "Asia"),
        )
        await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(admin_token),
            json=make_artifact_payload("Фильтр-3", "Europe"),
        )

    r = await async_client.get(f"{ARTIFACTS_BASE}/", params={"collection": "Europe"})
    assert r.status_code == 200
    items = r.json()["artifacts"]
    assert items
    assert all("Europe" in item["collection"] for item in items)


@pytest.mark.asyncio
async def test_15_artifacts_pagination(async_client: AsyncClient, admin_token: str):
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        for idx in range(3):
            await async_client.post(
                f"{ARTIFACTS_BASE}/",
                headers=auth_headers(admin_token),
                json=make_artifact_payload(f"Пагинация-{idx}", "Paged"),
            )
    r = await async_client.get(f"{ARTIFACTS_BASE}/", params={"page": 1, "pageSize": 2})
    assert r.status_code == 200
    data = r.json()
    assert len(data["artifacts"]) == 2
    assert data["pagination"]["totalPages"] == 2


@pytest.mark.asyncio
async def test_16_artifacts_sort_by_title_asc(async_client: AsyncClient, admin_token: str):
    with patch("app.api.artifacts.notify_artifact_created", new=AsyncMock()):
        await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(admin_token),
            json=make_artifact_payload("Zulu", "Sort"),
        )
        await async_client.post(
            f"{ARTIFACTS_BASE}/",
            headers=auth_headers(admin_token),
            json=make_artifact_payload("Alpha", "Sort"),
        )
    r = await async_client.get(
        f"{ARTIFACTS_BASE}/", params={"sortBy": "title", "sortDir": "asc", "pageSize": 20}
    )
    assert r.status_code == 200
    titles = [item["title"] for item in r.json()["artifacts"]]
    assert len(titles) >= 2
    assert titles[0] <= titles[1]


# --- 4.4 Upload файлов (MinIO) ---


@pytest.mark.asyncio
async def test_17_admin_upload_image_calls_minio(async_client: AsyncClient, admin_token: str):
    minio_mock = MagicMock()
    minio_mock.upload_image.return_value = "test-bucket/artifacts/test.jpg"
    minio_mock.get_presigned_url.return_value = "http://minio/presigned/test.jpg"
    minio_mock.get_public_url.return_value = "http://minio/presigned/test.jpg"
    minio_mock.delete_object.return_value = True
    with patch("app.api.images.minio_service", minio_mock):
        r = await async_client.post(
            f"{IMAGES_BASE}/upload",
            headers=auth_headers(admin_token),
            files={"file": ("test.jpg", b"jpeg-bytes", "image/jpeg")},
        )
    assert r.status_code == 200
    assert r.json()["object_path"] == "test-bucket/artifacts/test.jpg"
    minio_mock.upload_image.assert_called_once()


@pytest.mark.asyncio
async def test_18_get_image_returns_presigned_url(async_client: AsyncClient, admin_token: str):
    minio_mock = MagicMock()
    minio_mock.object_exists.return_value = True
    minio_mock.get_presigned_url.return_value = "http://minio/presigned/test.jpg"
    with patch("app.api.images.minio_service", minio_mock):
        r = await async_client.get(
            f"{IMAGES_BASE}/test-bucket/artifacts/test.jpg",
            headers=auth_headers(admin_token),
            follow_redirects=False,
        )
    assert r.status_code in (301, 302, 307, 308)
    assert r.headers["location"] == "http://minio/presigned/test.jpg"


@pytest.mark.asyncio
async def test_19_delete_image_calls_minio_delete(async_client: AsyncClient, admin_token: str):
    minio_mock = MagicMock()
    minio_mock.delete_object.return_value = True
    with patch("app.api.images.minio_service", minio_mock):
        r = await async_client.delete(
            f"{IMAGES_BASE}/test-bucket/artifacts/test.jpg",
            headers=auth_headers(admin_token),
        )
    assert r.status_code in (200, 204)
    minio_mock.delete_object.assert_called_once_with("test-bucket/artifacts/test.jpg")


@pytest.mark.asyncio
async def test_20_upload_unsupported_mime_type(async_client: AsyncClient, admin_token: str):
    minio_mock = MagicMock()
    with patch("app.api.images.minio_service", minio_mock):
        r = await async_client.post(
            f"{IMAGES_BASE}/upload",
            headers=auth_headers(admin_token),
            files={"file": ("doc.pdf", b"pdf-bytes", "application/pdf")},
        )
    assert r.status_code in (400, 422)


# --- 4.5 Внешний API (Met Museum) ---


@pytest.mark.asyncio
async def test_21_museum_inspiration_success(async_client: AsyncClient, viewer_token: str):
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.return_value = {
        "available": True,
        "departments_count": 3,
        "items": [
            {
                "object_id": 1,
                "title": "Painting One",
                "artist_display": "Artist",
                "object_date": "1900",
                "primary_image_small": "http://img/1.jpg",
                "object_url": "http://obj/1",
            }
        ],
        "pagination": {"currentPage": 1, "totalPages": 1, "totalItems": 1, "itemsPerPage": 6},
    }
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service
    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    assert len(r.json()["items"]) > 0


@pytest.mark.asyncio
async def test_22_museum_timeout_graceful_degradation(async_client: AsyncClient, viewer_token: str):
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.side_effect = httpx.TimeoutException("timeout")
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service
    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    data = r.json()
    assert data["available"] is False
    assert "недоступ" in (data["error_message"] or "").lower()


@pytest.mark.asyncio
async def test_23_museum_http_status_error_graceful_degradation(
    async_client: AsyncClient, viewer_token: str
):
    mock_service = AsyncMock()
    request = Request("GET", "https://collectionapi.metmuseum.org/public/collection/v1/search")
    response = Response(status_code=500, request=request)
    mock_service.build_inspiration_page.side_effect = httpx.HTTPStatusError(
        "Met error", request=request, response=response
    )
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service
    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    assert r.json()["available"] is False
