-- Liveness signal for a running turn.
--
-- A turn only ever left `running` because the code that started it also
-- finished it. When the worker died mid-turn — a crash, a redeploy, or the
-- runtime dropping the worker (`reason: "EarlyDrop"`, observed at exactly half
-- of workerTimeoutMs) — finishTurn never ran and nothing else knew, so the row
-- sat `running` and queued every later message on that session behind it until
-- the started_at-based sweep gave up on it two hours later.
--
-- While a turn runs, its worker stamps this column every few seconds. A stale
-- stamp is positive evidence the worker is gone, which the reap can act on in
-- minutes instead of hours.
--
-- NULL means "no heartbeat seen": rows written before this migration, and any
-- future writer that does not stamp. Those keep falling back to the
-- started_at cutoff, so the reap never gets MORE aggressive than it was.
ALTER TABLE agents.turns ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

-- The sweep and the lazy reap both scan for running turns with an expired
-- heartbeat; without this they scan the whole table on every tick.
CREATE INDEX IF NOT EXISTS idx_agents_turns_running_heartbeat
    ON agents.turns (heartbeat_at)
    WHERE status = 'running';
