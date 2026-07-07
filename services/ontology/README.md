# Ontology Service

Semantic layer for AskDelphi. Turns datasets (from the data service) into typed
**object types** with **properties** and **links** (relationships). Object
*instances* are not copied here — they are queried on demand from the backing
dataset's Parquet on the data plane.

## Concepts

- **ObjectType** — a typed entity (e.g. Customer) backed by a dataset; its
  properties are imported from the dataset schema.
- **Property** — a field of an object type (name, type, primary-key flag).
- **LinkType** — a directed relationship between two object types, joined on
  `from_object_type.from_property == to_object_type.to_property`.
- **Object instances** — read live from the backing dataset via DuckDB.

## Layout

```
app/
├── api/           object_types, link_types, objects, graph
├── domain/        enums (cardinality)
├── services/      object_type / link_type / object / graph services
├── repositories/  ORM: object_types / properties / link_types
├── clients/       data_client (data service), query (duckdb)
├── schemas/       Pydantic DTOs
├── events/        publishers (log-based)
└── core/          config, db, logging
```

## Configuration

| Var | Default | Meaning |
|-----|---------|---------|
| `DATABASE_URL` | `sqlite:///./ontology.db` | Metadata store |
| `DATA_API_URL` | `http://localhost:8000` | Data service base URL |

## Run locally

```bash
cd services/ontology
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e .
export DATA_API_URL=http://localhost:8000
uvicorn app.main:app --reload --port 8003
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST/GET | `/object-types` | Create (imports schema) / list |
| GET/PATCH/DELETE | `/object-types/{id}` | Detail (+ properties) / update / delete |
| GET | `/object-types/{id}/properties` | Properties |
| GET | `/object-types/{id}/objects?limit=` | Instance preview |
| GET | `/object-types/{id}/objects/count` | Instance count |
| GET | `/object-types/{id}/objects/{pk}/linked/{link_id}` | Traverse a link |
| POST/GET/DELETE | `/link-types` | Manage relationships |
| GET | `/graph` | Object types + links (for the frontend canvas) |
