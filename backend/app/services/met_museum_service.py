from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import random
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

# (seed -> { items, dept_count, ts }); LRU + TTL. Survives across requests (same process).
_deck_cache_lock = threading.Lock()
_deck_cache: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()


def _deck_cache_get(seed: str, ttl_sec: float) -> Optional[Tuple[List[Dict[str, Any]], Optional[int]]]:
    now = time.monotonic()
    with _deck_cache_lock:
        entry = _deck_cache.get(seed)
        if not entry:
            return None
        if now - float(entry["ts"]) > ttl_sec:
            del _deck_cache[seed]
            return None
        items = entry.get("items")
        if not isinstance(items, list) or not items:
            del _deck_cache[seed]
            return None
        _deck_cache.move_to_end(seed)
        return list(items), entry.get("dept_count")


def _deck_cache_put(
    seed: str,
    items: List[Dict[str, Any]],
    dept_count: Optional[int],
    ttl_sec: float,
    max_entries: int,
) -> None:
    with _deck_cache_lock:
        _deck_cache[seed] = {
            "items": list(items),
            "dept_count": dept_count,
            "ts": time.monotonic(),
        }
        _deck_cache.move_to_end(seed)
        while len(_deck_cache) > max_entries:
            _deck_cache.popitem(last=False)


def _rng_from_seed(seed: str) -> random.Random:
    h = hashlib.sha256(seed.encode("utf-8")).digest()
    return random.Random(int.from_bytes(h[:8], "big"))


