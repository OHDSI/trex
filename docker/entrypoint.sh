#!/bin/sh
# trexsql container entrypoint.
#
# Responsibilities:
#   1. Ensure a TLS keypair exists at /usr/src/server.{crt,key}.
#      If missing, generate a per-container self-signed cert.
#   2. Verify TREX_ROOT_KEY is present and a sane length. It is generated
#      by the trex-init sidecar (see scripts/derive-secrets.ts) into
#      /shared/root.env and made available here via the compose env_file.
#   3. exec the trex binary, forwarding any CLI arguments passed
#      to docker run / compose command.
#
# Note: the self-signed certificate generated here is per-container
# and NOT suitable for production use. Real deployments MUST mount
# their own certificate at /usr/src/server.crt and matching key at
# /usr/src/server.key (or provide them via a secrets manager).

set -eu

CRT=/usr/src/server.crt
KEY=/usr/src/server.key

# ---------------------------------------------------------------------------
# 1. TLS certificate
# ---------------------------------------------------------------------------
if [ -f "$CRT" ] && [ -f "$KEY" ]; then
    echo "STARTUP: using mounted TLS cert at $CRT"
else
    echo "STARTUP: generating per-container self-signed TLS cert at $CRT"
    echo "STARTUP: this cert is NOT suitable for production. Mount /usr/src/server.crt and /usr/src/server.key for real deployments."
    # -newkey rsa:2048 forces a fresh key; -nodes leaves it unencrypted (the
    # process needs to read it on its own); subjectAltName covers localhost
    # and 127.0.0.1 so modern clients accept it.
    openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
        -keyout "$KEY" -out "$CRT" \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
        >/dev/null 2>&1
    chmod 644 "$CRT"
    chmod 600 "$KEY"
fi

# ---------------------------------------------------------------------------
# 2. Root key presence check
# ---------------------------------------------------------------------------
# Skip the gate in --check mode: that path only loads extensions and exits,
# so no key material is ever consumed. Requiring trex-init to have run just
# to sanity-check extension loading would make local/CI use painful.
skip_root_key_check=0
for arg in "$@"; do
    if [ "$arg" = "--check" ]; then
        skip_root_key_check=1
        break
    fi
done

if [ "$skip_root_key_check" -eq 0 ]; then
    if [ -z "${TREX_ROOT_KEY:-}" ]; then
        echo "STARTUP: FATAL: TREX_ROOT_KEY is not set." >&2
        echo "STARTUP: The trex-init service is responsible for generating it." >&2
        echo "STARTUP: Check that the ./secrets directory is mounted and that" >&2
        echo "STARTUP: trex-init has run to completion (depends_on:condition: service_completed_successfully)." >&2
        exit 1
    fi

    # Sanity-check length: 32 bytes base64-encoded is 43-44 chars (44 with padding,
    # 43 without). Refuse anything noticeably shorter.
    if [ "${#TREX_ROOT_KEY}" -lt 40 ]; then
        echo "STARTUP: FATAL: TREX_ROOT_KEY is too short (${#TREX_ROOT_KEY} chars; expected ~43-44)." >&2
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# 3. DevX gate
# ---------------------------------------------------------------------------
# The full image bakes the devx plugin into /usr/src/plugins-dx and the
# devx_ext DuckDB extension into /usr/lib/trexsql/extensions-dx. Both folders
# sit outside the default scan paths, so devx is inert unless
# TREX_DX_ENABLED=true (exact string) appends them here.
if [ "${TREX_DX_ENABLED:-}" = "true" ]; then
    export PLUGINS_DEV_PATH="${PLUGINS_DEV_PATH:-/usr/src/plugins-dev}:/usr/src/plugins-dx"
    export EXTENSION_DIR="${EXTENSION_DIR:-/usr/lib/trexsql/extensions}:/usr/lib/trexsql/extensions-dx"
    echo "STARTUP: TREX_DX_ENABLED=true — devx plugin and devx_ext extension enabled"
fi

# ---------------------------------------------------------------------------
# 4. exec trex
# ---------------------------------------------------------------------------
exec trex "$@"
