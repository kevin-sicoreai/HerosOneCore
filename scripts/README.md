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
│   ├── seed.sh               apply both into the source db (idempotent)
│   ├── seed_hr.sql           HR 场景:14 张表(员工/考勤/薪酬/招聘/绩效/培训/晋升/调动/请假/面试/合同)
│   └── seed_hr.sh            建 hr 库并灌入 HR 数据(独立于 seed.sh,幂等)
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

## HR 场景种子(场景二)

大厂人事系统的大体量演示数据(约 20000 名员工、70 万条考勤等),灌入源库上独立的 `hr` 数据库,与供应链场景(`seed.sh`)互不影响、可重复执行:

```bash
scripts/seed/seed_hr.sh
```

脚本会先幂等地创建 `hr` 库,再应用 `seed_hr.sql`(14 张表:departments / positions / employees / attendance / payroll / applications / performance_reviews / trainings / training_records / promotions / transfers / leaves / interviews / contracts),末尾打印各表行数校验。无 Docker 时用 `USE_PSQL=1` 直连(见脚本头部注释)。

Notes:
- Service start scripts run in the foreground; pass extra uvicorn args, e.g.
  `scripts/services/start_data.sh --reload`. Override `PORT`/`DATABASE_URL` via env.
- The pipeline venv must be Python 3.12 (dbt is incompatible with 3.14).
- On Intel Macs set `PLATFORM=linux/amd64` for the infra scripts.
