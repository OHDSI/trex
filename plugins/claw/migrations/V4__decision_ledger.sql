-- plugins/claw/migrations/V4__decision_ledger.sql
-- Settled decisions for a task, so a hand-off carries what the channel already
-- agreed instead of re-opening it. Append-only; a reversal is a new row.
ALTER TABLE claw.orchestrations
  ADD COLUMN IF NOT EXISTS decisions jsonb NOT NULL DEFAULT '[]'::jsonb;
