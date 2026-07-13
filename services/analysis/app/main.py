"""AskDelphi analysis service — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analyses, analysis, metrics
from app.core.config import settings
from app.core.db import init_db
from app.core.logging import configure_logging, get_logger
from app.services import metric_defs

configure_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the saved-analyses + metric-definition schema. Reads/aggregation do
    # not depend on this, so a DB failure would only affect the DB-backed routes.
    init_db()
    # Idempotently seed the metric catalog from the legacy hardcoded registry so
    # a fresh DB comes up with the same metrics (best-effort; never blocks boot).
    try:
        metric_defs.seed_from_registry()
    except Exception as exc:  # noqa: BLE001 - seeding must never fail startup
        logger.warning("metric seed failed: %s", exc)
    logger.info("analysis service ready (db=%s)", settings.database_url)
    yield


app = FastAPI(title="AskDelphi Analysis Service", version="0.1.0", lifespan=lifespan)

# Dev CORS: the frontend talks to the gateway in production; until the gateway
# exists it calls this service directly from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis.router)
app.include_router(metrics.router)
app.include_router(analyses.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
