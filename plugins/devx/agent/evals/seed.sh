#!/usr/bin/env bash
# Resets the devx-agent eval fixture workspace inside the dx-stack trex
# container. Idempotent; run before every full eval run.
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose -f docker-compose.dx.yml}"
# Workspace dir the agent's eval-user sessions resolve to (verified in
# the plan's Task 3 step 3 — see README "Verified facts"). The devx agent
# rejects anonymous turns, so evals run as the fixed user minted by
# mint-eval-token.sh; keep this in sync with its EVAL_USER_ID.
EVAL_WS="${EVAL_WS:-/tmp/devx-workspaces/6e6a3b1c-0000-4000-8000-0de70e0a1001}"

$COMPOSE exec -T trex sh -eu <<EOF
rm -rf "$EVAL_WS/fixture"
mkdir -p "$EVAL_WS/fixture/notes" "$EVAL_WS/fixture/src"

cat > "$EVAL_WS/fixture/src/math.ts" <<'TS'
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
TS

cat > "$EVAL_WS/fixture/src/util.ts" <<'TS'
// FIXTURE_MARKER_ALPHA
// FIXTURE_MARKER_EDIT
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
TS

echo "The fixture codeword is PLUM." > "$EVAL_WS/fixture/notes/greeting.txt"

# The GitLog/GitDiff/GitCommit tools (plugins/devx/functions/tools/git.ts)
# always operate on ctx.workspacePath itself (no path/cwd parameter to scope
# into a subdirectory) — so the seeded git repo MUST live at the workspace
# root ($EVAL_WS), not inside the fixture/ subdirectory, or the git-family
# evals see an empty, repo-less directory (verified live, plan Task 6:
# GitLog replied "No commits yet." when the repo was nested under fixture/).
cd "$EVAL_WS"
rm -rf .git
git init -q
git -c user.email=eval@example.com -c user.name=eval add fixture/src/
git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture: initial eval fixture"
git -c user.email=eval@example.com -c user.name=eval add fixture/notes/
git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture: add greeting note"
# Leave one uncommitted change for the GitDiff eval:
echo "Pending line for git-diff eval." >> fixture/notes/greeting.txt
EOF
echo "seeded: $EVAL_WS (git repo at workspace root, fixture/ files inside)"

# SQL-tool fixture (plan Task 7, tools/sql/): ExecuteSQL/DatabaseSchema
# (plugins/devx/functions/tools/execute_sql.ts,get_database_schema.ts) scope
# every query to one "app"'s own devx_app_* Postgres schema, resolved via
# devx.app_databases. ExecuteSQL additionally requires ctx.chatId to map
# to a devx.chats row owning an app_id (verifyChatOwnership,
# plugins/devx/agent/lib/context.ts) — DatabaseSchema instead takes app_id
# as a direct tool argument and has no ownership check. Fixed ids so both
# eval files can reference them without re-querying:
EVAL_APP_ID="6e6a3b1c-0000-4000-8000-00000000a001"
EVAL_CHAT_ID="6e6a3b1c-0000-4000-8000-00000000c001"
EVAL_SQL_SCHEMA="devx_app_eval"
# EVAL_WS is "/tmp/devx-workspaces/<userId>" (see above) — derive the eval
# user id from it rather than hardcoding it a second time.
EVAL_USER_ID="$(basename "$EVAL_WS")"

PGPASSWORD=mypass psql -h localhost -p 65443 -U postgres -d testdb -v ON_ERROR_STOP=1 -q -c "
INSERT INTO devx.apps (id, user_id, name, path)
VALUES ('$EVAL_APP_ID', '$EVAL_USER_ID', 'Eval Fixture App', '$EVAL_WS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO devx.chats (id, user_id, app_id, title, mode)
VALUES ('$EVAL_CHAT_ID', '$EVAL_USER_ID', '$EVAL_APP_ID', 'Eval Fixture Chat', 'build')
ON CONFLICT (id) DO UPDATE SET app_id = EXCLUDED.app_id;

CREATE SCHEMA IF NOT EXISTS $EVAL_SQL_SCHEMA;
CREATE TABLE IF NOT EXISTS $EVAL_SQL_SCHEMA.widgets (id SERIAL PRIMARY KEY, name TEXT NOT NULL);
DELETE FROM $EVAL_SQL_SCHEMA.widgets;
INSERT INTO $EVAL_SQL_SCHEMA.widgets (name) VALUES ('foo'), ('bar');

INSERT INTO devx.app_databases (app_id, schema_name)
VALUES ('$EVAL_APP_ID', '$EVAL_SQL_SCHEMA')
ON CONFLICT (schema_name) DO NOTHING;
"
echo "seeded: devx.apps/$EVAL_APP_ID, devx.chats/$EVAL_CHAT_ID, schema $EVAL_SQL_SCHEMA (tools/sql fixture)"
