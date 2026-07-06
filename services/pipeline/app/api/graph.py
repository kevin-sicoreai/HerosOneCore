"""Graph (canvas) endpoints: load, replace, validate."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.graph import EdgeOut, GraphIn, GraphOut, StepOut, ValidateResult
from app.services import graph_service, pipeline_service

router = APIRouter(tags=["pipeline-graph"])


@router.get("/pipelines/{pipeline_id}/graph", response_model=GraphOut)
def get_graph(pipeline_id: str, db: Session = Depends(get_db)) -> GraphOut:
    pipeline = pipeline_service.get_or_404(db, pipeline_id)
    steps, edges = graph_service.get_graph(db, pipeline)
    return GraphOut(
        steps=[StepOut(id=s.id, kind=s.kind, config=s.config, label=s.label, x=s.x, y=s.y) for s in steps],
        edges=[EdgeOut(from_step=e.from_step, to_step=e.to_step) for e in edges],
    )


@router.put("/pipelines/{pipeline_id}/graph", response_model=GraphOut)
def put_graph(pipeline_id: str, payload: GraphIn, db: Session = Depends(get_db)) -> GraphOut:
    pipeline = pipeline_service.get_or_404(db, pipeline_id)
    graph_service.replace_graph(db, pipeline, payload)
    return get_graph(pipeline_id, db)


@router.post("/pipelines/{pipeline_id}/validate", response_model=ValidateResult)
def validate_graph(pipeline_id: str, db: Session = Depends(get_db)) -> ValidateResult:
    pipeline = pipeline_service.get_or_404(db, pipeline_id)
    ok, message = graph_service.validate(db, pipeline)
    return ValidateResult(ok=ok, message=message)
