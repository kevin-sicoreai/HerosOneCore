"""Process-wide TTL cache for object-type instance rows (and type detail).

Both the analyze path (`provider.get_table`) and the metric layer pull the full
instance set for an object type on every request — re-fetching ~20k rows per
page/sort/filter is the dominant cost. The backing data changes slowly, so we
cache row sets, and the lightweight type detail used to build columns, for a
short TTL. Trade-off: data-plane changes surface with up to `_TTL_SECONDS` of
lag, which is acceptable for the analysis workbench.
"""

import time

import httpx
from fastapi import HTTPException, status

from app.clients import ontology_service

# Upper bound on rows pulled per object type. The ontology objects endpoint caps
# previews via the PREVIEW_MAX_LIMIT env var (relaxed to accommodate large sets,
# e.g. ~20k employees); request up to that ceiling so callers see the full set.
_PREVIEW_ROWS = 50000

_TTL_SECONDS = 30.0
# Cap the number of cached object types to bound memory; when the cache is full
# the entry expiring soonest (roughly the oldest) is evicted.
_MAX_ENTRIES = 32

# object_type_id -> (expires_monotonic, rows)
_rows_cache: dict[str, tuple[float, list[dict]]] = {}
# object_type_id -> (expires_monotonic, detail)
_detail_cache: dict[str, tuple[float, dict]] = {}


def _evict_if_full(cache: dict) -> None:
    if len(cache) < _MAX_ENTRIES:
        return
    oldest = min(cache, key=lambda k: cache[k][0])
    del cache[oldest]


def get_rows(object_type_id: str) -> list[dict]:
    """Full (preview-capped) instance rows for an object type, cached for a
    short TTL. First miss is ~1s for a large type; cache hits are ~free."""
    now = time.monotonic()
    hit = _rows_cache.get(object_type_id)
    if hit is not None and now < hit[0]:
        return hit[1]
    try:
        rows = ontology_service.list_objects(object_type_id, _PREVIEW_ROWS)["rows"]
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "本体服务不可用") from exc
    _evict_if_full(_rows_cache)
    _rows_cache[object_type_id] = (now + _TTL_SECONDS, rows)
    return rows


def get_object_type(object_type_id: str) -> dict:
    """Object type detail (properties), cached for a short TTL. Used to build
    table columns without re-hitting the ontology on every request."""
    now = time.monotonic()
    hit = _detail_cache.get(object_type_id)
    if hit is not None and now < hit[0]:
        return hit[1]
    try:
        detail = ontology_service.get_object_type(object_type_id)
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "本体服务不可用") from exc
    _evict_if_full(_detail_cache)
    _detail_cache[object_type_id] = (now + _TTL_SECONDS, detail)
    return detail
