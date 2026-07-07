# scripts

Scripts to stand up the platform's databases/data and services, by category.

```
scripts/
├── infra/       infrastructure (containers / databases)
│   ├── start_source_db.sh    source Postgres the platform ingests from (:5432)
│   └── start_airflow.sh      Airflow + dbt-duckdb for pipeline orchestration (:8080)
├── seed/        data seeding into the source database
│   ├── seed_base.sql         customers + orders (sales)
│   ├── seed_supply_chain.sql suppliers/warehouses/products/inventory/PO/shipments
│   └── seed.sh               apply both into the source db (idempotent)
└── services/    start the microservices (each auto-creates its own metadata DB)
    ├── start_data.sh         data service        (:8000, sqlite dev.db)
    ├── start_pipeline.sh     pipeline service    (:8001, sqlite pipeline.db)  [Python 3.12]
    ├── start_ontology.sh     ontology service    (:8003, sqlite ontology.db)
    ├── start_governance.sh   governance service  (:8004, sqlite governance.db)
    └── start_auth.sh         auth service        (:8005, sqlite auth.db, seeds roles+admin)
```

## Databases created

- **Source Postgres** (`infra/start_source_db.sh`) — the external system; `seed/seed.sh` fills it.
- **Per-service SQLite** — created automatically on service startup (`create_all`).
  The auth service also seeds the two default roles + a bootstrap `admin` user.
- **Airflow metadata DB** — created inside its container by `infra/start_airflow.sh`.

## Quickstart (fresh machine)

```bash
# 1. infrastructure + data
scripts/infra/start_source_db.sh
scripts/seed/seed.sh

# 2. services (each creates its DB on first start; run in separate terminals
#    or with nohup). Prereq: each service has a .venv with deps installed.
scripts/services/start_data.sh
scripts/services/start_pipeline.sh
scripts/services/start_ontology.sh
scripts/services/start_auth.sh
scripts/services/start_governance.sh

# 3. (optional) Airflow orchestration for pipelines
scripts/infra/start_airflow.sh

# 4. frontend
cd apps/web && npm run dev
```

Notes:
- Service start scripts run in the foreground; pass extra uvicorn args, e.g.
  `scripts/services/start_data.sh --reload`. Override `PORT`/`DATABASE_URL` via env.
- The pipeline venv must be Python 3.12 (dbt is incompatible with 3.14).
- On Intel Macs set `PLATFORM=linux/amd64` for the infra scripts.
