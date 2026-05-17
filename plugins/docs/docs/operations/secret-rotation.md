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
| `trex.jwt.hs256.v1`           | All HS256 JWTs (access tokens, anon, service)|
| `trex.pgrest.jwt.v1`          | PostgREST `PGRST_JWT_SECRET` + Studio `AUTH_JWT_SECRET` |
| `trex.pgmeta.aes.v1`          | Studio `PG_META_CRYPTO_KEY`                  |
| `trex.realtime.api.v1`        | Realtime `API_JWT_SECRET` / `METRICS_JWT_SECRET` / `DB_ENC_KEY` / `SECRET_KEY_BASE` |
| `trex.dek.wrap.v1`            | KEK that wraps the Data Encryption Key       |

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
   `DB_ENC_KEY`).

Every other container consumes those files via `env_file:` with
`required: false` and `depends_on: trex-init` (`condition:
service_completed_successfully`).

## Rotating the JWT signing key (cheap)

This is the most common rotation. It invalidates every JWT issued under
the old key but does NOT require re-encrypting stored secrets.

1. Edit `core/server/auth/keys.ts`, change `jwtHs256: "trex.jwt.hs256.v1"`
   to `jwtHs256: "trex.jwt.hs256.v2"`.
2. Deploy.
3. On the next boot, the `index.ts` boot probe detects the stored
   `auth.jwtSecret` no longer matches the derived value and purges the
   three rows from `trexdb.setting`. `ensureAuthKeys` then re-issues
   `anon` and `service_role` keys signed with the new derivation.
4. All clients using the previous anon/service_role keys must be
   updated to the new values (visible via the admin API or in the
   `[auth] Anon key: ...` / `[auth] Service role key: ...` log lines).

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
