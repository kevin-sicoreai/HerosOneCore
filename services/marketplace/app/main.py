"""AskDelphi marketplace service — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import apps
from app.core.db import SessionLocal, init_db
from app.core.logging import configure_logging, get_logger
from app.services.market_service import seed_if_empty

configure_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        seed_if_empty(db)
    logger.info("marketplace service ready")
    yield


app = FastAPI(title="AskDelphi Marketplace Service", version="0.1.0", lifespan=lifespan)

# Dev CORS: the frontend talks to the gateway in production; until the gateway
# exists it calls this service directly from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(apps.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
