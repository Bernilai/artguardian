"""Integration tests for app.api.seo (sitemap, robots, JSON-LD)."""

from __future__ import annotations

import json
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides.clear()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_sitemap_xml_200_xml_content_type_and_xml_declaration(async_client: AsyncClient) -> None:
    r = await async_client.get("/sitemap.xml")
    assert r.status_code == 200
    assert "xml" in (r.headers.get("content-type") or "").lower()
    text = r.text
    assert text.lstrip().startswith("<?xml")


@pytest.mark.asyncio
async def test_sitemap_xml_contains_urlset(async_client: AsyncClient) -> None:
    r = await async_client.get("/sitemap.xml")
    assert r.status_code == 200
    assert "<urlset" in r.text


@pytest.mark.asyncio
async def test_sitemap_xml_has_loc_per_path(async_client: AsyncClient) -> None:
    r = await async_client.get("/sitemap.xml")
    assert r.status_code == 200
    assert r.text.count("<loc>") >= 7


@pytest.mark.asyncio
async def test_robots_txt_200_plain_and_user_agent(async_client: AsyncClient) -> None:
    r = await async_client.get("/robots.txt")
    assert r.status_code == 200
    assert "text/plain" in (r.headers.get("content-type") or "").lower()
    assert "User-agent: *" in r.text


@pytest.mark.asyncio
async def test_robots_txt_disallows_api(async_client: AsyncClient) -> None:
    r = await async_client.get("/robots.txt")
    assert r.status_code == 200
    assert "Disallow: /api/" in r.text


@pytest.mark.asyncio
async def test_robots_txt_contains_sitemap_line(async_client: AsyncClient) -> None:
    r = await async_client.get("/robots.txt")
    assert r.status_code == 200
    assert "Sitemap:" in r.text


@pytest.mark.asyncio
async def test_json_ld_site_200_valid_schema_graph(async_client: AsyncClient) -> None:
    r = await async_client.get("/.well-known/json-ld/site")
    assert r.status_code == 200
    data = json.loads(r.text)
    assert data.get("@context") == "https://schema.org"
    graph = data.get("@graph")
    assert isinstance(graph, list)
    assert len(graph) == 2
