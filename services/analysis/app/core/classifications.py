"""Resolve an analysis table's sensitive columns from the governance service.

Self-contained per service (no shared library). Masking here is intentionally
fail-open: if governance (or data, or ontology) is unavailable we return *no*
sensitive columns rather than raising, so /analyze keeps working. The trade-off
is availability over strict confidentiality on this preview path — a governance
outage briefly unmasks data — matching the ontology service's own read-masking
stance. The audit trail is unaffected (best-effort, separate path).

Resolution chain (all cached ~30s, all fail-open):
  table api_name -> object type id (ontology)
                 -> dataset_id      (object type detail)
                 -> dataset name    (data service)
                 -> sensitive cols  (governance classifications, matched by
                                     dataset id or name — the classification's
                                     `dataset_name` field is compared loosely)
"""

import os
import time

import httpx

from app.clients import ontology_service
from app.core.auth import service_headers
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories import object_rows

logger = get_logger("classifications")

# 127.0.0.1 (not "localhost") avoids a slow IPv6 resolution attempt on Windows.
_GOVERNANCE_URL = os.environ.get("GOVERNANCE_API_URL", "http://127.0.0.1:8004")
_CACHE_TTL_SECONDS = 30.0

_cls_cache: dict = {"at": 0.0, "rows": []}
# dataset_id -> (expires_monotonic, name)
_dataset_name_cache: dict[str, tuple[float, str | None]] = {}


def _all_classifications() -> list[dict]:
    """All classifications from governance, cached for `_CACHE_TTL_SECONDS`."""
    now = time.monotonic()
    if _cls_cache["rows"] and now - _cls_cache["at"] < _CACHE_TTL_SECONDS:
        return _cls_cache["rows"]
    try:
        # Governance gates all reads behind a validly-signed shared-secret token,
        # so send this service's internal token (an anonymous GET 401s and would
        # silently disable masking — the failure mode this warning guards).
        resp = httpx.get(
            f"{_GOVERNANCE_URL}/classifications", headers=service_headers(), timeout=5.0
        )
        resp.raise_for_status()
        rows = resp.json()
    except Exception as exc:  # noqa: BLE001 - fail open: no governance -> no masking
        logger.warning(
            "classifications fetch failed (%s) — masking disabled until governance recovers",
            exc,
        )
        rows = []
    _cls_cache["at"] = now
    _cls_cache["rows"] = rows
    return rows


def _dataset_name(dataset_id: str) -> str | None:
    """Human dataset name for an id (data service), cached ~30s; None on failure."""
    now = time.monotonic()
    hit = _dataset_name_cache.get(dataset_id)
    if hit is not None and now < hit[0]:
        return hit[1]
    name: str | None = None
    try:
        resp = httpx.get(
            f"{settings.data_service_url.rstrip('/')}/datasets/{dataset_id}", timeout=5.0
        )
        resp.raise_for_status()
        name = resp.json().get("name")
    except Exception as exc:  # noqa: BLE001 - fail open
        logger.warning("dataset name lookup failed for %s (%s)", dataset_id, exc)
        name = None
    _dataset_name_cache[dataset_id] = (now + _CACHE_TTL_SECONDS, name)
    return name


def sensitive_columns_for_table(table_api_name: str) -> set[str]:
    """Sensitive column names for an analysis table (its ontology api_name).

    Returns an empty set (no masking) whenever any lookup fails — fail-open.
    """
    try:
        types = ontology_service.list_object_types()
    except Exception:  # noqa: BLE001 - fail open
        return set()
    type_id = next(
        (
            t["id"]
            for t in types
            if table_api_name in (t.get("api_name"), t.get("display_name"), t.get("id"))
        ),
        None,
    )
    if not type_id:
        return set()
    try:
        detail = object_rows.get_object_type(type_id)
    except Exception:  # noqa: BLE001 - fail open (object_rows raises HTTPException on outage)
        return set()
    dataset_id = detail.get("dataset_id")
    if not dataset_id:
        return set()
    # Match classifications against both the dataset id and its human name, since
    # governance stores classifications keyed by `dataset_name` (loosely — either
    # form may appear there).
    keys = {dataset_id}
    name = _dataset_name(dataset_id)
    if name:
        keys.add(name)
    return {
        row.get("column_name")
        for row in _all_classifications()
        if row.get("dataset_name") in keys
    }
