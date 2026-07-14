#!/usr/bin/env bash
# Makes the devx-agent eve mount actually servable on the dx stack
# (ghcr.io/ohdsi/trexsql-dx image). Run AFTER every `trex` container
# (re)start and BEFORE the first request to the agent mount — the agent
# worker boots lazily on first request and bakes its import map in at
# worker creation time.
#
# Why this exists (verified live, plan Task 3): core's agent staging
# (core/server/plugin/agents.ts buildAgentWorkerConfig) copies ONLY the
# agent dir (plugins/devx/agent) into the worker servicePath, but the devx
# agent imports ../functions/** — so the staged worker 500s with
# "Module not found: .../functions/tools/workspace.ts". Three follow-on
# gaps surface once that is fixed (remote std import unfetchable in the
# worker, MCP SDK absent from the image's frozen npm package set,
# @ai-sdk/anthropic@latest resolving to a spec version the runtime's `ai`
# rejects). All four are patched here against the STAGED copy under
# /tmp/trex-agents-* inside the container; container-local and boot-scoped
# by design. The real fixes belong upstream (staging the sibling
# `functions/` dir + pinning the import map) — see evals/README.md
# "Known live-stack gaps".
#
# A fifth, unrelated gap (found live, plan Task 4): the published dx image
# bakes a pre-rename plugins-dev/devx tree, so the STAGED agent/
# instructions.md still reads "You are DevX..." even though this branch's
# source (plugins/devx/agent/instructions.md) says "You are Code..." — same
# root cause as the SPA `<title>` gap in evals/README.md's "Rename (DevX ->
# Code) live verification" section. `smoke/persona.eval.ts` fails against an
# unpatched mount for this reason, not because the eval is wrong. Patched
# below by copying this checkout's instructions.md over the staged copy
# (host file, not a container-internal path — the only one of these five
# fixes that pulls from the branch rather than from the image).
set -euo pipefail

COMPOSE="${COMPOSE:-docker compose -f docker-compose.dx.yml}"

staged=$($COMPOSE exec -T trex sh -eu <<'EOF'
staged=$(ls -d /tmp/trex-agents-* 2>/dev/null | head -1)
if [ -z "$staged" ]; then
  echo "fix-agent-mount: no /tmp/trex-agents-* staging dir found (is the trex service up?)" >&2
  exit 1
fi

# 1. Stage the plugin's functions/ dir next to agent/ so the agent's
#    ../functions/** imports resolve inside the worker servicePath.
rm -rf "$staged/functions"
cp -r /usr/src/plugins-dev/devx/functions "$staged/functions"

# 2 + 3. Import-map fixes, applied to BOTH map files (deno.json feeds the
# static graph builder, import_map.json the runtime resolver):
#   - map the deno.land std path import to node:path (the worker cannot
#     fetch remote modules; only join/dirname/relative/resolve are used,
#     all API-compatible),
#   - pin @ai-sdk/anthropic to 3.0.96 (the image's npm set has 3.0.96 and
#     4.0.12; @latest resolves to 4.x whose model spec the runtime's
#     ai@6.0.224 rejects: 'Unsupported model version v4').
for f in "$staged/deno.json" "$staged/import_map.json"; do
  node -e "
    const fs = require('fs');
    const j = JSON.parse(fs.readFileSync('$f', 'utf8'));
    j.imports['https://deno.land/std@0.224.0/path/mod.ts'] = 'node:path';
    j.imports['@ai-sdk/anthropic'] = 'npm:@ai-sdk/anthropic@3.0.96';
    fs.writeFileSync('$f', JSON.stringify(j, null, 2));
  "
done

# 4. Lazy-load mcp_manager in dynamic-tools.ts: the MCP SDK is not in the
#    image's frozen npm package set, so a static import fails the whole
#    agent graph ("Could not find constraint '@modelcontextprotocol/sdk'").
#    Anonymous/eval users have no devx.mcp_servers rows, so the lazy branch
#    never loads it.
dt="$staged/agent/dynamic-tools.ts"
if grep -q '^import { mcpManager } from "../functions/mcp_manager.ts";' "$dt"; then
  sed -i 's|^import { mcpManager } from "../functions/mcp_manager.ts";|// fix-agent-mount: lazy-loaded below (MCP SDK not in the image npm set)|' "$dt"
  sed -i 's|const mcpTools = await mcpManager.getTools(userId, servers);|const { mcpManager } = await import("../functions/mcp_manager.ts");\n  const mcpTools = await mcpManager.getTools(userId, servers);|' "$dt"
fi

echo "$staged"
EOF
)

# 5. Sync agent/instructions.md from THIS checkout (not the image) so the
#    worker's system prompt matches the branch's DevX -> Code rename
#    instead of whatever pre-rename text the published image baked in.
#    Runs on the host, not inside the container shell above, since it reads
#    a host path.
$COMPOSE cp plugins/devx/agent/instructions.md "trex:$staged/agent/instructions.md"

# 6. (task 15) Sync the core agent-runtime service files from THIS checkout
#    over the staged copy. core's agent staging (buildAgentWorkerConfig in
#    core/server/plugin/agents.ts) copies core/server/agents/{service,eve-shim}
#    into the worker servicePath at WORKER-CREATION time only — same
#    creation-time-baked pattern as the import map fixed in steps 2-3 above —
#    so edits to runner.ts/toolset.ts/model.ts (or anything else under
#    service/) never reach an already-staged worker on their own. Copies the
#    whole service/ dir (not just the three files task 15 touches) so this
#    step stays correct for future edits to the same runtime without needing
#    another update here. Runs on the host, same as step 5, since it reads
#    host paths; the worker itself still needs a restart/recreate afterward
#    for a NEW worker to be created against this patched staging dir (the
#    pool reuses the first worker per servicePath — see agents.ts).
# Trailing "/." on the source: `docker cp`/`compose cp` copies a bare
# directory INTO an existing destination directory (producing a nested
# .../agents/service/service/*), but copies a directory's CONTENTS when the
# source ends with "/." — the staged $staged/agents/service dir already
# exists (created by buildAgentWorkerConfig), so this must be the latter.
$COMPOSE cp core/server/agents/service/. "trex:$staged/agents/service"

echo "fix-agent-mount: patched $staged"
