"""Ontology graph endpoint (nodes + links) for the frontend."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.graph import OntologyGraph
from app.services import graph_service

router = APIRouter(tags=["ontology-graph"])


@router.get("/graph", response_model=OntologyGraph)
def get_graph(db: Session = Depends(get_db)) -> OntologyGraph:
    return graph_service.build_graph(db)
