# Pipeline Service

Transformation layer for AskDelphi. Users build a visual DAG (source → transform
/ join → output); the service compiles it into a **dbt** project and runs it,
turning raw datasets from the data service into staging/mart datasets.

**P0 scope:** the graph is compiled to a dbt (`dbt-duckdb`) project and executed
via the dbt CLI as a subprocess, reading/writing Parquet on the data plane.
**Airflow** orchestration is layered on next (same generated project).

> Requires Python 3.11/3.12 — dbt does not yet support 3.14.

## How it maps to dbt

| Node | Generated dbt object |
|------|----------------------|
| `source` | a dbt source (external Parquet, from a data-service dataset) |
| `transform` | a model with a single `input` CTE (raw SQL or a structured op) |
| `join` | a model with `left_input` / `right_input` CTEs |
| `output` | a model materialized as an external Parquet file (a mart dataset) |

Edges become `ref()` / `source()` dependencies, so dbt derives the DAG + lineage.

## Layout

```
app/
├── api/           pipelines, graph, runs
├── domain/        enums, dag (topological order / cycle detection)
├── services/      pipeline / graph / run services, compiler (graph -> dbt)
├── repositories/  ORM: pipelines / steps / edges / runs / step_runs / outputs
├── clients/       data_client (data service), dbt_runner, query (duckdb preview)
├── schemas/       Pydantic DTOs
├── events/        publishers (log-based in P0)
└── core/          config, db, logging
```

## Configuration (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `DATABASE_URL` | `sqlite:///./pipeline.db` | Metadata store |
| `DATA_API_URL` | `http://localhost:8000` | Data service base URL |
| `WORK_DIR` | `./_pipelines` | Generated dbt projects (one per pipeline) |
| `MART_DIR` | `./_dataplane/mart` | Output Parquet location |
| `DBT_EXECUTABLE` | `dbt` | dbt CLI (needs dbt-duckdb) |

## Run locally

```bash
cd services/pipeline
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e .
export DATA_API_URL=http://localhost:8000
uvicorn app.main:app --reload --port 8001    # data service uses 8000
# open http://127.0.0.1:8001/docs
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST/GET | `/pipelines` | Create / list pipelines |
| GET/PATCH/DELETE | `/pipelines/{id}` | Get / update / delete |
| GET/PUT | `/pipelines/{id}/graph` | Load / replace the canvas (steps + edges) |
| POST | `/pipelines/{id}/validate` | Validate the DAG |
| POST | `/pipelines/{id}/run` | Compile to dbt and run (async) |
| GET | `/pipelines/{id}/runs` | Run history |
| GET | `/runs/{id}` | Run detail (per-step status) |
| GET | `/pipelines/{id}/outputs` | Mart datasets produced |
| GET | `/outputs/{id}/preview?limit=` | Preview an output |
