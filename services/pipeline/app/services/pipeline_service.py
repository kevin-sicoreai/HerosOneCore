"""Pipeline CRUD use cases."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.repositories.models import Pipeline
from app.schemas.pipeline import PipelineCreate, PipelineUpdate


def get_or_404(db: Session, pipeline_id: str) -> Pipeline:
    pipeline = db.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pipeline not found")
    return pipeline


def create(db: Session, payload: PipelineCreate) -> Pipeline:
    pipeline = Pipeline(
        name=payload.name,
        description=payload.description,
        schedule=payload.schedule,
        owner_id=payload.owner_id,
    )
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)
    return pipeline


def list_all(db: Session) -> list[Pipeline]:
    return list(db.scalars(select(Pipeline).order_by(Pipeline.created_at.desc())))


def update(db: Session, pipeline_id: str, payload: PipelineUpdate) -> Pipeline:
    pipeline = get_or_404(db, pipeline_id)
    if payload.name is not None:
        pipeline.name = payload.name
    if payload.description is not None:
        pipeline.description = payload.description
    if payload.schedule is not None:
        pipeline.schedule = payload.schedule
    db.commit()
    db.refresh(pipeline)
    return pipeline


def delete(db: Session, pipeline_id: str) -> None:
    pipeline = get_or_404(db, pipeline_id)
    db.delete(pipeline)
    db.commit()
