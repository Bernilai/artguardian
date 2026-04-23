"""Integration tests for app.api.museum_reference."""

from __future__ import annotations

from typing import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_met_museum_service
from app.main import app
from app.models import Artifact, Detection, RefreshToken, Ticket, User
from tests.conftest import _create_user

MUSEUM_BASE = "/api/museum"


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def success_service_payload() -> dict:
    return {
        "available": True,
        "departments_count": 12,
        "items": [
            {
                "object_id": 1,
                "title": "Mona Lisa",
                "artist_display": "Da Vinci",
                "object_date": "1503",
                "primary_image_small": "https://example.com/img.jpg",
                "object_url": "https://example.com/obj",
            }
        ],
        "pagination": {
            "currentPage": 1,
            "totalPages": 17,
            "totalItems": 100,
            "itemsPerPage": 6,
        },
    }


def empty_service_payload() -> dict:
    return {
        "available": True,
        "departments_count": 0,
        "items": [],
        "pagination": {
            "currentPage": 1,
            "totalPages": 0,
            "totalItems": 0,
            "itemsPerPage": 6,
        },
    }


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
    return await _create_user(db_session, "viewer", "museum_ref")


@pytest_asyncio.fixture
async def viewer_token(viewer_user: User) -> str:
    from app.security import create_access_token

    return create_access_token({"sub": viewer_user.id, "email": viewer_user.email})


@pytest.mark.asyncio
async def test_inspiration_unauthenticated_returns_401_or_403(async_client: AsyncClient) -> None:
    r = await async_client.get(f"{MUSEUM_BASE}/inspiration")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_inspiration_success_200_counts_and_items(
    async_client: AsyncClient, viewer_token: str
) -> None:
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.return_value = success_service_payload()
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service

    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    data = r.json()
    assert data["available"] is True
    assert data["departments_count"] == 12
    assert len(data["items"]) == 1


@pytest.mark.asyncio
async def test_inspiration_success_item_keys(
    async_client: AsyncClient, viewer_token: str
) -> None:
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.return_value = success_service_payload()
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service

    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert "object_id" in item
    assert "title" in item
    assert "primary_image_small" in item


@pytest.mark.asyncio
async def test_inspiration_explicit_seed_echoed(
    async_client: AsyncClient, viewer_token: str
) -> None:
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.return_value = success_service_payload()
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service

    seed = "0" * 16
    r = await async_client.get(
        f"{MUSEUM_BASE}/inspiration",
        params={"seed": seed},
        headers=auth_headers(viewer_token),
    )
    assert r.status_code == 200
    assert r.json()["seed"] == seed


@pytest.mark.asyncio
async def test_inspiration_success_pagination_first_page(
    async_client: AsyncClient, viewer_token: str
) -> None:
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.return_value = success_service_payload()
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service

    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    pag = r.json()["pagination"]
    assert pag is not None
    assert pag["currentPage"] == 1


@pytest.mark.asyncio
async def test_inspiration_empty_items(async_client: AsyncClient, viewer_token: str) -> None:
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.return_value = empty_service_payload()
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service

    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    data = r.json()
    assert data["available"] is True
    assert data["items"] == []


@pytest.mark.asyncio
async def test_inspiration_service_error_degrades_gracefully(
    async_client: AsyncClient, viewer_token: str
) -> None:
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.side_effect = Exception("Met API down")
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service

    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
    data = r.json()
    assert data["available"] is False
    assert data["error_message"] is not None
    assert data["items"] == []


@pytest.mark.asyncio
async def test_inspiration_viewer_role_allowed(
    async_client: AsyncClient, viewer_token: str
) -> None:
    mock_service = AsyncMock()
    mock_service.build_inspiration_page.return_value = success_service_payload()
    app.dependency_overrides[get_met_museum_service] = lambda: mock_service

    r = await async_client.get(f"{MUSEUM_BASE}/inspiration", headers=auth_headers(viewer_token))
    assert r.status_code == 200
