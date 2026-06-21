#!/usr/bin/env bash
# Apply D1 migrations to a named environment.
# Usage:
#   ./scripts/migrate.sh --env dev
#   ./scripts/migrate.sh --env prod --i-know-what-im-doing

set -euo pipefail

ENV=""
CONFIRMED=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV="$2"
      shift 2
      ;;
    --i-know-what-im-doing)
      CONFIRMED=true
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 --env dev|prod [--i-know-what-im-doing]"
      exit 1
      ;;
  esac
done

if [[ -z "$ENV" || ( "$ENV" != "dev" && "$ENV" != "prod" ) ]]; then
  echo "ERROR: --env must be 'dev' or 'prod'"
  echo "Usage: $0 --env dev|prod [--i-know-what-im-doing]"
  exit 1
fi

if [[ "$ENV" == "prod" && "$CONFIRMED" != "true" ]]; then
  echo ""
  echo "  ⚠️  You are about to run migrations against PRODUCTION."
  echo "  If you are sure, re-run with: $0 --env prod --i-know-what-im-doing"
  echo ""
  exit 1
fi

DB_NAME="timetracking-${ENV}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

echo ""
echo "Applying migrations → ${DB_NAME} (env: ${ENV})"
echo ""

cd worker
npx wrangler d1 migrations apply "${DB_NAME}" --env "${ENV}" --remote

echo ""
echo "Done."
