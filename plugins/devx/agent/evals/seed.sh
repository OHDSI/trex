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
export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
TS

echo "The fixture codeword is PLUM." > "$EVAL_WS/fixture/notes/greeting.txt"

cd "$EVAL_WS/fixture"
rm -rf .git
git init -q
git -c user.email=eval@example.com -c user.name=eval add src/
git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture: initial eval fixture"
git -c user.email=eval@example.com -c user.name=eval add notes/
git -c user.email=eval@example.com -c user.name=eval commit -qm "fixture: add greeting note"
# Leave one uncommitted change for the GitDiff eval:
echo "Pending line for git-diff eval." >> notes/greeting.txt
EOF
echo "seeded: $EVAL_WS/fixture"
