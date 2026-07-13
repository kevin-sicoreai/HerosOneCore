# Data Service

Connector & dataset control plane for HerosOneCore. It manages connections to
external source systems, ingests their data into the data plane, and exposes a
dataset catalog (schema + preview) for downstream services.

**P0 scope:** PostgreSQL sources, ingested via a built-in DuckDB loader that
copies tables to Parquet. Airbyte (EL) and dbt/Airflow (transform/orchestration)
are introduced later behind the same interfaces. See the root `AGENTS.md`.

## Architecture

- **Control plane:** FastAPI + SQLAlchemy. Metadata (connectors, datasets,
  columns, sync runs) lives in the service's own database.
- **Data plane:** ingested raw data is written as Parquet. P0 uses a local
  directory; this is the seam that later points at MinIO/S3 (Iceberg).
- **Loader:** `app/clients/duckdb_loader.py` attaches the source Postgres and
  copies tables to Parquet — the stand-in for Airbyte.

## Layout

```
app/
├── api/           FastAPI routers (connectors, datasets, connector-types, syncs)
├── domain/        Enums + connector-type catalog (framework-agnostic)
├── services/      Use cases (connector / sync / dataset)
├── repositories/  SQLAlchemy ORM models
├── clients/       source_postgres, duckdb_loader, storage
├── schemas/       Pydantic request/response models
├── events/        Domain event publishers (log-based in P0)
└── core/          config, db, logging
```

## Configuration (env vars)

| Var | Default | Meaning |
|-----|---------|---------|
| `DATABASE_URL` | `sqlite:///./data_service.db` | Metadata store; use Postgres in real deployments |
| `DATA_PLANE_DIR` | `./_dataplane` | Where ingested Parquet is written |
| `PREVIEW_DEFAULT_LIMIT` | `100` | Default preview row count |
| `LOG_LEVEL` | `INFO` | Log level |

## Run locally

```bash
cd services/data
python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
# open http://127.0.0.1:8000/docs
```

> The DuckDB `postgres` extension is downloaded on first use, so the first sync
> needs network access.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/connector-types` | Supported/known source types (catalog) |
| POST | `/connectors` | Create a connector |
| GET | `/connectors` | List connectors |
| GET | `/connectors/{id}` | Get a connector |
| PATCH | `/connectors/{id}` | Update a connector |
| DELETE | `/connectors/{id}` | Delete a connector |
| POST | `/connectors/{id}/test` | Test connectivity |
| POST | `/connectors/{id}/sync` | Trigger ingestion (async) |
| GET | `/connectors/{id}/syncs` | Sync-run history |
| GET | `/syncs/{id}` | Get a sync run |
| GET | `/datasets` | List datasets (optional `?connector_id=`) |
| GET | `/datasets/{id}` | Dataset detail + schema |
| GET | `/datasets/{id}/schema` | Dataset columns |
| GET | `/datasets/{id}/preview?limit=` | Preview rows |

### Example: a PostgreSQL connector config

```json
{
  "name": "Shop DB",
  "source_type": "postgres",
  "config": {
    "host": "localhost", "port": 5432,
    "database": "shop", "username": "shop", "password": "shop",
    "schema": "public"
  }
}
```