class MetMuseumService:
    def __init__(
        self,
        base_url: str,
        timeout: float = 20.0,
        max_retries: int = 2,
        pool_cap: int = 400,
        deck_cache_ttl_sec: float = 3600.0,
        deck_cache_max: int = 100,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.pool_cap = max(50, min(pool_cap, 2000))
        self.deck_cache_ttl_sec = max(60.0, deck_cache_ttl_sec)
        self.deck_cache_max = max(1, min(deck_cache_max, 10_000))

        self._candidate_factor: int = 5
        self._candidate_cap_max: int = 3000
        self._resolve_concurrency: int = 12
        self._max_object_fetches_per_deck: int = min(480, max(240, self.pool_cap * 2))

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=True,
            trust_env=True,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=40),
            headers={"Accept": "application/json", "User-Agent": "ArtGuardian/1.0 (museum reference)"},
        )

    async def _get_json(self, path_with_query: str) -> Optional[dict]:
        """Standalone request with retries (cold paths)."""
        url = f"{self.base_url}{path_with_query}"
        delay = 0.35
        last_err: Optional[BaseException] = None
        for attempt in range(self.max_retries + 1):
            try:
                async with self._client() as client:
                    response = await client.get(url)
                    if response.status_code == 429:
                        logger.warning("Met Museum API rate limited: %s", url)
                        await asyncio.sleep(delay * (attempt + 2))
                        continue
                    response.raise_for_status()
                    data = response.json()
                    if not isinstance(data, dict):
                        logger.warning("Met Museum API non-object JSON from %s", url)
                        return None
                    return data
            except httpx.TimeoutException as e:
                last_err = e
                logger.warning(
                    "Met Museum API timeout (attempt %s/%s): %s",
                    attempt + 1,
                    self.max_retries + 1,
                    url,
                )
            except httpx.HTTPStatusError as e:
                last_err = e
                logger.warning(
                    "Met Museum API HTTP %s for %s",
                    e.response.status_code if e.response else "?",
                    url,
                )
                if e.response is not None and 500 <= e.response.status_code < 600:
                    await asyncio.sleep(delay * (attempt + 1))
                    continue
                return None
            except Exception as e:
                last_err = e
                logger.warning("Met Museum API request failed: %s — %s", url, e)
            await asyncio.sleep(delay * (attempt + 1))
        if last_err:
            logger.error("Met Museum API gave up on %s: %s", url, last_err)
        return None

    async def _get_json_client(self, client: httpx.AsyncClient, path_with_query: str) -> Optional[dict]:
        """Single GET on a shared client (connection reuse for dashboards)."""
        url = f"{self.base_url}{path_with_query}"
        for _attempt in range(2):
            try:
                response = await client.get(url)
                if response.status_code == 429:
                    await asyncio.sleep(0.5)
                    continue
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, dict) else None
            except Exception as e:
                logger.debug("Met Museum client GET %s: %s", url, e)
                await asyncio.sleep(0.2)
        return None

    async def _get_object(self, client: httpx.AsyncClient, object_id: int) -> Optional[dict]:
        """GET /objects/{id} with small retry loop (429 / 5xx / timeout)."""
        url = f"{self.base_url}/objects/{object_id}"
        delay = 0.45
        for attempt in range(4):
            try:
                response = await client.get(url)
                if response.status_code == 429:
                    await asyncio.sleep(delay * (attempt + 1) * 2)
                    continue
                if response.status_code >= 500:
                    await asyncio.sleep(delay * (attempt + 1))
                    continue
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, dict) else None
            except httpx.TimeoutException:
                await asyncio.sleep(delay * (attempt + 1))
            except httpx.HTTPStatusError as e:
                logger.debug("Met Museum object %s HTTP %s", object_id, e.response.status_code if e.response else "?")
                if e.response is not None and e.response.status_code >= 500:
                    await asyncio.sleep(delay * (attempt + 1))
                    continue
                return None
            except Exception as e:
                logger.debug("Met Museum object %s failed: %s", object_id, e)
                await asyncio.sleep(delay * (attempt + 1))
        return None

    def _candidate_merge_cap(self) -> int:
        return min(max(self.pool_cap * self._candidate_factor, self.pool_cap + 120), self._candidate_cap_max)

    async def _gather_object_ids(
        self,
        client: httpx.AsyncClient,
        departments_payload: Optional[dict],
        merge_cap: int,
    ) -> Tuple[List[int], bool, bool]:
        """
        Merge unique object IDs until merge_cap. Streams Met `objectIDs` — never scans 50k in Python.
        """
        any_success = False
        saw_empty = False
        merged: List[int] = []
        seen: set[int] = set()

        def absorb_payload(payload: Optional[dict]) -> None:
            nonlocal saw_empty
            raw_ids = payload.get("objectIDs") if payload else None
            if payload is not None and (not isinstance(raw_ids, list) or len(raw_ids) == 0):
                saw_empty = True
            if not isinstance(raw_ids, list):
                return
            for oid in raw_ids:
                if len(merged) >= merge_cap:
                    return
                if isinstance(oid, int):
                    iid = oid
                elif isinstance(oid, str) and oid.isdigit():
                    iid = int(oid)
                else:
                    continue
                if iid in seen:
                    continue
                seen.add(iid)
                merged.append(iid)

        search_strategies: List[Dict[str, str]] = [
            {"hasImages": "true", "q": "painting"},
            {"hasImages": "true", "q": "sunflowers"},
            {"hasImages": "true", "q": "portrait"},
            {"hasImages": "true", "q": "vase"},
            {"hasImages": "true", "isHighlight": "true", "q": "man"},
            {"hasImages": "true", "q": "a"},
        ]

        for params in search_strategies:
            if len(merged) >= merge_cap:
                break
            qs = urlencode(params)
            payload = await self._get_json_client(client, f"/search?{qs}")
            if payload is not None:
                any_success = True
            absorb_payload(payload)

        if len(merged) < merge_cap and departments_payload and isinstance(
            departments_payload.get("departments"), list
        ):
            for dept in departments_payload["departments"][:10]:
                if len(merged) >= merge_cap:
                    break
                if not isinstance(dept, dict):
                    continue
                dept_id = dept.get("departmentId")
                if dept_id is None:
                    continue
                params = {
                    "departmentId": str(dept_id),
                    "hasImages": "true",
                    "q": "a",
                }
                qs = urlencode(params)
                payload = await self._get_json_client(client, f"/search?{qs}")
                if payload is not None:
                    any_success = True
                absorb_payload(payload)

        return merged[:merge_cap], any_success, saw_empty

    def _raw_has_display_image(self, raw: dict) -> bool:
        if raw.get("objectID") is None:
            return False
        img = raw.get("primaryImageSmall") or raw.get("primaryImage")
        return bool(img)

    async def _materialize_illustrated_deck(
        self,
        client: httpx.AsyncClient,
        candidates: List[int],
        target: int,
        max_fetches: int,
    ) -> List[Dict[str, Any]]:
        """Preserve candidate order; build card dicts for Met objects that have a display image."""
        deck: List[Dict[str, Any]] = []
        if target <= 0 or not candidates or max_fetches <= 0:
            return deck

        sem = asyncio.Semaphore(self._resolve_concurrency)
        fetches = 0

        async def fetch_one(oid: int) -> Tuple[int, Optional[dict]]:
            async with sem:
                raw = await self._get_object(client, oid)
                return oid, raw

        idx = 0
        while len(deck) < target and idx < len(candidates) and fetches < max_fetches:
            chunk_len = min(self._resolve_concurrency, max_fetches - fetches, len(candidates) - idx)
            if chunk_len <= 0:
                break
            chunk = candidates[idx : idx + chunk_len]
            idx += chunk_len
            fetches += chunk_len
            pairs = await asyncio.gather(*[fetch_one(oid) for oid in chunk])
            for oid, raw in pairs:
                if raw and self._raw_has_display_image(raw):
                    row = self._raw_to_item(raw)
                    if row:
                        deck.append(row)
                        if len(deck) >= target:
                            break

        return deck

    def _raw_to_item(self, raw: dict) -> Optional[Dict[str, Any]]:
        oid = raw.get("objectID")
        if oid is None:
            return None
        img = raw.get("primaryImageSmall") or raw.get("primaryImage")
        if not img:
            return None
        return {
            "object_id": int(oid),
            "title": (raw.get("title") or "Untitled")[:500],
            "artist_display": (raw.get("artistDisplayName") or "")[:300] or None,
            "object_date": (raw.get("objectDate") or "")[:120] or None,
            "primary_image_small": img,
            "object_url": raw.get("objectURL"),
        }

    async def build_inspiration_page(
        self,
        *,
        seed: str,
        page: int,
        page_size: int,
    ) -> Dict[str, Any]:
        """
        One deck per `seed` (cached): full card rows built once. Page `p` is a slice — no second Met round-trip.
        """
        cached = _deck_cache_get(seed, self.deck_cache_ttl_sec)
        deck_items: Optional[List[Dict[str, Any]]] = None
        dept_count: Optional[int] = None

        async with self._client() as client:
            if cached:
                deck_items, dept_count = cached
            else:
                departments_payload = await self._get_json_client(client, "/departments")
                dept_count = None
                if departments_payload and "departments" in departments_payload:
                    dept_list = departments_payload.get("departments") or []
                    dept_count = len(dept_list) if isinstance(dept_list, list) else None

                merge_cap = self._candidate_merge_cap()
                object_ids, search_any_ok, saw_empty = await self._gather_object_ids(
                    client,
                    departments_payload,
                    merge_cap,
                )
                any_ok = (departments_payload is not None) or search_any_ok

                if not object_ids:
                    if not any_ok:
                        err = (
                            "Не удалось связаться с API Met Museum с сервера "
                            "(нет интернета, блокировка HTTPS, proxy или слишком короткий таймаут). "
                            "Проверьте доступ к https://collectionapi.metmuseum.org и переменные "
                            "HTTPS_PROXY / MET_MUSEUM_API_BASE_URL / MET_MUSEUM_TIMEOUT."
                        )
                    else:
                        err = (
                            "Поиск Met Museum не вернул объектов с изображениями. "
                            "Попробуйте позже или увеличьте MET_MUSEUM_TIMEOUT."
                        )
                    logger.warning(
                        "Met Museum inspiration: no object IDs (any_ok=%s saw_empty=%s base=%s)",
                        any_ok,
                        saw_empty,
                        self.base_url,
                    )
                    return {
                        "available": False,
                        "departments_count": dept_count,
                        "items": [],
                        "error_message": err,
                        "pagination": None,
                    }

                base = list(dict.fromkeys(object_ids))
                rng = _rng_from_seed(seed)
                rng.shuffle(base)
                max_fetch = min(self._max_object_fetches_per_deck, len(base))
                deck_items = await self._materialize_illustrated_deck(
                    client,
                    base,
                    self.pool_cap,
                    max_fetch,
                )

                if not deck_items:
                    logger.warning(
                        "Met Museum inspiration: empty deck after resolve (candidates=%s max_fetch=%s base=%s)",
                        len(base),
                        max_fetch,
                        self.base_url,
                    )
                    return {
                        "available": False,
                        "departments_count": dept_count,
                        "items": [],
                        "error_message": (
                            "Не удалось собрать подборку с иллюстрациями из Met. "
                            "Попробуйте «Другую подборку» или позже."
                        ),
                        "pagination": None,
                    }

                _deck_cache_put(
                    seed,
                    deck_items,
                    dept_count,
                    self.deck_cache_ttl_sec,
                    self.deck_cache_max,
                )

            assert deck_items is not None
            total_ids = len(deck_items)
            total_pages = max(1, math.ceil(total_ids / page_size))
            safe_page = max(1, min(page, total_pages))
            start = (safe_page - 1) * page_size
            slice_items = deck_items[start : start + page_size]

            pagination = {
                "currentPage": safe_page,
                "totalPages": total_pages,
                "totalItems": total_ids,
                "itemsPerPage": page_size,
            }

            if not slice_items:
                return {
                    "available": True,
                    "departments_count": dept_count,
                    "items": [],
                    "error_message": None,
                    "pagination": pagination,
                }

            return {
                "available": True,
                "departments_count": dept_count,
                "items": slice_items,
                "error_message": None,
                "pagination": pagination,
            }
