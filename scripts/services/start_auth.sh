#!/usr/bin/env bash
# Start the auth service (creates its SQLite DB + seeds roles/admin on first start). Port 8005.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../services/auth" && pwd)"
source .venv/bin/activate
export DATABASE_URL="${DATABASE_URL:-sqlite:///./auth.db}"
exec uvicorn app.main:app --host 127.0.0.1 --port "${PORT:-8005}" "$@"
