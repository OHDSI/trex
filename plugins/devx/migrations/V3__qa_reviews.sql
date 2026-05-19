-- QA test reviews (functional testing via Playwright)
CREATE TABLE IF NOT EXISTS devx.qa_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES devx.apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    findings JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Design reviews (visual/screenshot-based review via Playwright)
CREATE TABLE IF NOT EXISTS devx.design_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES devx.apps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    findings JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
