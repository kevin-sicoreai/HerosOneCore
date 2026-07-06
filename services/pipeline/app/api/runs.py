"""Run and output endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.clients import query
from app.schemas.run import (
    OutputOut,
    OutputPreviewOut,
    RunDetailOut,
    RunOut,
    StepRunOut,
)
from app.services import pipeline_service, run_service

router = APIRouter(tags=["pipeline-runs"])


@router.post("/pipelines/{pipeline_id}/run", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
def run_pipeline(
    pipeline_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
) -> RunOut:
    pipeline = pipeline_service.get_or_404(db, pipeline_id)
    run = run_service.trigger(db, pipeline)
    background_tasks.add_task(run_service.run_pipeline, pipeline.id, run.id)
    return RunOut.model_validate(run)


@router.get("/pipelines/{pipeline_id}/runs", response_model=list[RunOut])
def list_runs(pipeline_id: str, db: Session = Depends(get_db)) -> list[RunOut]:
    pipeline_service.get_or_404(db, pipeline_id)
    return [RunOut.model_validate(r) for r in run_service.list_runs(db, pipeline_id)]


@router.get("/runs/{run_id}", response_model=RunDetailOut)
def get_run(run_id: str, db: Session = Depends(get_db)) -> RunDetailOut:
    run = run_service.get_run_or_404(db, run_id)
    return RunDetailOut(
        id=run.id,
        pipeline_id=run.pipeline_id,
        status=run.status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        error=run.error,
        created_at=run.created_at,
        step_runs=[StepRunOut.model_validate(sr) for sr in run.step_runs],
    )


@router.get("/pipelines/{pipeline_id}/outputs", response_model=list[OutputOut])
def list_outputs(pipeline_id: str, db: Session = Depends(get_db)) -> list[OutputOut]:
    pipeline_service.get_or_404(db, pipeline_id)
    return [OutputOut.model_validate(o) for o in run_service.list_outputs(db, pipeline_id)]


@router.get("/outputs/{output_id}/preview", response_model=OutputPreviewOut)
def preview_output(
    output_id: str, limit: int | None = Query(default=None, ge=1), db: Session = Depends(get_db)
) -> OutputPreviewOut:
    output = run_service.get_output_or_404(db, output_id)
    n = limit or settings.preview_default_limit
    n = max(1, min(n, settings.preview_max_limit))
    result = query.preview_parquet(output.storage_uri, n)
    return OutputPreviewOut(
        output_id=output_id,
        columns=result["columns"],
        rows=result["rows"],
        row_count=len(result["rows"]),
    )
