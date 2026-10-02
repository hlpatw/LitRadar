-- 0008_radar_events_scheduler.up.sql
-- Weekly research radar (deterministic snapshots), user-scoped idempotent behavior
-- events, and staging-only scheduler bookkeeping. All additive / reversible.

-- ── Notes: user-defined tags on a note (free-form, comma-free array) ──────────
ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- ── Weekly radar snapshots ───────────────────────────────────────────────────
-- One row per ISO week (Monday 00:00). The frozen Top10 + aggregates are snapshotted
-- once per week so the Dashboard shows a STABLE, explainable list for that week
-- regardless of later corpus changes. Re-running for the same week is a no-op
-- (deterministic snapshot); previous weeks are never rewritten.
CREATE TABLE IF NOT EXISTS weekly_radar_snapshots (
  week_start            date PRIMARY KEY,                 -- ISO Monday
  new_paper_count       integer NOT NULL DEFAULT 0,       -- papers first ingested this week
  top10                 jsonb NOT NULL DEFAULT '[]'::jsonb, -- frozen ranked list
  source_distribution   jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{source,count}]
  keyword_hits          jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{keyword,count}]
  generated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Behavior events (user-scoped, idempotent; NO note text content) ──────────
-- An append-only analytics log of lightweight user intents on radar/paper cards.
-- Idempotency: (user_id, event_type, idempotency_key) is UNIQUE, so a retried
-- click (same key) does not double-count. We deliberately never store note body
-- text here — only the fact that a note was attached.
CREATE TABLE IF NOT EXISTS behavior_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          varchar(100) NOT NULL,
  paper_id         uuid,
  event_type       varchar(30)  NOT NULL,   -- impression|detail|library|todo|favorite|uninterested|note
  idempotency_key  varchar(200) NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS behavior_events_dedupe_ux
  ON behavior_events (user_id, event_type, idempotency_key);
CREATE INDEX IF NOT EXISTS behavior_events_user_idx
  ON behavior_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS behavior_events_type_idx
  ON behavior_events (event_type, created_at DESC);

-- ── Scheduler bookkeeping (singleton row, id=1) ─────────────────────────────
-- Staging-only low-frequency poller. paused flips manual control; next_run_at drives
-- the next tick; an advisory lock (pg_advisory_try_lock) around the tick is the
-- cross-process gate, with this row as the visible/UI-observable state.
CREATE TABLE IF NOT EXISTS scheduler_state (
  id            integer PRIMARY KEY CHECK (id = 1),
  paused        boolean NOT NULL DEFAULT false,
  last_run_at   timestamptz,
  next_run_at   timestamptz,
  run_count     integer NOT NULL DEFAULT 0,
  last_message  text
);

INSERT INTO scheduler_state (id, paused, run_count)
VALUES (1, false, 0)
ON CONFLICT (id) DO NOTHING;
