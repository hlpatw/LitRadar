# My Library — authoritative per-user-per-paper model (0005)

Branch: `feat/my-library-authority`, cut from verified `release/phase0-1` tip `13e756b`.
Staging-only; nothing pushed/deployed; `main` and production untouched.

## 1. Problem audited

Before this change the personal reading state was scattered across three tables that could
diverge for the same `(user, paper)`:

| Legacy table | Key quirk |
|---|---|
| `user_favorites` | `UNIQUE(user_id,paper_id)`, boolean favorite only |
| `reading_checklist` | **no unique constraint** — a user could hold duplicate `(user,paper)` rows; allowed `paper_id IS NULL` free-text entries; status `todo/in_progress/done` |
| `user_notes` | single table, keyed off `papers(id)`, multiple notes per paper |
| `user_settings` | per-user prefs |

`WorkspaceService` wrote favorites/checklist directly into those tables, `DashboardStats`
counted them separately, and `PapersService.list` favorite/todo filters queried them with raw
`EXISTS`. There was no single row representing "this user associated this paper."

## 2. Model decisions

### 2.1 `user_library` — the one authority
One row per `(user_id, paper_id)`, enforced by `UNIQUE (user_id, paper_id)`.

| column | meaning |
|---|---|
| `is_favorite` | saved/starred (legacy `user_favorites`) |
| `reading_state` | `NULL | 'todo' | 'reading' | 'read'` (CHECK constrained) |
| `personal_tags` | comma-separated, mirrors existing `keywords` convention |
| `added_at` | when the user first associated the paper (earliest backfill timestamp) |

A row existing at all = "in my library." `reading_state IS NULL` with `is_favorite=true` is
valid (starred, not list-tracked); `is_favorite=false` with a state is valid (list-tracked only).

### 2.2 `user_recommendation_feedback` — negative signal, deliberately OUTSIDE the library
`UNIQUE (user_id, paper_id, feedback_type)`. Marking a paper *uninterested* does **not** create
a "saved" association — it is a separate row. This satisfies the review hard-constraint that
excluding a rejected paper must not manufacture a library relationship.

### 2.3 Notes stay a single table
`user_notes` is unchanged. It references `papers(id)` (not `user_library`), so removing a
library row **never deletes notes**. A removed paper immediately becomes recommendable again
unless it also has an `uninterested` feedback row.

### 2.4 Orphan checklist entries
Legacy `reading_checklist` rows with `paper_id IS NULL` are free-text manual entries, **not**
paper associations. They are preserved in `reading_checklist` and are never migrated into
`user_library`. The legacy checklist API unions them with paper-linked library rows.

## 3. Migration (`0005_user_library.up/down.sql`)

- Creates both new tables (idempotent `IF NOT EXISTS`) and adds `user_settings.rec_weights JSONB`.
- **Backfill** merges `user_favorites` + paper-linked `reading_checklist` into `user_library`:
  - checklist duplicates for the same `(user,paper)` are pre-aggregated; the *most advanced*
    status wins (`done > in_progress > todo`), earliest `_created_at` wins for `added_at`.
  - favorite + checklist rows for the same paper collapse to **one** library row.
  - state mapping: `todo→todo`, `in_progress→reading`, `done→read`.
  - `ON CONFLICT (user_id,paper_id) DO NOTHING` → replay-safe, no duplicates.
- **Does not** touch `user_favorites`, `reading_checklist`, `user_notes`, or `papers`.
- **Down** drops only the two new tables and the `rec_weights` column; legacy data survives.

## 4. Compatibility — no divergent parallel state

The old endpoints and dashboard now read/write the same authority:

- `GET/POST/DELETE /api/workspace/favorites` → upsert/clear `is_favorite` on `user_library`.
- `GET/POST/PATCH/DELETE /api/workspace/checklist` → paper-linked rows route to `user_library`
  (state mapped `todo|reading|read` ⇄ legacy `todo|in_progress|done`); orphan rows stay in
  `reading_checklist`.
- `DashboardStats.favoriteCount / checklistTodoCount / checklistDoneCount` → `user_library`.
- `PapersService.list` favorite/todo `EXISTS` filters → `user_library`.
- Removing a favorite or a library row deletes the row only when it carries no other signal
  (no state, no tags), so the paper can re-enter recommendations.

## 5. New surface — `My Library`

- `GET /api/library?status=&priority=&tag=&q=&hasNotes=` with added-time ordering + note counts.
- `PUT /api/library/:paperId` upsert (`isFavorite`, `readingState`, `personalTags`).
- `DELETE /api/library/:paperId` remove association (notes preserved).
- Quick actions: `POST :paperId/favorite`, `POST :paperId/reading-state`,
  `POST/DELETE :paperId/feedback`.
- Client: `/library` route, sidebar item "我的书架", status pills, keyword/tag filters,
  recommendations with reason chips, one-click save / mark-not-interested.

## 6. In-database explainable recommendations

Pure SQL (CTEs), no LLM / external source / scheduler / manual import. Default weights
(configurable per user via `user_settings.rec_weights`, merged over defaults):

`interest 0.30 · lexical 0.25 · source 0.15 · freshness 0.15 · abstract 0.15`

- **interest**: overlap of paper keywords with `user_settings.interested_keywords`.
- **lexical**: overlap with keywords of papers the user has favorited / reading-tracked / noted.
- **source**: journal priority `P0=1.0 P1=0.75 P2=0.5 P3=0.25`.
- **freshness**: `1 - age_days/730`, clamped ≥ 0.
- **abstract**: 1 when an abstract exists.
- **Exclusions**: ANY `user_library` row for the user (favorite/todo/reading/read alike) **and**
  any `uninterested` feedback row.
- **Cold start**: when the user has no library row and no paper-linked notes, lexical overlap is
  zero, `coldStart=true` is returned, and reasons explain the fallback.

Each returned item carries its weighted `score`, a per-component `breakdown`, and human-readable
`reasons`.

## 7. Evidence (gates)

| Gate | Result |
|---|---|
| `npm run build:server` (Nest/SWC) | pass |
| `npm run build:client` (Vite) | pass |
| `node --experimental-strip-types --test` | 25/25 pass |
| `scripts/library.migration.test.ts` (real embedded Postgres) | pass — backfill merge, dedup, state mapping, orphan preservation, `UNIQUE` violation rejected, two-user isolation, rec exclusions, cold-start, down/re-up |
| `scripts/migration.fixtures.ts` (existing journal/paper scenarios A/B/C) | pass, no regression |
| `scripts/e2e.flow.ts` (full HTTP journey) | pass — incl. upsert, idempotent one-row, status filter, rec exclusion, feedback exclude/restore, dashboard count, remove; plus the pre-existing 401/403/admin permission matrix |

Admin shared-paper permissions are unchanged: `POST/PATCH/DELETE /api/papers` remain gated behind
`AdminOrCliGuard` (regular user 403, admin 201/200/204), verified in the E2E matrix.
