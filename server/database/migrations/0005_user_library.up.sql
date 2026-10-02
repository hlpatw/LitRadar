-- 0005_user_library.up.sql
-- One authoritative per-user-per-paper library model.
--
-- Goals (review-confirmed hard constraints):
--   * user_library is the ONLY per-user-per-paper association table. UNIQUE(user_id,paper_id).
--     It carries: saved/favorite flag, reading state (todo|reading|read), personal tags, added_at.
--   * user_recommendation_feedback is a SEPARATE table for negative feedback (uninterested). It
--     is deliberately NOT a library row: excluding a rejected paper must not create a "saved"
--     association. UNIQUE(user_id,paper_id,feedback_type).
--   * Backfills user_favorites + reading_checklist (paper-linked rows only) into user_library.
--     A favorite-only row + a checklist row for the same (user,paper) merge into ONE row.
--     Orphan checklist rows (paper_id IS NULL) are free-text manual entries: they are NOT paper
--     associations and are left untouched in reading_checklist.
--   * Idempotent: safe to run twice. ON CONFLICT DO NOTHING prevents duplicate library rows.
--   * Data-preserving: legacy tables user_favorites / reading_checklist / user_notes are never
--     dropped or mutated here. Notes stay a single table keyed off papers(id), untouched.
--   * Reversible: down drops only the two new tables + the rec_weights column; legacy data intact.

-- ── Authoritative per-user-per-paper library ─────────────────────────────────
CREATE TABLE IF NOT EXISTS user_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  -- saved / favorited (legacy user_favorites). A row existing at all = "in my library".
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  -- reading state. NULL = associated (e.g. favorited) but not being tracked through a list.
  -- legacy mapping: todo->todo, in_progress->reading, done->read.
  reading_state VARCHAR(20),
  -- comma-separated personal tags, mirrors the existing keywords convention.
  personal_tags TEXT,
  -- when the user first associated this paper (earliest of favorite/checklist backfill).
  added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100),
  CONSTRAINT user_library_state_chk CHECK (reading_state IS NULL OR reading_state IN ('todo','reading','read')),
  CONSTRAINT user_library_user_paper_ux UNIQUE (user_id, paper_id)
);

CREATE INDEX IF NOT EXISTS user_library_user_idx ON user_library (user_id);
CREATE INDEX IF NOT EXISTS user_library_state_idx ON user_library (user_id, reading_state);

-- ── Negative / recommendation feedback (outside the library) ────────────────
CREATE TABLE IF NOT EXISTS user_recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  -- extensible: 'uninterested' for now. Not a library association.
  feedback_type VARCHAR(30) NOT NULL DEFAULT 'uninterested',
  note TEXT,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100),
  CONSTRAINT user_reco_feedback_ux UNIQUE (user_id, paper_id, feedback_type)
);

CREATE INDEX IF NOT EXISTS user_reco_feedback_user_idx ON user_recommendation_feedback (user_id);

-- ── Per-user configurable recommendation weights (JSONB). NULL = use service defaults. ──
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS rec_weights JSONB;

-- ── Backfill: merge favorites + paper-linked checklist into user_library ─────
-- reading_checklist may hold duplicate (user_id,paper_id) rows (no legacy unique constraint);
-- aggregate it first so one paper maps to exactly one library row.
WITH cl_agg AS (
  SELECT
    user_id,
    paper_id,
    MIN(_created_at) AS created_at,
    CASE MAX(
      CASE status WHEN 'done' THEN 3 WHEN 'in_progress' THEN 2 WHEN 'todo' THEN 1 ELSE 0 END
    )
      WHEN 3 THEN 'read'
      WHEN 2 THEN 'reading'
      WHEN 1 THEN 'todo'
      ELSE NULL
    END AS reading_state
  FROM reading_checklist
  WHERE paper_id IS NOT NULL
  GROUP BY user_id, paper_id
)
INSERT INTO user_library (user_id, paper_id, is_favorite, reading_state, added_at, _created_at)
SELECT
  COALESCE(f.user_id, c.user_id) AS user_id,
  COALESCE(f.paper_id, c.paper_id) AS paper_id,
  (f.paper_id IS NOT NULL) AS is_favorite,
  c.reading_state AS reading_state,
  LEAST(f._created_at, c.created_at) AS added_at,
  LEAST(f._created_at, c.created_at) AS _created_at
FROM user_favorites f
FULL OUTER JOIN cl_agg c
  ON c.user_id = f.user_id AND c.paper_id = f.paper_id
WHERE COALESCE(f.paper_id, c.paper_id) IS NOT NULL
ON CONFLICT (user_id, paper_id) DO NOTHING;
