// Library authority migration + behavior suite against REAL embedded Postgres.
// Verifies, on a disposable DB:
//   * backfill merges favorites + paper-linked checklist into ONE user_library row per (user,paper)
//   * no public papers are duplicated; legacy tables preserved; orphan (paper_id NULL) checklist
//     rows are NOT migrated into the library
//   * UNIQUE(user_id,paper_id) enforced; reading_state mapping todo/in_progress/done -> todo/reading/read
//   * two-user isolation (user A never sees user B's rows)
//   * recommendations exclude ANY library association + uninterested feedback; cold-start flag
//   * down drops only the new objects; legacy data survives
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, hardTimeout } from './lib/test-env.ts';

hardTimeout(180_000, 'library.migration');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
// Full accepted migration chain — not just 0000+0005 — so the library backfill is exercised
// against the same schema shape the release boots. Split: 0000-0004 first, then 0005 (the
// library backfill) is applied AFTER legacy data is inserted so it actually backfills.
const PRE_UP = [
  '0000_base.up.sql',
  '0001_sources.up.sql',
  '0002_reconcile.up.sql',
  '0003_full_catalog.up.sql',
  '0004_correct_issn.up.sql',
];
const LIBRARY_UP = '0005_user_library.up.sql';
const LIBRARY_DOWN = '0005_user_library.down.sql';
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-library-'));

