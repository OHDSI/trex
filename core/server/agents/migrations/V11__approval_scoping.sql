-- P3: a consent keyed on (user, plugin, agent, tool) alone means one "always" on
-- Bash grants every future shell command forever. scope_key narrows it to the
-- action — the executable for Bash, the path for file tools, '' for the rest.
ALTER TABLE agents.tool_consents
    ADD COLUMN IF NOT EXISTS scope_key TEXT NOT NULL DEFAULT '';

-- The DELETE lives INSIDE the guard, not before it: run unguarded it would wipe
-- every `always` consent accumulated since the first apply, every time this
-- migration is re-run. The 4-column PK is the "has not run yet" witness.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'agents.tool_consents'::regclass
      AND contype = 'p' AND array_length(conkey, 1) = 5
  ) THEN
    -- Over-broad "always" rows ARE the defect; carrying them forward would ship
    -- the bug under a new column. "never" is over-broad in the safe direction.
    DELETE FROM agents.tool_consents WHERE consent = 'always';

    ALTER TABLE agents.tool_consents DROP CONSTRAINT IF EXISTS tool_consents_pkey;
    ALTER TABLE agents.tool_consents
        ADD PRIMARY KEY (user_id, plugin, agent, tool, scope_key);
  END IF;
END $$;

-- Written when the request is created so the resolve path never re-derives it:
-- derive-at-gate and derive-at-resolve could otherwise drift after any change to
-- deriveScopeKey, silently writing a consent row that never matches.
ALTER TABLE agents.approvals
    ADD COLUMN IF NOT EXISTS scope_key TEXT NOT NULL DEFAULT '';

-- Set at session creation only, never from per-turn request metadata: a truthy
-- value arriving mid-session must never widen an approval gate.
ALTER TABLE agents.sessions
    ADD COLUMN IF NOT EXISTS unattended BOOLEAN NOT NULL DEFAULT false;
