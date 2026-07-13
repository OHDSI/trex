#!/usr/bin/env bash
# Mints a long-lived (10y) trex user access token for the eval user, signed
# with the dx stack's own root key (./secrets/root.env), and prints it.
#
# Why: the devx agent REFUSES anonymous turns (agent.ts resolveModel throws
# "devx agent requires an authenticated user"), and eve's runner can only
# authenticate via a static bearer (EVE_EVAL_AUTH_TOKEN) — service_role /
# anon apikeys are explicitly rejected on the bearer channel by
# core/server/middleware/auth-context.ts. So evals run as this fixed user.
#
# The sub is FIXED on purpose: agents.sessions.created_by and the devx
# tables type user ids as uuid, and the user's workspace directory is
# derived from it (plugins/devx/functions/tools/workspace.ts):
#   /tmp/devx-workspaces/<EVAL_USER_ID>
# seed.sh's EVAL_WS default must stay in sync with EVAL_USER_ID.
#
# Usage:
#   export EVE_EVAL_AUTH_TOKEN="$(./mint-eval-token.sh)"
set -euo pipefail

# Repo root = four levels up from this script's dir (plugins/devx/agent/evals).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
SECRETS="${SECRETS:-$ROOT/secrets/root.env}"
EVAL_USER_ID="${EVAL_USER_ID:-6e6a3b1c-0000-4000-8000-0de70e0a1001}"

node - "$SECRETS" "$EVAL_USER_ID" <<'EOF'
const crypto = require("crypto");
const fs = require("fs");
const [secretsPath, sub] = process.argv.slice(2);
const m = fs.readFileSync(secretsPath, "utf8").match(/TREX_ROOT_KEY=(.+)/);
if (!m) throw new Error(`TREX_ROOT_KEY not found in ${secretsPath}`);
// Mirror core/server/auth/keys.ts: b64decode (url-safe tolerant), first 32
// bytes, HKDF-SHA256 with salt "trex/v1" and label "trex.jwt.hs256.v1",
// then deriveSubkeyBase64 (base64, padding stripped) used as a UTF-8 HMAC
// secret string (core/server/auth/jwt.ts getJwtSecret/hmacSign).
const norm = m[1].trim().replace(/-/g, "+").replace(/_/g, "/");
const rootKey = Buffer.from(norm + "=".repeat((4 - (norm.length % 4)) % 4), "base64").subarray(0, 32);
const secret = Buffer.from(
  crypto.hkdfSync("sha256", rootKey, Buffer.from("trex/v1"), Buffer.from("trex.jwt.hs256.v1"), 32),
).toString("base64").replace(/=+$/, "");
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const payload = {
  sub, role: "authenticated", aud: "authenticated",
  iss: "http://localhost:9001/trex/auth/v1",
  exp: now + 10 * 365 * 24 * 3600, iat: now,
  email: "devx-eval@example.com",
  app_metadata: { provider: "email", providers: ["email"], trex_role: "user" },
  user_metadata: {}, session_id: "devx-eval-session",
};
const data = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + b64url(JSON.stringify(payload));
const sig = crypto.createHmac("sha256", Buffer.from(secret, "utf8")).update(data).digest();
process.stdout.write(data + "." + b64url(sig) + "\n");
EOF
