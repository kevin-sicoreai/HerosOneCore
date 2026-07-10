"""HTTP client for a Cube deployment (the /cubejs-api/v1/load endpoint).

Cube computes a load query asynchronously: the first call may return HTTP 200
with ``{"error": "Continue wait"}`` while the query warms up. We poll (1s apart,
up to ~30s) until data is ready. In dev mode Cube accepts any Authorization
string; we send a placeholder so the header is always present.
"""

import time

import httpx

from app.core.config import settings

_TIMEOUT = 30.0
_MAX_WAITS = 30
_WAIT_SECONDS = 1.0
_DEV_AUTH = "cube-dev-token"


def load(query: dict) -> dict:
    """Run a Cube load query and return the parsed response ({"data": [...], ...}).

    Raises httpx.HTTPError on transport/HTTP failure and RuntimeError if Cube
    keeps returning "Continue wait" past the retry budget — callers treat any
    exception as a signal to fall back to the native engine.
    """
    url = f"{settings.cube_api_url.rstrip('/')}/cubejs-api/v1/load"
    headers = {"Authorization": _DEV_AUTH}
    body = {"query": query}
    for _ in range(_MAX_WAITS):
        resp = httpx.post(url, json=body, headers=headers, timeout=_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("error") == "Continue wait":
            time.sleep(_WAIT_SECONDS)
            continue
        if "error" in payload:
            raise RuntimeError(f"Cube error: {payload['error']}")
        return payload
    raise RuntimeError("Cube query timed out (Continue wait)")
