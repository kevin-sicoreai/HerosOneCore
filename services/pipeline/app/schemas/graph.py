"""Graph (canvas) request/response models — steps + edges."""

from typing import Any

from pydantic import BaseModel, Field


class StepIn(BaseModel):
    id: str = Field(min_length=1, max_length=64)  # client/canvas node id
    kind: str  # source | transform | join | output
    config: dict[str, Any] = Field(default_factory=dict)
    label: str | None = None
    x: float = 0
    y: float = 0


class EdgeIn(BaseModel):
    from_step: str = Field(alias="from")
    to_step: str = Field(alias="to")

    model_config = {"populate_by_name": True}


class GraphIn(BaseModel):
    steps: list[StepIn]
    edges: list[EdgeIn] = Field(default_factory=list)


class StepOut(BaseModel):
    id: str
    kind: str
    config: dict[str, Any]
    label: str | None
    x: float
    y: float


class EdgeOut(BaseModel):
    from_step: str
    to_step: str


class GraphOut(BaseModel):
    steps: list[StepOut]
    edges: list[EdgeOut]


class ValidateResult(BaseModel):
    ok: bool
    message: str
