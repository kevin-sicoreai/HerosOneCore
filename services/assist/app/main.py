"""AskDelphi assist service — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, sessions
from app.core.config import settings
from app.core.db import init_db
from app.core.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("assist service ready (model=%s)", settings.llm_model)
    yield


app = FastAPI(title="AskDelphi Assist Service", version="0.1.0", lifespan=lifespan)

# Dev CORS: the frontend talks to the gateway in production; until the gateway
# exists it calls this service directly from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(chat.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
