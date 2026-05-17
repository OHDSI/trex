-- Raise the default agent loop budget so longer multi-tool investigations
-- (KB lookups, codebase exploration, multi-file edits) don't hit the cap.
ALTER TABLE devx.settings ALTER COLUMN max_steps SET DEFAULT 100;
UPDATE devx.settings SET max_steps = 100 WHERE max_steps = 25;
