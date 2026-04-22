from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse, Response

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["seo"])

_SITEMAP_PATHS: List[tuple[str, str, str]] = [
    ("/", "daily", "1.0"),
    ("/login", "monthly", "0.8"),
    ("/register", "monthly", "0.7"),
    ("/dashboard", "weekly", "0.6"),
    ("/collection", "weekly", "0.7"),
    ("/tickets", "weekly", "0.6"),
    ("/analytics", "weekly", "0.5"),
]


def _origin() -> str:
    return settings.PUBLIC_SITE_URL.rstrip("/")


@router.get("/sitemap.xml", response_class=Response)
async def sitemap_xml():
    base = _origin()
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path, changefreq, priority in _SITEMAP_PATHS:
        loc = f"{base}{path}"
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <changefreq>{changefreq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    body = "\n".join(lines) + "\n"
    return Response(
        content=body,
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/robots.txt", response_class=PlainTextResponse)
async def robots_txt():
    base = _origin()
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "\n"
        f"Sitemap: {base}/sitemap.xml\n"
    )
    return PlainTextResponse(
        content=body,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/.well-known/json-ld/site", response_class=Response)
async def json_ld_site():
    """
    Static WebSite / SoftwareApplication schema for crawlers or proxies
    that request structured data from the API host.
    """
    import json

    payload = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                "name": settings.APP_NAME,
                "url": _origin() + "/",
                "description": "Платформа учёта и сохранности музейных артефактов, тикетов реставрации и аналитики.",
                "inLanguage": "ru",
            },
            {
                "@type": "SoftwareApplication",
                "name": settings.APP_NAME,
                "applicationCategory": "BusinessApplication",
                "operatingSystem": "Web",
                "url": _origin() + "/",
            },
        ],
    }
    return Response(
        content=json.dumps(payload, ensure_ascii=False),
        media_type="application/ld+json",
        headers={"Cache-Control": "public, max-age=86400"},
    )
