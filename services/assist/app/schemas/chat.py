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


class MetaOut(BaseModel):
    model: str
    display_name: str
