"""HerosOneCore data service — FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import connector_types, connectors, datasets, syncs
from app.core.audit import emit_audit
from app.core.auth import authorize
from app.core.config import settings
from app.core.db import init_db
from app.core.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.storage_backend == "local":
        os.makedirs(os.path.abspath(settings.data_plane_dir), exist_ok=True)
    init_db()
    logger.info(
        "data service ready (db=%s, storage=%s)",
        settings.database_url, settings.storage_backend,
    )
    yield


app = FastAPI(
    title="HerosOneCore Data Service",
    version="0.1.0",
    lifespan=lifespan,
    dependencies=[Depends(authorize)],
)

# Dev CORS: the frontend talks to the gateway in production; until the gateway
# exists it calls this service directly from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def _audit(request: Request, call_next):
    response = await call_next(request)
    try:
        await emit_audit(request, response)
    except Exception:  # noqa: BLE001 - audit is best-effort
        pass
    return response


app.include_router(connector_types.router)
app.include_router(connectors.router)
app.include_router(datasets.router)
app.include_router(syncs.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
