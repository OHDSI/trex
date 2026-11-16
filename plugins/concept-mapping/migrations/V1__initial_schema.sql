-- plugins/concept-mapping/migrations/V1__initial_schema.sql
-- One row per mapping run (one uploaded CSV) and one row per source term, so
-- a large input can be mapped over several turns and resumed.
CREATE TABLE IF NOT EXISTS concept_mapping.runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  TEXT NOT NULL,
    created_by  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runs_session_idx ON concept_mapping.runs (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS concept_mapping.run_rows (
    run_id                  UUID NOT NULL REFERENCES concept_mapping.runs (id) ON DELETE CASCADE,
    row_index               INTEGER NOT NULL,
    source_data_identifier  TEXT NOT NULL,
    source_code             TEXT NOT NULL,
    original_source_name    TEXT NOT NULL,
    source_name             TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'unmapped')),
    result                  JSONB,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, row_index)
);

-- Coding-system briefing per institution (phase 1), reused by every row.
CREATE TABLE IF NOT EXISTS concept_mapping.coding_systems (
    run_id                  UUID NOT NULL REFERENCES concept_mapping.runs (id) ON DELETE CASCADE,
    source_data_identifier  TEXT NOT NULL,
    briefing                JSONB NOT NULL,
    PRIMARY KEY (run_id, source_data_identifier)
);
