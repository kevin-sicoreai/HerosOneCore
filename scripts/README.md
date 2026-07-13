# scripts

Platform operation scripts. All configuration comes from the unified profile
(`config/dev.env` / `config/prod.env`), loaded exclusively via `scripts/env.sh`
— no script or service defines its own connection defaults.

```
scripts/
├── env.sh                     unified config loader: source scripts/env.sh [dev|prod]
├── seed/                      enterprise-operations demo data
│   ├── seed_ops.sql           14 tables: customers/products/orders/purchases/
│   │                          inventory/shipments/invoices/payments/tickets…
│   ├── seed_ops.sh            seed the profile's source DB (psycopg, no psql needed)
│   └── bootstrap_ops.py       wire the platform end to end: connector -> sync ->
│                              pipeline marts -> ontology -> governance -> labels
└── services/                  start the FastAPI services (dev/prod by APP_ENV)
    ├── start_all.sh           all seven, logs under /tmp/hr-<svc>.log
    ├── start_<svc>.sh         auth :8005 / data :8000 / pipeline :8001 /
    │                          ontology :8003 / governance :8004 /
    │                          analysis :8008 / assist :8006
    └── start_web.sh           Next.js frontend :$WEB_PORT — dev profile runs
                               `next dev`, prod runs `next build` + `next start`;
                               service URLs come from the profile's *_API_URL
```

## Typical flows

```bash
# start everything against the dev namespace (server middleware)
APP_ENV=dev ./scripts/services/start_all.sh
APP_ENV=dev ./scripts/services/start_web.sh

# seed + bootstrap the operations scenario (idempotent)
APP_ENV=dev ./scripts/seed/seed_ops.sh
source scripts/env.sh dev && python3 scripts/seed/bootstrap_ops.py

# prod: seeding requires an explicit confirmation flag
APP_ENV=prod SEED_ALLOW_PROD=true ./scripts/seed/seed_ops.sh
```
