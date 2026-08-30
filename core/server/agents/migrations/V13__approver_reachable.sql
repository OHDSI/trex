-- "Someone can be shown a gate and click it" — modelled separately from
-- channel binding, which the hard escalate tier used to stand in for. That
-- proxy was wrong for a relayed session (claw's coder is a plain native
-- session that claw watches and answers gates for), so the hard tier denied
-- it as unapprovable and a human-approved push became impossible.
--
-- DEFAULT false, like `unattended` (V11): absent must mean "no approver", so
-- every session that predates this column keeps the behaviour it had.
ALTER TABLE agents.sessions
    ADD COLUMN IF NOT EXISTS approver_reachable BOOLEAN NOT NULL DEFAULT false;
