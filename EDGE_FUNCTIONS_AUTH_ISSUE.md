# Edge Functions: default template auth fails with `INVALID_CREDENTIALS`

## Resolution

**Fixed.** Option 3 (adopt the new Supabase key model end-to-end) was
implemented. trex now mints `sb_publishable_…` / `sb_secret_…` keys at boot
(random, base64url — not derived from the JWT signing key, so they survive a
signing-key rotation) and persists them in `trexdb.setting` under
`auth.publishableKey` / `auth.secretKey` as `{id, key, inserted_at}` JSONB
objects (`core/server/auth/sb-keys.ts`).

They are accepted at:

- the edge-function invoke `verify_jwt` gate
- the `authContext` middleware `apikey` branch
- realtime (WS upgrade, `access_token` refresh, broadcast REST)
- the PostgREST and storage proxies, via legacy-JWT header translation
  (`translateSbHeaders`) — their vendored backends only validate legacy JWTs,
  so trex swaps a valid sb key for the equivalent legacy anon/service_role JWT
  before forwarding. The pg-meta proxy needs no translation: its worker does
  no credential validation of its own, so the gateway's `authContext` gate is
  sufficient.

Resolution is by **timing-safe equality**, not key format — trex compares the
caller-presented key against the stored publishable/secret value
(`resolveSbKeyRole`). A publishable-key match resolves to `anon`, a
secret-key match to `service_role`.

They're injected into function workers as `SUPABASE_PUBLISHABLE_KEY` /
`SUPABASE_SECRET_KEY` — the env names `jsr:@supabase/server`'s `withSupabase`
compares the request `apikey` header against. **Caller-side requirement:**
`withSupabase` reads the `apikey` header, not `Authorization` — clients must
send the key on `apikey` for the stock template to accept it.

Surfaced via the Management API (`GET /v1/projects/:ref/api-keys`, plus
per-key `GET …/api-keys/:id?reveal=true`; `POST`/`PATCH`/`DELETE` return `501`
since trex manages a single default key pair, not a table of named keys), the
admin endpoint `/api/settings/auth-keys`, and the GraphQL
`rotatePublishableKey` / `rotateSecretKey` mutations. As a side effect, the
legacy `rotateAnonKey` / `rotateServiceRoleKey` mutations now also invalidate
the memoized legacy-key cache (`invalidateAuthKeysCache`) so the PostgREST /
storage proxies never forward a stale JWT after rotation.

Same caveat as the legacy keys: function worker env vars are cached at boot,
so a rotated key only reaches workers on the next server restart.

Full sweep: `cd core && deno test -A --no-check server/auth/ server/realtime/authz.test.ts`
(DB-gated tests skip/ignore without `DATABASE_URL`). See
`plugins/docs/docs/operations/secret-rotation.md` for the operator-facing
rotation writeup.

### How to verify live (needs a running dev stack)

Not run as part of this change — no dev stack was available in the
implementing environment. A human should run this against a live server
before considering the fix field-verified:

```sh
# 1. Fetch the new keys (admin credentials required)
curl -s "http://localhost:8001/trex/v1/projects/default/api-keys?reveal=true" -H "authorization: Bearer $ADMIN_JWT" | jq '.[] | {name, type, api_key}'

# 2. Deploy the stock withSupabase hello-world template from Studio, then invoke with the publishable key:
curl -s -X POST "http://localhost:8001/trex/functions/v1/hello-world" \
  -H "apikey: $SB_PUBLISHABLE" -H "authorization: Bearer $SB_PUBLISHABLE" \
  -H "content-type: application/json" -d '{"name":"x"}'
# Expected: 200 {"message":"Hello x!"} — previously 401 INVALID_CREDENTIALS

# 3. PostgREST through the proxy with the secret key:
curl -s "http://localhost:8001/trex/rest/v1/?apikey=ignored" -H "apikey: $SB_SECRET"
# Expected: 200 (root schema listing as service_role), not 401

# 4. Legacy keys still work everywhere (regression check): repeat 2-3 with the legacy anon/service_role JWTs.

# 5. Settings endpoint returns all four keys (regression check for the JSONB-parsing 500):
curl -s "http://localhost:8001/trex/api/settings/auth-keys" -H "authorization: Bearer $ADMIN_JWT" | jq
# Expected: 200 with auth.anonKey, auth.serviceRoleKey, auth.publishableKey, auth.secretKey all populated
```

Also open Studio → Project Settings → API Keys: the Publishable and Secret
key sections must render the new keys (secret masked, reveal button works via
the `:id` route).

See memory note `gotcha_dev_stack_local_boot` for first-boot caveats when
bringing up the stack to run this.

## Symptom

In the trex-hosted Supabase Studio, deploying the default **hello-world** edge
function succeeds, but invoking it (Studio's "Test" panel, or any client using a
trex-issued key) returns:

```
401  {"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}
```

The failure is **not** the gateway's JWT gate — that passes. The 401 comes from
the function body.

