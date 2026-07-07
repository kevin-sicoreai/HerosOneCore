"""AskDelphi ontology service — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import graph, link_types, object_types, objects
from app.core.config import settings
from app.core.db import init_db
from app.core.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("ontology service ready (db=%s)", settings.database_url)
    yield


app = FastAPI(title="AskDelphi Ontology Service", version="0.1.0", lifespan=lifespan)

# Dev CORS: frontend talks to the gateway in production; direct for now.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

app.include_router(object_types.router)
app.include_router(link_types.router)
app.include_router(objects.router)
app.include_router(graph.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
