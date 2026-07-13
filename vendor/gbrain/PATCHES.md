# Vendored gbrain patches

Upstream: https://github.com/garrytan/gbrain.git @ 5008b28 (v0.42.59.0)

These patches make gbrain multi-tenant (schema-per-brain in one Postgres DB).
Re-apply each on upgrade. Never edit `src/core/schema-embedded.ts` (generated)
or `src/core/migrate.ts` migration bodies (checksum-verified).

## P1 — schema-safe triggers (src/schema.sql)
`bump_page_generation_clock_fn` and `update_page_search_vector` had pinned
`SET search_path = pg_catalog, public` yet referenced schema-scoped objects
(`page_generation_clock_seq`, `timeline_entries`). Retemplated so the apply
layer injects the deploy schema. See Task 2.

## P2 — schema templating + schema-aware provisioning (src/core/postgres-engine.ts)
`getPostgresSchema(dims, model, schema?)`, `initSchema(schema?)`,
`provisionSchema(name)`, `withSchema(schema, fn)`. See Tasks 3, 5.

## P3 — verify follows search_path (src/core/schema-verify.ts)
Hardcoded `table_schema = 'public'` → `current_schema()`. See Task 4.

## P4 — per-request tenancy (src/mcp/dispatch.ts, src/mcp/http-transport.ts, src/core/multi-tenant.ts)
Brain name from `/memory/<name>/mcp`; `schema` threaded through DispatchOpts +
OperationContext; dispatch runs inside `withSchema`. See Tasks 5, 6.
