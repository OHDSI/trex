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
