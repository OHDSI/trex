-- P7a: the set of workspace paths a turn's file tools touched, so a turn-scoped
-- diff can be produced by scoping `git diff` to them rather than re-reading the
-- tree. Bash writes are deliberately not tracked — they are not statically
-- knowable, and inferring them would cost the filesystem walk this avoids.
ALTER TABLE agents.turns
    ADD COLUMN IF NOT EXISTS touched_paths TEXT[] NOT NULL DEFAULT '{}';
