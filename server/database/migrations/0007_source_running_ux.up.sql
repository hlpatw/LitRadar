-- 0007_source_running_ux.up.sql
-- Atomic per-source running guard: at most one 'running' sync run per source.
-- The application also takes a pg advisory xact lock around check+insert; this partial
-- unique index is the DB-level backstop that makes a race lose deterministically.

CREATE UNIQUE INDEX IF NOT EXISTS source_sync_running_ux
  ON source_sync_runs (source_id)
  WHERE status = 'running';
