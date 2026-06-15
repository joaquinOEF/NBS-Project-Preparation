#!/usr/bin/env bash
# Run the live self-play walkthrough against a LOCAL server with the REAL Claude
# agent — no deployment, no republish. Lets us iterate the skill/flow with the
# actual agent on our own.
#
# THE KEY TRICK: the agent SDK spawns a `node` subprocess; if it inherits the
# Claude Code session env vars (CLAUDECODE, CLAUDE_CODE_SESSION_ID, …) it thinks
# it's nested and HANGS silently. Scrub them and it runs in ~5s/turn.
#
# Needs ANTHROPIC_API_KEY in the env (used for BOTH the agent and the simulated
# user). Usage:
#   ANTHROPIC_API_KEY=sk-ant-… bash scripts/e2e-real-local.sh ["Org Name"]

set -uo pipefail
: "${ANTHROPIC_API_KEY:?set ANTHROPIC_API_KEY (used for the agent + the sim)}"
DB_URL="${E2E_DATABASE_URL:-postgresql://localhost:5432/nbs_e2e}"
DB_NAME="$(basename "$DB_URL")"
PORT="${E2E_PORT:-5050}"
ORG="${1:-Horta Comunitária Cascata}"

createdb "$DB_NAME" 2>/dev/null || true
DATABASE_URL="$DB_URL" npx drizzle-kit push >/dev/null 2>&1 || true
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | xargs -r kill -9 2>/dev/null; sleep 1

echo "▶ booting local server — REAL agent, CLAUDE_* session vars scrubbed — on :$PORT"
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_SESSION_ID -u CLAUDE_EFFORT \
  PORT="$PORT" NODE_ENV=development ENABLE_TEST_ROUTES=1 \
  OAUTH_CLIENT_ID=x OAUTH_REDIRECT_URI="http://localhost:$PORT/cb" OPENAI_API_KEY=x AI_INTEGRATIONS_OPENAI_API_KEY=x \
  DATABASE_URL="$DB_URL" npx tsx server/index.ts > /tmp/e2e-real-server.log 2>&1 &
SRV=$!
for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/__test/ping" && break; sleep 1; done

# Create a real invite (exercises the welcome + preamble + kickoff path).
CID=$(curl -s -X POST "http://localhost:$PORT/__test/cohort" -H 'content-type: application/json' -d '{"name":"Local Real"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['cohort']['id'])")
TOKEN=$(curl -s -X POST "http://localhost:$PORT/__test/cohort/$CID/member" -H 'content-type: application/json' -d "{\"orgName\":\"$ORG\",\"neighborhood\":\"Cascata\"}" | python3 -c "import json,sys;print(json.load(sys.stdin)['member']['capabilityToken'])")
echo "▶ invite: http://localhost:$PORT/cbo-profile?t=$TOKEN"

echo "▶ running real-agent self-play walkthrough…"
E2E_BASE_URL="http://localhost:$PORT" E2E_CBO_PATH="/cbo-profile?t=$TOKEN" \
  RUN_LIVE_WALKTHROUGH=1 E2E_VIDEO=on E2E_TRACE=on \
  npx playwright test e2e/quality/cbo-live-walkthrough.spec.ts --reporter=line
status=$?

kill -9 "$SRV" 2>/dev/null
echo "▶ done. Report (video + trace): npm run test:e2e:report"
exit $status
