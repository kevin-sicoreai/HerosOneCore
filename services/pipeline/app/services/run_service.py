"""Run use cases: trigger a run and execute it (compile -> dbt -> catalog outputs)."""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clients import airflow_client, data_client, dbt_runner, query
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.domain import dag
from app.domain.enums import PipelineStatus, RunStatus, StepKind
from app.events import publishers
from app.repositories.models import Edge, Output, Pipeline, Run, Step, StepRun
from app.services import compiler

logger = get_logger("run")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_run_or_404(db: Session, run_id: str) -> Run:
    run = db.get(Run, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


def list_runs(db: Session, pipeline_id: str) -> list[Run]:
    return list(
        db.scalars(
            select(Run).where(Run.pipeline_id == pipeline_id).order_by(Run.created_at.desc())
        )
    )


def list_outputs(db: Session, pipeline_id: str) -> list[Output]:
    return list(
        db.scalars(
            select(Output).where(Output.pipeline_id == pipeline_id).order_by(Output.created_at.desc())
        )
    )


def get_output_or_404(db: Session, output_id: str) -> Output:
    output = db.get(Output, output_id)
    if output is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Output not found")
    return output


def trigger(db: Session, pipeline: Pipeline) -> Run:
    run = Run(pipeline_id=pipeline.id, status=RunStatus.PENDING)
    pipeline.status = PipelineStatus.RUNNING
    db.add(run)
    db.commit()
    db.refresh(run)
    publishers.run_started(pipeline.id, run.id)
    return run


def run_pipeline(pipeline_id: str, run_id: str) -> None:
    """Background job: compile the graph to dbt, run it, catalog outputs."""
    db = SessionLocal()
    try:
        pipeline = db.get(Pipeline, pipeline_id)
        run = db.get(Run, run_id)
        if pipeline is None or run is None:
            logger.error("run_pipeline: missing pipeline/run (%s/%s)", pipeline_id, run_id)
            return

        run.status = RunStatus.RUNNING
        run.started_at = _now()
        db.commit()

        steps = list(db.scalars(select(Step).where(Step.pipeline_id == pipeline_id)))
        edges = list(db.scalars(select(Edge).where(Edge.pipeline_id == pipeline_id)))
        step_ids = {s.id for s in steps}
        edge_tuples = [(e.from_step, e.to_step) for e in edges]
        dag.validate(step_ids, edge_tuples)  # raises DagError -> caught below

        # Resolve source datasets from the data service.
        source_meta: dict[str, dict] = {}
        for s in steps:
            if s.kind == StepKind.SOURCE:
                ds = data_client.get_dataset(s.config["dataset_id"])
                source_meta[s.id] = {"name": ds["name"], "storage_uri": ds["storage_uri"]}

        compiled = compiler.compile_project(pipeline, steps, edges, source_meta)
        project_dir = compiled["project_dir"]
        if settings.use_airflow:
            af = airflow_client.run_and_wait(project_dir)
            dbt_result = {
                "ok": af["ok"],
                "returncode": 0 if af["ok"] else 1,
                "output": f"airflow dag_run {af['dag_run_id']} state={af['state']}",
                "results": dbt_runner.parse_run_results(project_dir),
            }
        else:
            dbt_result = dbt_runner.run(project_dir)

        # Per-step status: sources are trivially ok; models come from dbt results.
        by_model = {r["model"]: r for r in dbt_result["results"]}
        for s in steps:
            if s.kind == StepKind.SOURCE:
                db.add(StepRun(run_id=run.id, step_id=s.id, status=RunStatus.SUCCESS, message="source"))
                continue
            r = by_model.get(compiler._san(s.id))
            ok = r and r["status"] == "success"
            db.add(StepRun(
                run_id=run.id,
                step_id=s.id,
                status=RunStatus.SUCCESS if ok else RunStatus.FAILED,
                duration_ms=int((r["execution_time"] or 0) * 1000) if r else None,
                message=(r or {}).get("message"),
            ))
        # Persist logs + step statuses before branching, so failures stay diagnosable.
        run.logs = dbt_result["output"][-8000:]
        db.commit()

        if not dbt_result["ok"]:
            run.status = RunStatus.FAILED
            run.error = f"dbt run failed (exit {dbt_result['returncode']})"
            run.finished_at = _now()
            pipeline.status = PipelineStatus.FAILED
            db.commit()
            publishers.run_completed(pipeline_id, run.id, run.status)
            logger.warning("pipeline %s run %s failed (dbt)", pipeline_id, run_id)
            return

        # Catalog each output: locally, and register it back to the data-service
        # catalog (as a mart dataset) so ontology/others can build on it.
        try:
            pipeline_conn = data_client.ensure_pipeline_connector()
        except Exception as exc:  # noqa: BLE001 - registration is best-effort
            pipeline_conn = None
            logger.warning("cannot resolve pipeline connector in data service: %s", exc)

        for out in compiled["outputs"]:
            stats = query.parquet_stats(out["storage_uri"])
            db.add(Output(
                pipeline_id=pipeline_id,
                run_id=run.id,
                step_id=out["step_id"],
                name=out["name"],
                storage_uri=out["storage_uri"],
                row_count=stats["row_count"],
            ))
            publishers.dataset_created(out["name"], out["storage_uri"], stats["row_count"])
            if pipeline_conn:
                try:
                    data_client.register_dataset({
                        "name": out["name"],
                        "display_name": out.get("display_name"),
                        "connector_id": pipeline_conn,
                        "storage_uri": out["storage_uri"],
                        "layer": "mart",
                        "row_count": stats["row_count"],
                        "columns": query.columns(out["storage_uri"]),
                    })
                except Exception as exc:  # noqa: BLE001
                    logger.warning("register mart '%s' to data catalog failed: %s", out["name"], exc)

        run.status = RunStatus.SUCCESS
        run.finished_at = _now()
        pipeline.status = PipelineStatus.SUCCEEDED
        db.commit()
        publishers.run_completed(pipeline_id, run.id, run.status)
        logger.info("pipeline %s run %s succeeded", pipeline_id, run_id)
    except Exception as exc:  # noqa: BLE001 - record failure on the run
        logger.exception("pipeline run %s failed", run_id)
        db.rollback()
        run = db.get(Run, run_id)
        pipeline = db.get(Pipeline, pipeline_id)
        if run is not None:
            run.status = RunStatus.FAILED
            run.error = str(exc)
            run.finished_at = _now()
        if pipeline is not None:
            pipeline.status = PipelineStatus.FAILED
        db.commit()
        if pipeline is not None:
            publishers.run_completed(pipeline_id, run_id, RunStatus.FAILED)
    finally:
        db.close()
