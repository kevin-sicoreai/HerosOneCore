"""Pipeline CRUD endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.pipeline import PipelineCreate, PipelineOut, PipelineUpdate
from app.services import pipeline_service

router = APIRouter(tags=["pipelines"])


@router.post("/pipelines", response_model=PipelineOut, status_code=status.HTTP_201_CREATED)
def create_pipeline(payload: PipelineCreate, db: Session = Depends(get_db)) -> PipelineOut:
    return PipelineOut.model_validate(pipeline_service.create(db, payload))


@router.get("/pipelines", response_model=list[PipelineOut])
def list_pipelines(db: Session = Depends(get_db)) -> list[PipelineOut]:
    return [PipelineOut.model_validate(p) for p in pipeline_service.list_all(db)]


@router.get("/pipelines/{pipeline_id}", response_model=PipelineOut)
def get_pipeline(pipeline_id: str, db: Session = Depends(get_db)) -> PipelineOut:
    return PipelineOut.model_validate(pipeline_service.get_or_404(db, pipeline_id))


@router.patch("/pipelines/{pipeline_id}", response_model=PipelineOut)
def update_pipeline(pipeline_id: str, payload: PipelineUpdate, db: Session = Depends(get_db)) -> PipelineOut:
    return PipelineOut.model_validate(pipeline_service.update(db, pipeline_id, payload))


@router.delete("/pipelines/{pipeline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pipeline(pipeline_id: str, db: Session = Depends(get_db)) -> None:
    pipeline_service.delete(db, pipeline_id)
