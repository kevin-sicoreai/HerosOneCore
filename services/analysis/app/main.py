"""HerosOneCore analysis service — FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import analysis, metrics
from app.core.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("main")

app = FastAPI(title="HerosOneCore Analysis Service", version="0.1.0")

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


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
