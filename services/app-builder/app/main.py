"""AskDelphi app-builder service — FastAPI application entry point.

Stores versioned Puck application definitions and serves them to the native
editor (Puck) and runtime (Render). Reads are open; writes require a write
token; deletes require admin (see app.core.auth).
"""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import apps
from app.core.auth import authorize
from app.core.config import settings
from app.core.db import init_db
from app.core.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("app-builder service ready (db=%s)", settings.database_url)
    yield


app = FastAPI(
    title="AskDelphi App Builder Service",
    version="0.1.0",
    lifespan=lifespan,
    dependencies=[Depends(authorize)],
)

# Dev CORS: frontend talks to the gateway in production; direct for now.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(apps.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