## Root cause

Two different auth models are in play, and they don't match.

### 1. The gateway (trex) — legacy JWT, works

`core/server/index.ts` gates every invoke on `verify_jwt` and validates the
`Authorization: Bearer <token>` with `verifyAccessToken()`
(`core/server/auth/jwt.ts`), which HMAC-verifies the token against the
HKDF-derived JWT secret (`getJwtSecret()` → `deriveSubkeyBase64(LABELS.jwtHs256)`).

A trex-issued **legacy** anon/service key (a JWT, `eyJ…`) passes this check — the
function worker boots (`event_type: "Boot"`). So the gateway is fine.

trex also injects the legacy keys into the function's environment
(`core/server/index.ts:1284`):

```ts
["SUPABASE_ANON_KEY", authKeys.anonKey],
["SUPABASE_SERVICE_ROLE_KEY", authKeys.serviceRoleKey],
```

(Stale keys are already handled: `index.ts:1266` purges and re-issues
`auth.{anonKey,serviceRoleKey,jwtSecret}` if the stored keys don't match the
current JWT-secret derivation.)

### 2. The default template — new Supabase key model, rejects legacy keys

The stock hello-world template deployed by Studio uses the **new** Supabase auth
wrapper:

```ts
import { withSupabase } from "jsr:@supabase/server@^1";

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    // ctx.authType === "secret" | "publishable"
    ...
  }),
};
```

`withSupabase({ auth: ["publishable", "secret"] })` expects the caller to present
one of the **new-format API keys** — a *publishable* key (`sb_publishable_…`) or a
*secret* key (`sb_secret_…`). trex neither issues those keys nor injects them into
the function env. When the caller sends a legacy JWT anon key, `withSupabase`
finds no valid publishable/secret credential and returns `INVALID_CREDENTIALS`.

So: **gateway `verify_jwt` (legacy JWT) passes → function boots → `withSupabase`
(new publishable/secret keys) rejects the same legacy key.**

## Reproduction

```sh
# From inside the studio sidecar, using the real trex anon key:
ANON=$(node /app/apps/studio/fetch-trex-keys.cjs | grep '^SUPABASE_ANON_KEY=' | cut -d= -f2-)
node -e "fetch('http://alp-trex.alp.local:33001/trex/functions/v1/hello-world',{
  method:'POST',
  headers:{authorization:'Bearer '+process.env.ANON,'content-type':'application/json','accept-encoding':'identity'},
  body:'{\"name\":\"x\"}'
}).then(r=>r.text().then(t=>console.log(r.status,t)))"
# -> 401 {"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}
# trex log shows the worker DID boot (event_type: "Boot"), i.e. verify_jwt passed.
```

A plain function (no `withSupabase`) invoked with the same legacy anon key returns
`200` — confirming the gateway and key are fine and the mismatch is entirely in
the template's `withSupabase` wrapper.

## Workarounds (no trex change)

Write functions that don't use the new-key wrapper. The gateway has already
validated the JWT by the time the body runs.

```ts
// Plain handler — works with trex's legacy anon key today.
Deno.serve(async (req) => {
  const { name } = await req.json().catch(() => ({ name: "world" }));
  return Response.json({ message: `Hello ${name}!` });
});
```

If a function needs the caller identity, read the already-validated JWT directly
from `Authorization` instead of `withSupabase`. To skip the gateway gate entirely
for local testing, deploy with `verify_jwt: false` (function metadata) plus a
plain handler.

## Proper fix (trex-side) — options

1. **Issue and inject new-format keys.** Have trex mint `sb_publishable_…` /
   `sb_secret_…` keys and inject them into the function env under the names
   `@supabase/server` reads (alongside the existing `SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` at `core/server/index.ts:1284`). Viability depends
   on whether `withSupabase` validates by key **format** (must literally start
   with `sb_publishable_`/`sb_secret_` → requires real new-format keys) or by env
   **equality** (compares the header to an env value → a small injection patch
   suffices). This needs reading the `jsr:@supabase/server@^1` source to confirm.

2. **Ship a legacy-auth default template.** Replace the Studio-generated
   hello-world with a plain-handler template (as above) so the out-of-the-box
   experience works on trex's legacy-JWT auth.

3. **Adopt the new Supabase key model end-to-end** — the larger change: trex
   issues publishable/secret keys, Studio surfaces them, and the gateway accepts
   them. Only worth it if trex intends to track Supabase's new API-key system.

## Files referenced

- `core/server/index.ts` — invoke handler, `verify_jwt` gate (~line 1052), and
  the Supabase env injection for functions (~line 1284; stale-key purge ~1266).
- `core/server/auth/jwt.ts` — `verifyAccessToken()` (line 134), `getJwtSecret()`
  (line 67), `generateAnonKey()` (line 174).
- Deployed function: `/app/edge-functions/hello-world/index.ts` (the
  `withSupabase(...)` template).
