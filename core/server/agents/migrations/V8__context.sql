-- Context handling (2026-08-25 design): compaction checkpoints are persisted as
-- an agents.steps row so a replay and a live tail stay identical, and deferred
-- tool activation is session-scoped because devx workers are not sticky.
--
-- Postgres CHECK constraints cannot be altered in place. V1__agents_init.sql's
-- inline CHECK got the default table-local name `steps_kind_check`; both that
-- and a hypothetically schema-qualified `agents_steps_kind_check` are dropped
-- IF EXISTS, matching V2__custom_steps.sql.
ALTER TABLE agents.steps DROP CONSTRAINT IF EXISTS steps_kind_check;
ALTER TABLE agents.steps DROP CONSTRAINT IF EXISTS agents_steps_kind_check;

ALTER TABLE agents.steps ADD CONSTRAINT steps_kind_check
    CHECK (kind IN ('model', 'text', 'tool-call', 'tool-result', 'client-tool-call',
                    'approval-request', 'error', 'finish', 'custom', 'compaction'));

ALTER TABLE agents.sessions ADD COLUMN IF NOT EXISTS activated_tools TEXT[];
