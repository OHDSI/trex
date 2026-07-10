-- H3 (ToolContext.emit — custom tool events, task-h3-brief.md): widen
-- agents.steps.kind to allow 'custom', the kind runner.ts's toolEmit
-- persists a ToolContext.emit(name, data) call as (see
-- core/server/agents/service/runner.ts, eve-shim/types.ts's
-- ToolContext.emit, handler.ts's stepToEvent 'custom' -> tool.event case).
--
-- Postgres CHECK constraints cannot be altered in place — drop + re-add
-- with the widened list. V1__agents_init.sql's inline CHECK on
-- agents.steps.kind got Postgres's default table-local constraint name,
-- `steps_kind_check` (no schema prefix), verified live against a real
-- `agents.steps` table (`\d agents.steps` against `toy-agent-pg`,
-- localhost:15544, 2026-07-04). `agents_steps_kind_check` is dropped too,
-- defensively, in case some other environment's constraint got a
-- schema-qualified name some other way; both drops are IF EXISTS so neither
-- can fail this migration regardless of which name (or neither) exists.
ALTER TABLE agents.steps DROP CONSTRAINT IF EXISTS steps_kind_check;
ALTER TABLE agents.steps DROP CONSTRAINT IF EXISTS agents_steps_kind_check;

ALTER TABLE agents.steps ADD CONSTRAINT steps_kind_check
    CHECK (kind IN ('model', 'text', 'tool-call', 'tool-result', 'client-tool-call', 'approval-request', 'error', 'finish', 'custom'));
