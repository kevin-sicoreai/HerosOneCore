#!/usr/bin/env bash
# Unified config loader — the ONLY way services/scripts receive configuration.
#
#   source scripts/env.sh [dev|prod]     # or set APP_ENV beforehand
#
# Loads config/<profile>.env, validates required keys (fail-fast), and exports
# the alias names some services' pydantic settings expect. No caller may define
# its own defaults: if a key is missing here, startup must fail loudly.

_ENV_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_REPO_ROOT="$(cd "$_ENV_SH_DIR/.." && pwd)"

APP_ENV="${1:-${APP_ENV:-dev}}"
_PROFILE_FILE="$_REPO_ROOT/config/$APP_ENV.env"

if [[ ! -f "$_PROFILE_FILE" ]]; then
  echo "env.sh: profile file not found: $_PROFILE_FILE (APP_ENV=$APP_ENV)" >&2
  return 1 2>/dev/null || exit 1
fi

set -a
# shellcheck disable=SC1090
source "$_PROFILE_FILE"
set +a

# ── fail-fast validation: every key the platform depends on must be set ──
_REQUIRED=(
  APP_ENV JWT_SECRET ADMIN_USER ADMIN_PASS
  META_DB_BASE_URL DB_PREFIX
  SOURCE_DB_HOST SOURCE_DB_PORT SOURCE_DB_USER SOURCE_DB_PASSWORD SOURCE_DB_NAME
  STORAGE_BACKEND S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET S3_REGION
  USE_AIRFLOW AIRFLOW_URL AIRFLOW_USER AIRFLOW_PASSWORD AIRFLOW_DAG_ID
  CATALOG_PUBLISHER OM_API_URL
  LLM_BASE_URL LLM_MODEL
  WEB_PORT
  AUTH_PORT DATA_PORT PIPELINE_PORT ONTOLOGY_PORT GOV_PORT ASSIST_PORT ANALYSIS_PORT
  AUTH_API_URL DATA_API_URL PIPELINE_API_URL ONTOLOGY_API_URL GOV_API_URL
  ASSIST_API_URL ANALYSIS_API_URL
)
_missing=()
for _k in "${_REQUIRED[@]}"; do
  [[ -n "${!_k:-}" ]] || _missing+=("$_k")
done
if (( ${#_missing[@]} > 0 )); then
  echo "env.sh: missing required keys in $_PROFILE_FILE: ${_missing[*]}" >&2
  return 1 2>/dev/null || exit 1
fi

# ── aliases for pydantic field names that differ from the canonical keys ──
export ONTOLOGY_SERVICE_URL="$ONTOLOGY_API_URL"    # analysis, assist
export GOVERNANCE_SERVICE_URL="$GOV_API_URL"       # assist
export ANALYSIS_SERVICE_URL="$ANALYSIS_API_URL"    # assist

# Convenience: full source-DB URL for seed scripts / connector bootstrap.
export SOURCE_DB_URL="postgresql://${SOURCE_DB_USER}:${SOURCE_DB_PASSWORD}@${SOURCE_DB_HOST}:${SOURCE_DB_PORT}/${SOURCE_DB_NAME}"

echo "env.sh: profile=$APP_ENV meta-db=${META_DB_BASE_URL##*@}/${DB_PREFIX}* source-db=${SOURCE_DB_HOST}:${SOURCE_DB_PORT}/${SOURCE_DB_NAME} storage=${STORAGE_BACKEND}:${S3_BUCKET} airflow=${USE_AIRFLOW} catalog=${CATALOG_PUBLISHER}" >&2
