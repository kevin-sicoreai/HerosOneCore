"""Fetch sensitive-column classifications from the governance service, cached in-process.

Self-contained per service (no shared library). Read masking is intentionally
fail-open: if governance is unavailable we return no classifications rather than
raising, so object reads keep working. The trade-off is availability over strict
confidentiality on this preview path (a governance outage briefly unmasks data);
the write path and audit trail are unaffected.
"""

import os
import time

import httpx

# 127.0.0.1 (not "localhost") avoids a slow IPv6 resolution attempt on Windows.
_GOVERNANCE_URL = os.environ.get("GOVERNANCE_API_URL", "http://127.0.0.1:8004")
_CACHE_TTL_SECONDS = 30.0

_cache: dict = {"at": 0.0, "rows": []}


def _all_classifications() -> list[dict]:
    """All classifications from governance, cached for `_CACHE_TTL_SECONDS`."""
    now = time.monotonic()
    if _cache["rows"] and now - _cache["at"] < _CACHE_TTL_SECONDS:
        return _cache["rows"]
    try:
        resp = httpx.get(f"{_GOVERNANCE_URL}/classifications", timeout=5.0)
        resp.raise_for_status()
        rows = resp.json()
    except Exception:  # noqa: BLE001 - fail open: no governance -> no masking
        rows = []
    _cache["at"] = now
    _cache["rows"] = rows
    return rows


def sensitive_columns_for(dataset_names: set[str]) -> dict[str, set[str]]:
    """Map each requested dataset identifier -> its set of sensitive column names.

    `dataset_names` may hold dataset ids and/or human names; classifications are
    matched loosely against their `dataset_name` field, so either form resolves.
    """
    out: dict[str, set[str]] = {}
    for row in _all_classifications():
        ds = row.get("dataset_name")
        if ds in dataset_names:
            out.setdefault(ds, set()).add(row.get("column_name"))
    return out
