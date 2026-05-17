-- Add tool_calls column to messages table for persisting agent tool call history.
-- The code in index.ts already saves/reads this column but it was missing from the schema.
ALTER TABLE devx.messages ADD COLUMN IF NOT EXISTS tool_calls JSONB DEFAULT NULL;