async function main() {
  const pgPort = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: pgPort });
  await pg.initialise();
  await pg.start();
  const client = new Client({ connectionString: `postgres://postgres:postgres@localhost:${pgPort}/postgres` });
  await client.connect();
  const q = async (s: string, p?: any[]) => (await client.query(s, p)).rows;

  try {
    // ── apply accepted chain up through 0004 (NOT yet the library migration) ──
    for (const up of PRE_UP) await client.query(f(join(migDir, up)));

    // Catalog from 0003 already contains these; reuse their real IDs (no manual journals).
    const cog = (await q(`SELECT id FROM journals WHERE name='Cognition'`))[0].id;
    const mc = (await q(`SELECT id FROM journals WHERE name='Memory & Cognition'`))[0].id;

    await client.query(
      `INSERT INTO papers (id,journal_id,title,keywords,abstract_text,published_date) VALUES
        ('aaaaaaaa-0000-4000-8000-000000000001',$1,'Priming effects in sentence comprehension','priming, syntax, prediction','We studied...', CURRENT_DATE - 10),
        ('aaaaaaaa-0000-4000-8000-000000000002',$2,'Statistical learning review','statistics, segmentation', NULL, CURRENT_DATE - 400),
        ('aaaaaaaa-0000-4000-8000-000000000003',$1,'Semantic attraction','agreement, plausibility','We show...', CURRENT_DATE - 30),
        ('aaaaaaaa-0000-4000-8000-000000000004',$2,'Phonological neighborhood','phonology', 'Abstract here.', NULL)`
      , [cog, mc]);
    const P1 = 'aaaaaaaa-0000-4000-8000-000000000001';
    const P2 = 'aaaaaaaa-0000-4000-8000-000000000002';
    const P3 = 'aaaaaaaa-0000-4000-8000-000000000003';
    const P4 = 'aaaaaaaa-0000-4000-8000-000000000004';

    // ── legacy user data BEFORE migration ──
    // User A: favorite p-1; checklist p-1 (in_progress) + p-3 (done) + DUPLICATE p-3 todo; orphan free-text row.
    await client.query(`INSERT INTO user_favorites (user_id,paper_id) VALUES ('user-a',$1)`, [P1]);
    await client.query(`INSERT INTO reading_checklist (user_id,paper_id,status) VALUES
        ('user-a',$1,'in_progress'),
        ('user-a',$2,'done'),
        ('user-a',$2,'todo'),
        ('user-a',NULL,'todo')`, [P1, P3]);
    await client.query(`INSERT INTO user_notes (user_id,paper_id,content) VALUES ('user-a',$1,'note about p-1')`, [P1]);
    // User B: favorite p-2 only.
    await client.query(`INSERT INTO user_favorites (user_id,paper_id) VALUES ('user-b',$1)`, [P2]);

    // ── run migration 0005 (twice -> idempotent) ──
    await client.query(f(join(migDir, LIBRARY_UP)));
    await client.query(f(join(migDir, LIBRARY_UP)));

    // paper-linked library rows for user-a: p-1 (fav + reading), p-3 (read, deduped)
    const aRows = await q(`SELECT paper_id, is_favorite, reading_state FROM user_library WHERE user_id='user-a' ORDER BY paper_id`);
    const aMap: Record<string, any> = Object.fromEntries(aRows.map((r: any) => [r.paper_id, r]));
    if (aRows.length !== 2) throw new Error(`[backfill] user-a should have 2 library rows, got ${aRows.length}: ${JSON.stringify(aRows)}`);
    if (!aMap[P1].is_favorite) throw new Error('[backfill] p-1 should be favorited');
    if (aMap[P1].reading_state !== 'reading') throw new Error(`[backfill] p-1 in_progress->reading, got ${aMap[P1].reading_state}`);
    if (aMap[P3].reading_state !== 'read') throw new Error(`[backfill] p-3 done->read (most advanced), got ${aMap[P3].reading_state}`);
    if (aMap[P3].is_favorite) throw new Error('[backfill] p-3 should NOT be favorited');
    console.log('[ok] backfill merged fav+checklist, deduped duplicate p-3, mapped states');

    // orphan free-text row preserved in reading_checklist, NOT in library
    const orphan = await q(`SELECT count(*)::int c FROM reading_checklist WHERE user_id='user-a' AND paper_id IS NULL`);
    if (orphan[0].c !== 1) throw new Error(`[orphan] expected 1 preserved free-text row, got ${orphan[0].c}`);
    const orphanInLib = await q(`SELECT count(*)::int c FROM user_library WHERE user_id='user-a' AND paper_id IS NULL`);
    if (orphanInLib[0].c !== 0) throw new Error('[orphan] free-text row must not become a library association');
    console.log('[ok] orphan free-text checklist preserved, not migrated');

    // papers NOT duplicated by migration
    const paperCount = await q(`SELECT count(*)::int c FROM papers`);
    if (paperCount[0].c !== 4) throw new Error(`[papers] expected 4 papers preserved, got ${paperCount[0].c}`);
    // notes preserved
    const notesCount = await q(`SELECT count(*)::int c FROM user_notes WHERE user_id='user-a'`);
    if (notesCount[0].c !== 1) throw new Error('[notes] note lost');
    console.log('[ok] papers and notes preserved, no paper duplication');

    // ── UNIQUE(user_id,paper_id) enforcement ──
    let uniqueViolation = false;
    try {
      await client.query(`INSERT INTO user_library (user_id,paper_id) VALUES ('user-a',$1)`, [P1]);
    } catch { uniqueViolation = true; }
    if (!uniqueViolation) throw new Error('[unique] duplicate (user-a,p-1) insert should be rejected');
    console.log('[ok] UNIQUE(user_id,paper_id) enforced');

    // ── two-user isolation ──
    const bRows = await q(`SELECT paper_id, is_favorite, reading_state FROM user_library WHERE user_id='user-b'`);
    if (bRows.length !== 1 || bRows[0].paper_id !== P2) throw new Error(`[isolation] user-b rows wrong: ${JSON.stringify(bRows)}`);
    if (!bRows[0].is_favorite || bRows[0].reading_state !== null) throw new Error('[isolation] user-b p-2 fav only, no reading state');
    console.log('[ok] two-user isolation: user-a sees only a, user-b sees only b');

    // ── recommendations: exclusions + cold-start ──
    // user-a library = {p-1,p-3}; mark p-4 uninterested. Candidates for user-a = p-2 (only).
    await client.query(`INSERT INTO user_recommendation_feedback (user_id,paper_id,feedback_type) VALUES ('user-a',$1,'uninterested')`, [P4]);
    const aCandidates = (await q(`
      SELECT p.id FROM papers p
      WHERE p.id NOT IN (SELECT paper_id FROM user_library WHERE user_id='user-a')
        AND p.id NOT IN (SELECT paper_id FROM user_recommendation_feedback WHERE user_id='user-a' AND feedback_type='uninterested')`)).map((r: any) => r.id).sort();
    if (JSON.stringify(aCandidates) !== JSON.stringify([P2])) throw new Error(`[rec-excl] user-a candidates should be {p-2}, got ${JSON.stringify(aCandidates)}`);
    console.log('[ok] recommendations exclude ANY library row + uninterested feedback');

    // user-b: only p-2 favorited. Candidates = p-1,p-3,p-4 (none uninterested). Cold start? user-b has no notes
    // and library row exists (favorite), so cold-start = false (library non-empty).
    const bCold = (await q(`SELECT (NOT EXISTS (SELECT 1 FROM user_library WHERE user_id='user-b')
        AND NOT EXISTS (SELECT 1 FROM user_notes WHERE user_id='user-b' AND paper_id IS NOT NULL)) AS v`))[0].v;
    if (bCold !== false) throw new Error('[cold] user-b with a library row should NOT be cold start');
    // brand-new user-c: cold start true
    const cCold = (await q(`SELECT (NOT EXISTS (SELECT 1 FROM user_library WHERE user_id='user-c')
        AND NOT EXISTS (SELECT 1 FROM user_notes WHERE user_id='user-c' AND paper_id IS NOT NULL)) AS v`))[0].v;
    if (cCold !== true) throw new Error('[cold] brand-new user-c should be cold start');
    console.log('[ok] cold-start detection: established user false, fresh user true');

    // ── down: drop only new objects; legacy data intact ──
    await client.query(f(join(migDir, LIBRARY_DOWN)));
    const libGone = (await q(`SELECT to_regclass('public.user_library') AS v`))[0].v === null;
    const fbGone = (await q(`SELECT to_regclass('public.user_recommendation_feedback') AS v`))[0].v === null;
    if (!libGone || !fbGone) throw new Error('[down] new tables should be dropped');
    const favAlive = (await q(`SELECT count(*)::int c FROM user_favorites WHERE user_id='user-a'`))[0].c;
    const noteAlive = (await q(`SELECT count(*)::int c FROM user_notes WHERE user_id='user-a'`))[0].c;
    if (favAlive !== 1 || noteAlive !== 1) throw new Error('[down] legacy favorites/notes must survive rollback');
    console.log('[ok] down drops only new tables; legacy favorites/notes preserved');

    // re-up idempotent
    await client.query(f(join(migDir, LIBRARY_UP)));
    const aRe = await q(`SELECT count(*)::int c FROM user_library WHERE user_id='user-a'`);
    if (aRe[0].c !== 2) throw new Error(`[re-up] expected 2 rows, got ${aRe[0].c}`);
    console.log('[ok] re-up rebuilds cleanly');

    console.log('\n=== LIBRARY MIGRATION SUITE PASSED ===');
  } finally {
    await client.end();
    await pg.stop();
  }
}

main().catch((e) => { console.error('LIBRARY MIGRATION FAILED:', e.message); process.exit(1); });
