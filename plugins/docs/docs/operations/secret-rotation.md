---
sidebar_position: 1
---

# Secret Rotation

## Architecture

trex uses a single operator-managed root key, `TREX_ROOT_KEY` (32 random
bytes, base64). Every per-purpose secret is derived from it via HKDF-SHA256
with a hardcoded salt (`"trex/v1"`) and a distinct `info` label per purpose:

| Subkey label                  | Used by                                      |
|-------------------------------|----------------------------------------------|
| `trex.better-auth.session.v1` | Better Auth session signing                  |
| `trex.jwt.hs256.v1`           | All HS256 JWTs (access tokens, anon, service) — also exported as `PGRST_JWT_SECRET` (consumed by the in-process `@trex/postgrest` REST plugin and the storage plugin), Studio (`AUTH_JWT_SECRET`), and Realtime (`API_JWT_SECRET` / `METRICS_JWT_SECRET`) so they can verify trex-issued tokens |
| `trex.pgmeta.aes.v1`          | Studio / pg-meta `PG_META_CRYPTO_KEY`        |
| `trex.realtime.internal.v1`   | Realtime-internal material: first 16 chars feed `DB_ENC_KEY` (AES-128), concatenated with the `dek.wrap` subkey to form Realtime's 64-char `SECRET_KEY_BASE` |
| `trex.dek.wrap.v1`            | KEK that wraps the Data Encryption Key (also contributes entropy to Realtime's `SECRET_KEY_BASE`) |
| `trex.devx.token.aes.v1`      | devx integration-token crypto: feeds `DEVX_ENCRYPTION_KEY`, the AES-256-GCM key encrypting stored devx integration tokens (e.g. GitHub) |

Data at rest (`trexdb.secret`, `trexdb.database_credential.password_encrypted`)
is encrypted with a random 32-byte DEK that is itself wrapped under the
`trex.dek.wrap.v1` KEK and stored in `trexdb.kek_wrapped_dek`. This decouples
JWT-key rotation from re-encryption of stored secrets.

## Distribution

The `trex-init` compose service (one-shot, runs before everything else):

1. Generates `TREX_ROOT_KEY` into `./secrets/root.env` if the file is
   missing; otherwise reuses the existing value.
2. Derives all per-service env vars into `./secrets/derived.env` using
   exactly the names each downstream container expects
   (`PGRST_JWT_SECRET`, `PG_META_CRYPTO_KEY`, `AUTH_JWT_SECRET`,
   `API_JWT_SECRET`, `METRICS_JWT_SECRET`, `SECRET_KEY_BASE`,
   `DB_ENC_KEY`, `DEVX_ENCRYPTION_KEY`).

Every other container consumes those files via `env_file:` with
`required: false` and `depends_on: trex-init` (`condition:
service_completed_successfully`).

## Rotating the JWT signing key (cheap)

This is the most common rotation. It invalidates every JWT issued under
the old key but does NOT require re-encrypting stored secrets.

1. Edit `core/server/auth/keys.ts`, change `jwtHs256: "trex.jwt.hs256.v1"`
   to `jwtHs256: "trex.jwt.hs256.v2"`.
2. Rebuild the runtime image (or otherwise redeploy the modified source)
   so the new `LABELS.jwtHs256` value is picked up by both `core/server`
   AND `scripts/derive-secrets.ts` running in the `trex-init` sidecar.
3. Delete `./secrets/derived.env` (or `docker compose run --rm trex-init`)
   so the `trex-init` one-shot regenerates the derived file with the new
   `PGRST_JWT_SECRET` / `AUTH_JWT_SECRET` / `API_JWT_SECRET` /
   `METRICS_JWT_SECRET`. The `root.env` is preserved — only the derived
   subkeys change.
4. Restart every service that reads `derived.env` (the trex server —
   whose in-process `@trex/postgrest` and storage plugins consume
   `PGRST_JWT_SECRET` — plus studio, pg-meta, and realtime) so
   they pick up the new value. Skipping this step leaves them verifying
   with the old key, and every trex-issued JWT will be rejected by them
   until restart.
5. On the next core boot, the `index.ts` boot probe detects the stored
   `auth.jwtSecret` no longer matches the derived value and purges the
   three rows from `trexdb.setting`. `ensureAuthKeys` then re-issues
   `anon` and `service_role` keys signed with the new derivation.
6. All clients using the previous anon/service_role keys must be
   updated to the new values (visible via the admin API or in the
   `[auth] Anon key: ...` / `[auth] Service role key: ...` log lines).

## Rotating individual API keys (no JWT-secret rotation needed)

Unlike the JWT-signing-key rotation above, these mutations replace a single
key in place without touching the signing key or forcing a stack restart.
All are exposed as GraphQL mutations (admin-only):

| Mutation                 | Replaces                                            |
|---------------------------|-----------------------------------------------------|
| `rotateAnonKey`            | The legacy `anon` JWT (`trexdb.setting.auth.anonKey`) |
| `rotateServiceRoleKey`     | The legacy `service_role` JWT (`auth.serviceRoleKey`) |
| `rotatePublishableKey`     | The `sb_publishable_…` key (`auth.publishableKey`)  |
| `rotateSecretKey`          | The `sb_secret_…` key (`auth.secretKey`)            |

For all four: the prior key is invalidated the instant the new one is
persisted — any client still presenting the old value is rejected on its
next request.

- `rotateAnonKey` / `rotateServiceRoleKey` also invalidate the in-process
  memoized legacy-key cache (`invalidateAuthKeysCache`), so the PostgREST and
  storage proxies — which read the anon/service_role JWTs to authenticate
  their own upstream calls — never forward a stale JWT after rotation.
- `rotatePublishableKey` / `rotateSecretKey` mint a fresh random key
  (`sb_publishable_…` / `sb_secret_…`, not derived from the JWT signing key)
  and overwrite the stored `{id, key, inserted_at}` row. They are resolved by
  timing-safe equality against the stored value, so rotation takes effect for
  the gateway, `authContext`, and realtime immediately.

In both cases, **function workers do not see the new value until the server
restarts** — worker env vars (`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`
and `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`) are set once at boot.
Restart the server after rotating any of these four keys if edge functions
need to pick up the new value.

trex currently manages a single default publishable/secret key pair (no
named multi-key support); the Management API's `POST`/`PATCH`/`DELETE`
`/v1/projects/:ref/api-keys` routes return `501` and point callers at these
rotate mutations instead.

## Rotating the DEK (re-encrypts `trexdb.secret`)

Out of scope for the v1 implementation. The schema supports multiple
versioned rows in `trexdb.kek_wrapped_dek` (see `V1__initial_schema.sql`);
the rewrap tooling is a planned follow-up.

## Rotating the root key (re-wraps everything)

Out of scope for the v1 implementation. Doing this naively today would
invalidate the wrapped DEK and lose every encrypted secret. A safe
rotation procedure requires a sidecar that decrypts each wrap with the
old KEK and re-wraps it with the new KEK before the root is replaced —
also planned as a follow-up.

Until that tooling lands, treat `TREX_ROOT_KEY` as a long-lived secret
and rotate by:

1. Stopping all services.
2. Backing up `./secrets/root.env`.
3. Backing up `trexdb.secret` and `trexdb.database_credential` plaintext
   exports (the hard-cut consequence: anything not exported will be
   permanently lost when the root changes).
4. Deleting `./secrets/`, bringing the stack back up — operators must
   then re-enter every edge-function secret and every database
   credential by hand.

## Deprecated environment variables

The following operator-set variables are no longer read. Setting them
has no effect:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_SECRETS`
- `AUTH_JWT_SECRET`
- `PGRST_JWT_SECRET` (now derived; the env_file value wins over any operator-set value)
- `PG_META_CRYPTO_KEY`
- `API_JWT_SECRET`
- `METRICS_JWT_SECRET`
- `REALTIME_SECRET_KEY_BASE`
- `REALTIME_DB_ENC_KEY`
- `TREX_PRODUCTION_MODE`

The entrypoint no longer rotates "known-default placeholders" at
startup — the trex-init container makes that mechanism unnecessary.
