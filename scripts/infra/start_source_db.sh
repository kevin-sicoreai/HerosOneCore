#!/usr/bin/env bash
# Start the source Postgres (the external system the platform ingests from).
# Creates a fresh `shop` database in a container named askdelphi-src on port 5432.
set -euo pipefail

NAME="${CONTAINER:-askdelphi-src}"
PLATFORM="${PLATFORM:-linux/arm64}"   # use linux/amd64 on Intel
PORT="${PORT:-5432}"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --platform "$PLATFORM" \
  -e POSTGRES_USER=shop -e POSTGRES_PASSWORD=shop -e POSTGRES_DB=shop \
  -p "${PORT}":5432 \
  postgres:17-alpine

echo "waiting for postgres..."
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U shop -d shop >/dev/null 2>&1 && break
  sleep 1
done
echo "source db '$NAME' ready on port ${PORT} (shop/shop). Seed it with scripts/seed/seed.sh"
