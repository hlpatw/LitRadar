-- 0005_user_library.down.sql
-- Reversible teardown of the authoritative library model.
-- Drops ONLY the objects introduced by 0005. Legacy tables (user_favorites, reading_checklist,
-- user_notes, user_settings) are preserved: on a real DB the backfilled data in user_library is
-- a derived copy, never the source of truth, so rolling back must not destroy user notes or the
-- original favorites/checklist rows.

DROP TABLE IF EXISTS user_recommendation_feedback;
DROP TABLE IF EXISTS user_library;

ALTER TABLE user_settings DROP COLUMN IF EXISTS rec_weights;
