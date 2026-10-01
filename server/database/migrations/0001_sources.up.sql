-- 0001_sources.up.sql
-- Phase-1 source model. Backward-compatible: adds nullable/defaulted columns and two new
-- tables. Never touches legacy journal/paper UUIDs or user-linked rows. Idempotent.

ALTER TABLE journals ADD COLUMN IF NOT EXISTS parent_id UUID;
ALTER TABLE journals ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE journals ADD COLUMN IF NOT EXISTS connector_type VARCHAR(30);
ALTER TABLE journals ADD COLUMN IF NOT EXISTS poll_policy VARCHAR(20);
ALTER TABLE journals ADD COLUMN IF NOT EXISTS external_id VARCHAR(200);
ALTER TABLE journals ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE papers ADD COLUMN IF NOT EXISTS source_run_id UUID;

-- DOI natural key. Before creating the unique index, collapse any existing duplicate DOIs:
-- keep the earliest row per DOI and NULL-out later duplicates (data preserved, not deleted).
UPDATE papers
SET doi = NULL
WHERE doi IS NOT NULL AND doi <> ''
  AND id NOT IN (
    SELECT DISTINCT ON (doi) id
    FROM papers
    WHERE doi IS NOT NULL AND doi <> ''
    ORDER BY doi, _created_at ASC
  );

CREATE UNIQUE INDEX IF NOT EXISTS papers_doi_unique
  ON papers (doi)
  WHERE doi IS NOT NULL AND doi <> '';

CREATE TABLE IF NOT EXISTS source_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  alias_name VARCHAR(300) NOT NULL,
  alias_type VARCHAR(20) NOT NULL DEFAULT 'former_name',
  issn VARCHAR(50),
  note TEXT,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS source_aliases_source_name_ux
  ON source_aliases (source_id, alias_name);

CREATE TABLE IF NOT EXISTS source_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  connector_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  message TEXT
);
CREATE INDEX IF NOT EXISTS source_sync_runs_source_idx ON source_sync_runs (source_id);
