"""Pydantic request/response models."""

from typing import Any

from pydantic import BaseModel


class SessionOut(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    trace: list[dict[str, Any]] | None = None
    extras: dict[str, Any] | None = None
    created_at: str


class ChatRequest(BaseModel):
    content: str
    # Optional: which selectable model to drive this turn; None → default.
    model: str | None = None


class ModelInfo(BaseModel):
    id: str
    display_name: str


class MetaOut(BaseModel):
    # `model`/`display_name` describe the default model (kept for backward
    # compatibility); `models`/`default` expose the full selectable set.
    model: str
    display_name: str
    default: str
    models: list[ModelInfo]
