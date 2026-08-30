-- A review that found nothing because its tools were REFUSED is not a review
-- that found nothing. Phase 3 moved reviews onto eve, where they run as
-- unattended sessions with no approver, so eve's hard escalate tier (git push,
-- psql, ExecuteSQL, ...) denies outright. That outcome reached only the live
-- SSE stream; the stored row was byte-identical to a clean review. Persist it
-- next to the findings so the Problems tab can say so on reload too.
ALTER TABLE devx.agent_results
    ADD COLUMN IF NOT EXISTS denials JSONB NOT NULL DEFAULT '[]'::jsonb;
