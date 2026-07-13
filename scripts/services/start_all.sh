#!/usr/bin/env bash
# Start all seven services in the background, logs under /tmp/hr-<svc>.log.
#   APP_ENV=dev  ./scripts/services/start_all.sh      # (default)
#   APP_ENV=prod ./scripts/services/start_all.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export APP_ENV="${APP_ENV:-dev}"

for svc in auth data pipeline ontology governance analysis assist; do
  log="/tmp/hr-$svc.log"
  nohup "$DIR/start_$svc.sh" > "$log" 2>&1 &
  echo "started $svc (APP_ENV=$APP_ENV) -> $log (pid $!)"
done
