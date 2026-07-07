# Pipeline Service — Design

Transformation layer of AskDelphi: turn raw datasets (from the data service)
into staging/mart datasets via a visual DAG compiled to **dbt** and orchestrated
by **Airflow**.

## Architecture

```
Frontend DAG canvas ── gateway ──► pipeline service (FastAPI, control plane)
                                    │  stores pipeline/graph + run records
                                    │  ① compiles the node graph into a dbt project
                                    │  ② triggers runs and reads status back
                                    ▼
                             Airflow (schedule/orchestrate) ──► dbt (transform engine)
                                                                   │ read raw / write mart
                                                                   ▼
                                                        Data plane: Parquet (→ Iceberg)
```

## Node → dbt mapping

- `source` → a dbt source (external Parquet, resolved from a data-service dataset)
- `transform` → a model with a single `input` CTE (raw SQL or structured op)
- `join` → a model with `left_input` / `right_input` CTEs
- `output` → a model materialized as an external Parquet file (a mart dataset)

Edges become `ref()` / `source()` dependencies → dbt derives the DAG and lineage.

## Engine & orchestration

- **dbt adapter: `dbt-duckdb`** — runs SQL models directly against the Parquet
  data plane (reads raw, writes staging/mart), no separate warehouse server.
  Swap the profile for `dbt-trino` once the data plane moves to Iceberg.
- **Airflow** — one (parameterized) DAG per pipeline: `dbt run <models> →
  register outputs → emit events`; the pipeline service triggers via the Airflow
  REST API and reads run status + lineage from dbt's `manifest.json` /
  `run_results.json`.
- Because Docker Hub is proxy-blocked in this environment, Airflow is best run
  from a pip install (`airflow standalone`) rather than the Docker image; dbt-duckdb
  installs into the same environment. (16 GB RAM: use LocalExecutor, start on demand.)

## Domain model (pipeline service DB — definitions + runs only, no data)

```
pipelines   (id, name, description, status, schedule, owner_id, ...)
steps       (id[canvas], pipeline_id, kind, config, label, x, y)
edges       (id, pipeline_id, from_step, to_step)
runs        (id, pipeline_id, status, started_at, finished_at, error, logs)
step_runs   (id, run_id, step_id, status, duration_ms, message)
outputs     (id, pipeline_id, run_id, step_id, name, layer, storage_uri, row_count)
```

## Dataset catalog

Source datasets are resolved from the data service catalog; output (mart) datasets
are produced on the data plane. In P0 outputs are cataloged locally (`outputs`
table). The next step unifies them into the data service catalog (`POST /datasets`
with `layer=mart`) so `raw → (pipeline) → mart` lineage lives in one place.

## Status vs plan

**Implemented & verified:**
- pipeline CRUD, graph save/validate (acyclic + input-arity + source refs)
- compiler (graph → dbt-duckdb project)
- run engines: dbt CLI subprocess **and** Airflow (toggle via `USE_AIRFLOW`) —
  both verified end-to-end against the data service's `orders` dataset
- per-step status, output cataloging + preview
- frontend `/pipeline` canvas wired to the API (load graph, run, per-node status)
- Airflow image (`services/pipeline/airflow`) with dbt-duckdb + a generic
  `run_dbt_pipeline` DAG, triggered via the Airflow REST API

**Next:** Airflow scheduling (cron); unify outputs into the data catalog
(`POST /datasets`); per-step live status streaming; incremental materialization
and dbt tests; `output → ontology`; governance lineage; Iceberg data plane
(dbt-trino).
