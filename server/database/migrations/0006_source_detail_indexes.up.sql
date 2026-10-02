-- 0006_source_detail_indexes.up.sql
-- Indexes for the user-facing source detail page and admin single-source sync.
-- All additive, idempotent; no data changes.
--
--   * papers(journal_id)      : strict source detail paper list (WHERE journal_id = ?)
--                               plus its published-date ordering / pagination.
--   * source_sync_runs(source_id, status) : admin running-protection lookup
--                               (is there a running run for this source?) and the
--                               latest-terminal-run lookup on the source header.

CREATE INDEX IF NOT EXISTS papers_journal_idx ON papers (journal_id);

CREATE INDEX IF NOT EXISTS source_sync_runs_source_status_idx
  ON source_sync_runs (source_id, status);
