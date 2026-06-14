# D2E Security & Operations

> Distilled from d2e-docs part 4 (security & operations), 2026-06-14. See `00-overview` for context.

## Authentication
**Identity provider: Logto** (OIDC/OAuth 2.0). Backend server = Trex.
- **Users:** OAuth 2.0 Authorization Code flow. Frontend posts the code to Trex `/oauth/token`; Trex adds the client secret (server-only) and exchanges at Logto. Returns access token (JWT), ID token, refresh token. **Refresh tokens: 14-day TTL with rotation** (each use invalidates the prior). Login via Logto username/password or federated **Microsoft Entra ID** (Azure AD).
- **M2M (Client Credentials):** two registered apps — `alp-svc` (general service ops) and `alp-data` (clinical data R/W) — separated for independent audit/revoke; both request scope `https://alp-default` (the API audience). Prefect workers and FHIR gateway use M2M.

## Token Validation (authn middleware)
Public-bypass list first (health, OAuth callback, OIDC discovery, public listings — operator-extensible regex). Token from `Authorization: Bearer`, falling back to `authtoken`/`fhirtoken` cookies (needed for WebSocket/Shiny/FHIR which can't carry custom headers). **JWKS** keys fetched from Logto, cached, periodically refreshed (auto key-rotation, no redeploy). Verifies signature/expiry/audience/issuer; failure → 401.

## Authorization (authz middleware) — RBAC
Two config objects from plugin manifests: **`REQUIRED_URL_SCOPES`** (URL regex + methods → required scopes; first-match wins, **no match → 404**, no default-allow) and the **role→scopes map**. Authorization succeeds only if the user's scopes include **every** required scope. Entra/M2M roles come from JWT claims; regular Logto users → middleware calls UserMgmtAPI for group/role/tenant/dataset data. **Dataset-level enforcement:** for study-partitioned endpoints, the dataset ID is extracted via cascade (query param → JSON body → `x-dataset-id` header) and checked against the user's authorized list — prevents cross-study access on shared endpoints. Entra group→role sync runs each login via Microsoft Graph API; auto-provisioning on first sign-in.

## Security Architecture (five trust boundaries)
1. **Browser → Caddy:** public TLS termination (ACME or operator certs); no plaintext HTTP.
2. **Caddy → Trex:** Caddy runs its **own internal CA** (root + intermediate generated at startup), issues per-service certs on domain `alp.local`; CA material distributed via the `x-tls` env group (mTLS).
3. **Trex → workers:** NOT a network boundary — functions are Deno/V8 isolates inside Trex (no socket/serialization); V8 sandboxing + per-isolate CPU/memory accounting.
4. **Trex → external services:** each external (Prefect, Logto, Supabase) has its own M2M client ID/secret (compartmentalized blast radius).
5. **Functions → databases:** functions never see raw passwords — they request a ready connection from Trex's credential manager.

## Credential Encryption
DB credentials encrypted at rest in PostgreSQL with **RSA-OAEP/SHA-256**; **private key held exclusively by Trex**. The credential manager is a startup singleton that decrypts all records into memory for pooling; on update it re-decrypts and refreshes both the in-memory cache and the **Prefect secret block document** (so flow containers outside Trex can fetch creds via the Prefect API after M2M auth — a two-hop trust chain). **Per-study isolation:** each dataset → a database code → its own credential entry; no global cross-dataset pool. **HANA quirk:** schema names auto-uppercased.

## Other Mechanisms
Portal config `[REDACTED]` round-trip protocol (writing the placeholder preserves the stored secret). Audit logging on patient-list/summary/export ops (batched in 10s; tags each accessed attribute with config ID + version). Request correlation via `x-req-correlation-id` (UUID v4). Centralized error handler returns only a log GUID + type + localized message. Input validation: prototype-pollution rejection, alphanumeric identifier validation, 50 MB body cap. Compliance drivers: HIPAA, GDPR, GxP, IRB. Failure shapes: 401 = identity-side; 403 = authz-side; credential-decryption failure = RSA keypair mismatch.

## Deployment
**Docker Compose** topology, no cloud lock-in. Core always-on containers: Trex, PostgreSQL, Logto, Caddy, Redis, Supabase Storage, Prefect server + worker, Enterprise Gateway. Optional via profiles: DICOM, OHDSI Atlas. **Strict startup chain:** PostgreSQL → Logto → Trex → Prefect, with two one-shot init containers (DB-management init creates schemas/users; Logto post-init registers clients/resources/roles/Entra connector). **Plugin init functions** run once at Trex startup (schema creation, seed, flow registration, bucket creation), transactional with rollback. Persistent state lives in named Docker volumes — **backups are the operator's responsibility**; container filesystems don't survive restart. Compose YAML anchors define shared env groups. Risk surfaces: bootstrap, runtime upgrade, rollback coordination across independently-versioned plugins.

## CLI
Wraps Docker Compose; goal is fresh-checkout-to-running in two commands. Five verbs: **`init`** (generates the env file incl. the RSA keypair anchoring credential encryption), **`start`** (dependency-ordered up), **`stop`**, **`clean`** (removes volumes; interactive confirmation guard), **`build`**. Rationale: a runbook would drift as plugins add env vars/migrations; the CLI codifies setup in code exercised on every deploy.

## Testing (four layers)
- **Unit** — Jest + NestJS testing module (DI mock substitution); full suite <1 minute; no external services.
- **Integration** — Mocha + Chai against real HTTP/DB/auth; **does NOT bypass auth** — performs a full OIDC code exchange and uses the bearer token. Heavy setup (test DBs, all services healthy, OIDC, seed data). 401/403 = authz regression / Logto drift; 500 = serialization/schema drift.
- **E2E** — Playwright/Chromium, **single-worker sequential** (clinical-data side effects would race in parallel); four diagnostic channels per failure (screenshot, video, network HAR, console); Docker volume snapshots make re-runs fast and double as a known-good rollback artifact.
- **Performance** — HAR replay in cached vs non-cached modes (non-cached exposes query regressions the TrexSQL cache would mask); records response + per-query DB times. Run at release validation. Regression only in non-cached = SQL/index problem; in both = heavier change/degraded dependency.
