# HerosOneCore

A Palantir Foundry–style **data + AI platform** prototype. The frontend is implemented; the backend microservices are at the directory-skeleton stage (mostly empty dirs + `.gitkeep`).

## Repository layout

```
apps/web/        Frontend, Next.js (the only implemented part)
gateway/         API gateway / BFF (Python; the frontend's only entry point — auth, routing, aggregation)
services/        Python microservices, one directory per service
scripts/         Dev scripts (seed, one-shot startup, migrations)
docs/            Architecture docs, API docs, ADRs
docker-compose.yml   Local all-in-one startup (not created yet)
```

### Business services under `services/`

| Service | Responsibility |
|---------|----------------|
| `auth` | Identity, users, orgs, RBAC |
| `data` | Data ingestion, sources, datasets |
| `pipeline` | Data pipeline orchestration, transforms, scheduling |
| `ontology` | Ontology modeling: object types, properties, relationships |
| `explorer` | Search / query over objects and data |
| `analysis` | Analytics, dashboards, metrics |
| `governance` | Lineage, audit, policies, compliance |
| `marketplace` | Asset catalog, publishing, sharing |
| `app-builder` | Low-code application definitions |
| `assist` | AI assistant / Copilot |
| `apollo` | Deployment, release, ops orchestration |

## Conventions

- **Language: all code comments and documentation must be written in English.**

## Backend conventions (Python)

- **Each service is fully self-contained**: its own `pyproject.toml`, its own database, deployed independently.
- **No shared libraries**: common code (config, logging, auth middleware) lives in each service's `app/core/` and is maintained per service — consistency comes from convention, not shared code.
- **Services communicate only via API / events**, never by sharing database tables.
- Synchronous calls use REST (**FastAPI** recommended); asynchronous flows use a message queue (event schemas live in each service's `app/events/`).
- Database migrations use **Alembic**, under each service's `migrations/`.

### Per-service internal structure

```
services/<name>/
├── app/
│   ├── api/           Transport layer (FastAPI routers / endpoints)
│   ├── domain/        Domain models + business logic (pure Python, framework-agnostic)
│   ├── services/      Use-case orchestration (calls domain + repositories)
│   ├── repositories/  Data access
│   ├── clients/       HTTP clients for calling other microservices
│   ├── schemas/       Pydantic request/response models
│   ├── events/        Publish/subscribe event handlers
│   ├── core/          Config, logging, auth middleware (per service)
│   └── main.py        FastAPI entry point
├── tests/             pytest
├── migrations/        Alembic
├── Dockerfile
├── pyproject.toml
└── README.md
```

## Frontend conventions (apps/web)

- Next.js (**note: this is a version with breaking changes** — read `apps/web/AGENTS.md` and `node_modules/next/dist/docs/` before writing code).
- UI built with shadcn/ui; components live in `components/`.
- The frontend talks only to `gateway`, never directly to backend services.

### Run the frontend locally

```bash
cd apps/web
npm install
npm run dev        # http://localhost:3000
```

## Git

- Remote: `git@github-sicore:kevin-sicoreai/HerosOneCore.git` (SSH over port 443 to bypass the local proxy).
- Private repo; collaboration via collaborators.
