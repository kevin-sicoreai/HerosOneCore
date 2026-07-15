#!/usr/bin/env bash
# Start the web frontend. All config comes from scripts/env.sh (APP_ENV profile):
# service URLs via *_API_URL (consumed by apps/web/next.config.ts rewrites),
# listen port via WEB_PORT.
#   APP_ENV=dev  ./scripts/services/start_web.sh    # next dev (default)
#   APP_ENV=prod ./scripts/services/start_web.sh    # next build + next start
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/env.sh"
cd "$ROOT/apps/web"

if [[ "$APP_ENV" == "prod" ]]; then
  npm run build
  exec npm run start -- --port "$WEB_PORT" "$@"
else
  exec npm run dev -- --port "$WEB_PORT" "$@"
fi
