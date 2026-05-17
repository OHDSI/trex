#!/bin/sh
set -eu
SECRETS_DIR="${TREX_SECRETS_DIR:-/shared}"
mkdir -p "$SECRETS_DIR"
exec deno run --allow-env --allow-read --allow-write /usr/src/scripts/derive-secrets.ts "$SECRETS_DIR"
