"""Governance response models."""

from pydantic import BaseModel, ConfigDict


class LineageNode(BaseModel):
    id: str
    type: str  # connector | dataset | pipeline | mart | object_type
    label: str


class LineageEdge(BaseModel):
    from_id: str
    to_id: str


class Lineage(BaseModel):
    nodes: list[LineageNode]
    edges: list[LineageEdge]


class AuditEntry(BaseModel):
    time: str | None
    actor: str
    action: str
    target: str
    source: str  # which subsystem the event came from


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    members: int
    can_read: bool
    can_write: bool
    can_admin: bool


class Stats(BaseModel):
    governed_assets: int
    roles: int
    audit_events: int
    encryption_coverage: str
