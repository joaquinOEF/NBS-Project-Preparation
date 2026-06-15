#!/usr/bin/env bash
# One-command local e2e run WITH video + trace, for the "test it and share the
# video" flow. Sets up a throwaway Postgres DB, pushes the schema, runs the
# deterministic suite recording a video + scrubbable trace for every test, then
# leaves the HTML report ready to open with `npm run test:e2e:report`.
#
# Usage:
#   bash scripts/e2e-local.sh                 # whole suite
#   bash scripts/e2e-local.sh cbo-golden-path # one spec (any playwright args)
#
# Env overrides:
#   E2E_DB_NAME        (default: nbs_e2e)
#   E2E_DATABASE_URL   (default: postgresql://localhost:5432/<E2E_DB_NAME>)

set -uo pipefail

DB_NAME="${E2E_DB_NAME:-nbs_e2e}"
export DATABASE_URL="${E2E_DATABASE_URL:-postgresql://localhost:5432/${DB_NAME}}"

echo "▶ e2e DB: ${DATABASE_URL}"
createdb "${DB_NAME}" 2>/dev/null && echo "  created ${DB_NAME}" || echo "  reusing ${DB_NAME}"

echo "▶ pushing schema…"
echo "y" | npx drizzle-kit push >/dev/null 2>&1 || npx drizzle-kit push

echo "▶ running e2e with video + trace…"
E2E_VIDEO=on E2E_TRACE=on npx playwright test "$@"
status=$?

echo ""
echo "▶ videos:   $(find test-results -name '*.webm' 2>/dev/null | wc -l | tr -d ' ') recorded under test-results/"
echo "▶ open the report (videos + traces): npm run test:e2e:report"
exit $status
