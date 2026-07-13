# Governance Service

Cross-cutting governance for HerosOneCore. It does not own the assets — it
**aggregates** the data / pipeline / ontology services to produce a
platform-wide lineage graph and an audit feed, plus a placeholder access matrix.

## What it provides

- **Lineage** — a graph across the platform:
  `connector → dataset → pipeline → mart → object type`, assembled live from the
  upstream services.
- **Audit** — a feed built from real activity (data syncs, pipeline runs,
  object-type creations), newest first.
- **Access matrix (roles)** — placeholder RBAC seeded in the governance DB until
  a dedicated auth service exists.
- **Stats** — governed asset count, roles, audit events, encryption coverage.

## Layout

```
app/
├── api/           governance (lineage / audit / roles / stats)
├── services/      lineage / audit / roles / stats services
├── repositories/  ORM: roles
├── clients/       upstream (best-effort GETs to data/pipeline/ontology)
├── schemas/       Pydantic DTOs
└── core/          config, db (+ role seeding), logging
```

## Configuration

| Var | Default | Meaning |
|-----|---------|---------|
| `DATABASE_URL` | `sqlite:///./governance.db` | Roles store |
| `DATA_API_URL` | `http://localhost:8000` | Data service |
| `PIPELINE_API_URL` | `http://localhost:8001` | Pipeline service |
| `ONTOLOGY_API_URL` | `http://localhost:8003` | Ontology service |

## Run locally

```bash
cd services/governance
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e .
export DATA_API_URL=http://127.0.0.1:8000 PIPELINE_API_URL=http://127.0.0.1:8001 ONTOLOGY_API_URL=http://127.0.0.1:8003
uvicorn app.main:app --reload --port 8004
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/lineage` | Cross-platform lineage graph (nodes + edges) |
| GET | `/audit?limit=` | Audit feed from real platform activity |
| GET | `/roles` | Access matrix |
| GET | `/stats` | Dashboard summary counts |

> Aggregation is best-effort: if an upstream service is down, its assets are
> simply omitted rather than failing the whole response.
