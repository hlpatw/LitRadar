-- 0008_radar_events_scheduler.down.sql
-- Reverse of 0008_radar_events_scheduler.up.sql.
--
-- SAFETY: user_notes.tags was added this round, but we DO NOT drop it here. A down-run
-- must never destroy user-authored data (tags already written); the column is left in
-- place (additive, default '{}'). Only the brand-new tables and their indexes are removed.

DROP TABLE IF EXISTS scheduler_state;
DROP TABLE IF EXISTS behavior_events;
DROP TABLE IF EXISTS weekly_radar_snapshots;
-- Intentionally NOT: ALTER TABLE user_notes DROP COLUMN tags;
