# D2E Architecture

> Distilled from d2e-docs part 1 (architecture), 2026-06-14. See `00-overview` for context.

## Design Principles (10 invariants)
1. **Composition over construction** — every capability arrives via a plugin manifest (`package.json`); Trex core has zero hardcoded business logic. Adding capability = declaration.
2. **The credential boundary is the platform boundary** — DB creds encrypted with an RSA keypair whose private half lives only in Trex's process, decrypted per-request, never reaching tenant code.
3. **One process, many isolates** — each function runs in its own Deno/V8 worker isolate inside the *same* Trex process; transport between them is in-process IPC, not network.
4. **Declarative over imperative** — manifests say *what*; the runtime decides *how* to wire routes, scopes, env, Prefect deployments.
5. **Layered authorization** — four independently-rejecting layers per request: token validation, scope check, role check, dataset check.
6. **Dialect-independent analytics** — the IFR→FAST→AST→SQL pipeline defers dialect decisions to the final renderer; a new backend = one new renderer.
7. **IPC internal, HTTP across boundaries.**
8. **Identity outside (Logto), authorization inside (D2E).** Dataset access is NOT encoded in OIDC scopes.
9. **Object storage canonical for files, database curated** — no file BLOBs in DB (except Files Manager large objects).
10. **The plugin manifest is the security policy** — removing a plugin removes its entire auth surface.

## System Architecture (layered)
- **Edge:** Caddy (TLS, HTTP/2, path-only dispatch) → Trex HTTPS :33000.
- **Runtime/gateway:** Trex hosts functions as Deno workers, proxies externals.
- **Persistence:** PostgreSQL, Redis, Supabase Storage.
- **Four Docker networks:** `alp` (service mesh), `data` (DB/Prefect data plane, direct DB access), `enterprise-gateway` (researcher R/W kernels), `enterprise-gateway-viewer` (read-only).

## Service Communication
- **SERVICE_ROUTES** — JSON env map of logical service name → internal URL; most entries loop back to Trex (`trex:33001`), so calls re-enter Hono and re-run authn/authz (preserving the "every call authenticated" invariant).
- **Trex IPC / fnmap** — `Trex.tokioChannel("plugin/function")` + `createRequestListener`; in-process, zero network. Preferred for perf-critical hops (e.g. analytics-svc ↔ query-gen-svc).
- **PG Wire** — port 5433 via DuckDB pgwire; SQL clients (incl. Jupyter R kernels) query cached CDW data with standard Postgres drivers.
- **`_addService()` HTTP proxy** — external services with authn/authz; `rmsrc` strips path prefix.
- `x-req-correlation-id` (UUID v4) propagates across all paths for tracing.

## Plugin Architecture
Discovery via `PLUGINS_SEED` (ordered JSON array of npm packages: d2e-functions, d2e-ui, d2e-flows, d2e-atlas, d2e-fhir-server, data-transformation-flow, hades-flow). **Cache-first**: checks a PostgreSQL plugin registry before npm install (fast restart).

**Four plugin types:** `functions` (Deno worker isolates), `ui` (static assets + nav), `flow` (Prefect deployments), `core` (Trex extensions, e.g. pgwire).

**Functions manifest — five sections:**
- `init` — one-time startup (migrations, seeding, flow registration); run sequentially; `waitfor` polls a health endpoint, `delay` pauses.
- `api` — route registrations (function-backed → Deno entrypoint + import map + env group; service-backed → proxy). Both wrapped with authn/authz; populate the `fnmap` dispatch map.
- `roles` — role → scope arrays, merged into in-memory map; created via IdP API.
- `scopes` — {regex path, required scopes, methods, optional dataset id}, appended to global `REQUIRED_URL_SCOPES`.
- `env` — per-function keys + `_shared`; bash-style substitution, recursive (max 10 iterations).

**Function isolation (`_addFunction`):** Deno worker per route; 1000 MB memory; timeouts 3 min (init) / 30 min (API); CPU soft/hard limits; env layered `_shared` → function-specific → system-injected; sloppy imports enabled (Node-style resolution); optional eszip bundle for fast cold starts. One worker cannot read another's env.

## Data-Flow Patterns
1. **Sync query path** — latency-sensitive single HTTP cycle; analytics-svc → query-gen-svc via fnmap → executes against TrexSQL cache or PostgreSQL.
2. **Async job path** — Job Plugins → Prefect deployment run → worker spawns Docker container on `data` network, bypassing Trex for direct DB access (~10x more efficient; uses admin creds the interactive layer hides). User token posted to flow-run input endpoint, deleted after 5 min. Frontend polls status.
3. **Dataset lifecycle** — schema creation → Portal registration → loading → cache creation → quality (Achilles/DQD) → embeddings → active.
4. **Cohort lifecycle** — IFR definition → bookmark → materialization (native fast path or OHDSI CohortGenerator path) → comparison/Strategus.

## Core Infrastructure & FMC
PostgreSQL uses tiered users (superuser, manager, writer, logto-specific) and one schema per service domain. **FMC** = Fundamental Modeling Concepts, the notation for the platform block diagram (rectangles = active agents/services, rounded shapes = passive data stores, arrows = channels).
