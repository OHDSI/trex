-- Add 'implemented' status to plans
ALTER TABLE devx.plans DROP CONSTRAINT IF EXISTS plans_status_check;
ALTER TABLE devx.plans ADD CONSTRAINT plans_status_check
    CHECK (status IN ('draft', 'accepted', 'rejected', 'implemented'));
