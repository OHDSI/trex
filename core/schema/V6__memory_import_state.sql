-- Change-tracking for the `memory` plugin type's boot/refresh importer
-- (core/server/memory/refresh.ts, Task 12). Tracks the last-imported
-- version per (memory, source) so provisionAndImport/startRefreshLoop can
-- skip re-materializing + re-importing a source whose content hasn't
-- changed. Lives trex-side (not inside gbrain) so it's queryable and
-- independent of gbrain internals — see project_memory_plugin_type design.
CREATE TABLE IF NOT EXISTS trexdb.memory_import_state (
  memory      text NOT NULL,
  source      text NOT NULL,
  version     text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (memory, source)
);

-- Internal import bookkeeping, not user-facing data: PostGraphile introspects
-- every table in trexdb, and V3__graphql_trexdb_grants.sql's ALTER DEFAULT
-- PRIVILEGES grants SELECT/INSERT/UPDATE/DELETE on ALL (including future)
-- trexdb tables to `authenticated`. Without this REVOKE, any authenticated
-- JWT could read or mutate memory import state via GraphQL. Mirrors V3's
-- defence-in-depth REVOKE block for other internal/secret-bearing tables
-- (trexdb.setting, trexdb.event_log, etc.) — V3 only revokes those from
-- `authenticated` (anon never has table grants to begin with; it only gets
-- schema USAGE), so this matches that scope exactly.
REVOKE ALL ON trexdb.memory_import_state FROM authenticated;
