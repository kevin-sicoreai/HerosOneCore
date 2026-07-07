"""Graph (canvas) use cases: load, replace, and validate the DAG."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain import dag
from app.domain.enums import PipelineStatus, StepKind
from app.repositories.models import Edge, Pipeline, Step
from app.schemas.graph import GraphIn


def _steps(db: Session, pipeline_id: str) -> list[Step]:
    return list(db.scalars(select(Step).where(Step.pipeline_id == pipeline_id)))


def _edges(db: Session, pipeline_id: str) -> list[Edge]:
    return list(db.scalars(select(Edge).where(Edge.pipeline_id == pipeline_id)))


def get_graph(db: Session, pipeline: Pipeline) -> tuple[list[Step], list[Edge]]:
    return _steps(db, pipeline.id), _edges(db, pipeline.id)


def replace_graph(db: Session, pipeline: Pipeline, payload: GraphIn) -> None:
    """Replace the whole canvas (steps + edges) for a pipeline."""
    valid_kinds = {k.value for k in StepKind}
    for s in payload.steps:
        if s.kind not in valid_kinds:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown step kind: {s.kind}")

    for existing in _steps(db, pipeline.id):
        db.delete(existing)
    for existing in _edges(db, pipeline.id):
        db.delete(existing)
    db.flush()

    for s in payload.steps:
        db.add(Step(id=s.id, pipeline_id=pipeline.id, kind=s.kind,
                    config=s.config, label=s.label, x=s.x, y=s.y))
    for e in payload.edges:
        db.add(Edge(pipeline_id=pipeline.id, from_step=e.from_step, to_step=e.to_step))
    pipeline.status = PipelineStatus.DRAFT
    db.commit()


def validate(db: Session, pipeline: Pipeline) -> tuple[bool, str]:
    steps, edges = get_graph(db, pipeline)
    step_ids = {s.id for s in steps}
    if not step_ids:
        return False, "Pipeline has no steps"

    edge_tuples = [(e.from_step, e.to_step) for e in edges]
    try:
        dag.validate(step_ids, edge_tuples)
    except dag.DagError as exc:
        return False, str(exc)

    # Every transform/output needs an input; join needs two; source datasets set.
    for s in steps:
        ins = dag.inputs_of(s.id, edge_tuples)
        if s.kind == StepKind.SOURCE and not s.config.get("dataset_id"):
            return False, f"Source step '{s.id}' is missing dataset_id"
        if s.kind in (StepKind.TRANSFORM, StepKind.OUTPUT) and len(ins) != 1:
            return False, f"Step '{s.id}' ({s.kind}) must have exactly 1 input"
        if s.kind == StepKind.JOIN and len(ins) != 2:
            return False, f"Join step '{s.id}' must have exactly 2 inputs"

    pipeline.status = PipelineStatus.READY
    db.commit()
    return True, "Pipeline graph is valid"
