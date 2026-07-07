"""Ontology graph + object instance response models."""

from typing import Any

from pydantic import BaseModel


class GraphNode(BaseModel):
    id: str
    api_name: str
    display_name: str
    color: str
    x: float
    y: float
    property_count: int
    instance_count: int | None  # None if the backing data is unavailable


class GraphLink(BaseModel):
    id: str
    display_name: str
    from_object_type_id: str
    to_object_type_id: str
    cardinality: str


class OntologyGraph(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphLink]


class ObjectListOut(BaseModel):
    object_type_id: str
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
