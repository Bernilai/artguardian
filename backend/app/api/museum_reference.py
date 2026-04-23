"""
Reference content from The Metropolitan Museum of Art public API.
Authenticated users only; failures degrade to empty payload
(never 5xx solely due to Met downtime).
"""

import logging
import secrets
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Response

from app.config import settings
from app.dependencies import get_current_active_user, get_met_museum_service
from app.models import User
from app.schemas import MuseumInspirationResponse, MuseumReferenceObject, PaginationInfo
from app.services.met_museum_service import MetMuseumService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/inspiration", response_model=MuseumInspirationResponse)
async def museum_inspiration(
    response: Response,
    met: Annotated[MetMuseumService, Depends(get_met_museum_service)],
    _user: User = Depends(get_current_active_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(6, ge=1, le=64, alias="pageSize"),
    seed: Optional[str] = Query(
        None,
        min_length=8,
        max_length=128,
        description=(
            "Shuffle deck id from a prior response; omit for a new random deck."
        ),
    ),
):
    effective_size = max(
        1, min(page_size, settings.MET_MUSEUM_INSPIRATION_PAGE_SIZE_MAX)
    )
    deck_seed = seed or secrets.token_hex(8)

    try:
        raw = await met.build_inspiration_page(
            seed=deck_seed,
            page=page,
            page_size=effective_size,
        )
    except Exception as e:
        logger.exception("Museum inspiration unexpected error: %s", e)
        response.headers["Cache-Control"] = "private, no-store"
        return MuseumInspirationResponse(
            available=False,
            departments_count=None,
            items=[],
            error_message="Справочная галерея временно недоступна.",
            seed=deck_seed,
            pagination=None,
        )

    items = [MuseumReferenceObject(**item) for item in raw.get("items") or []]
    pag = raw.get("pagination")
    pagination = PaginationInfo(**pag) if isinstance(pag, dict) else None

    response.headers["Cache-Control"] = "private, no-store"

    return MuseumInspirationResponse(
        available=bool(raw.get("available")),
        departments_count=raw.get("departments_count"),
        items=items,
        error_message=raw.get("error_message"),
        seed=deck_seed,
        pagination=pagination,
    )
