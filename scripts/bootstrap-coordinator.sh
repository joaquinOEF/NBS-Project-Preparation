#!/usr/bin/env bash
# Provision a coordinator on a running deployment via the bootstrap endpoint —
# the env-agnostic way to mirror dev and prod: run it once against the dev URL and
# once against the prod URL (each hits its own database). The endpoint is disabled
# unless BOOTSTRAP_COORDINATOR_SECRET is set in that deployment's env.
#
# Usage:
#   BOOTSTRAP_COORDINATOR_SECRET=<secret> \
#     bash scripts/bootstrap-coordinator.sh <base-url> <email> <password> ["Full Name"]
#
# Examples:
#   # dev (workspace)
#   BOOTSTRAP_COORDINATOR_SECRET=xyz bash scripts/bootstrap-coordinator.sh \
#     http://localhost:5000 joaquin@openearth.org Test_1234 "Joaquin"
#   # prod (published)
#   BOOTSTRAP_COORDINATOR_SECRET=xyz bash scripts/bootstrap-coordinator.sh \
#     https://nbs-project-preparation.replit.app joaquin@openearth.org Test_1234 "Joaquin"

set -euo pipefail
BASE="${1:?usage: bootstrap-coordinator.sh <base-url> <email> <password> [name]}"
EMAIL="${2:?email required}"
PASS="${3:?password required}"
NAME="${4:-}"
SECRET="${BOOTSTRAP_COORDINATOR_SECRET:?set BOOTSTRAP_COORDINATOR_SECRET in your env}"

curl -sS -X POST "$BASE/api/coordinator/bootstrap" \
  -H "x-bootstrap-secret: $SECRET" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"$NAME\"}"
echo
