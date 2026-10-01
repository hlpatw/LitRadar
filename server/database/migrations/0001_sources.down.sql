-- 0001_sources.down.sql
-- Reverse 0001. Drops the Phase-1 additions; legacy journals/papers/users data untouched.

DROP INDEX IF EXISTS source_sync_runs_source_idx;
DROP TABLE IF EXISTS source_sync_runs;

DROP INDEX IF EXISTS source_aliases_source_name_ux;
DROP TABLE IF EXISTS source_aliases;

DROP INDEX IF EXISTS papers_doi_unique;

ALTER TABLE papers DROP COLUMN IF EXISTS source_run_id;

ALTER TABLE journals DROP COLUMN IF EXISTS last_synced_at;
ALTER TABLE journals DROP COLUMN IF EXISTS external_id;
ALTER TABLE journals DROP COLUMN IF EXISTS poll_policy;
ALTER TABLE journals DROP COLUMN IF EXISTS connector_type;
ALTER TABLE journals DROP COLUMN IF EXISTS status;
ALTER TABLE journals DROP COLUMN IF EXISTS parent_id;
