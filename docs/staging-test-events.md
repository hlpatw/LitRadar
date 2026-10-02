# Staging test-event cleanup note

These events are written by the staged E2E / manual QA runs against the staging DB.
There is **no event-deletion API** by design; clean them directly in Postgres when needed.

## Fingerprint
- Table: `behavior_events`
- Event rows created by automated/manual QA use these idempotency-key prefixes:
  - `YYYY-MM-DD:impression:radar:<paperId>`
  - `YYYY-MM-DD:impression:digest:<paperId>`
  - `YYYY-MM-DD:detail:<paperId>`
  - `YYYY-MM-DD:library:<paperId>`
  - `YYYY-MM-DD:note:<paperId|none>`
  - `YYYY-MM-DD:favorite:<paperId>` / `:todo:` / `:uninterested:`
- E2E-created users have username/email prefix `e2e_` / `e2e_other_`.

## To clean staging QA rows later
```sql
-- remove events belonging to e2e users
DELETE FROM behavior_events
WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'e2e%' OR email LIKE 'e2e_%');

-- or by key prefix (keep real user events)
DELETE FROM behavior_events WHERE idempotency_key LIKE '%:impression:radar:%' AND ...;
```
No note content/tags are ever stored in `behavior_events` — only event_type + paper_id + key.
