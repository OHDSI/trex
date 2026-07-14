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
