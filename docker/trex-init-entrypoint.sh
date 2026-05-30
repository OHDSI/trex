#!/bin/sh
set -eu
SECRETS_DIR="${TREX_SECRETS_DIR:-/shared}"
mkdir -p "$SECRETS_DIR"
# --node-modules-dir=none: derive-secrets.ts has no npm imports, but the
# stripped runtime deno.json sets nodeModulesDir=auto, which makes deno try
# to materialize the workspace's transitive npm deps into /usr/src/node_modules
# (root-owned, read-only for uid=1000). Override to skip that entirely.
# DENO_DIR points cache writes at a writable location regardless.
export DENO_DIR="${DENO_DIR:-/tmp/deno}"
exec deno run --node-modules-dir=none --allow-env --allow-read --allow-write \
  /usr/src/scripts/derive-secrets.ts "$SECRETS_DIR"
