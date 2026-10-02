// Robust migration suite against REAL embedded Postgres. Three scenarios, each on a
// freshly reset public schema:
//   A) empty DB         -> baseline + migrations; catalog seeds, exactly 7 ready.
//   B) legacy-38        -> 38 pre-phase-1 journals (fixed UUIDs, incl. LCP/CUNY/CogSci
//                          reconciliation rows) migrated; no duplicate/ID/relation loss.
//   C) production-64    -> B's journals + 64 papers (8 duplicate-DOI pairs, DOI-less
//                          rows, missing abstracts) migrated; dedup collapses DOIs but
//                          rows and relations are preserved.
// Idempotency (up x2) and a down/re-up cycle are checked on the heavy case.
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, hardTimeout } from './lib/test-env.ts';

hardTimeout(180_000, 'migration.fixtures');

process.on('uncaughtException', (e: any) => {
  if (e?.code === 'ECONNRESET' || /read ECONNRESET/.test(e?.message || '')) return;
  console.error('UNCAUGHT:', e);
});

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
const UP = ['0000_base.up.sql', '0001_sources.up.sql', '0002_reconcile.up.sql', '0003_full_catalog.up.sql', '0004_correct_issn.up.sql'];
const DOWN = ['0004_correct_issn.down.sql', '0003_full_catalog.down.sql', '0002_reconcile.down.sql', '0001_sources.down.sql', '0000_base.down.sql'];

const dataDir = mkdtempSync(join(tmpdir(), 'litradar-migfix-'));

// Deterministic legacy journal UUIDs (phase-0/1 must never change these).
function legacyId(n: number): string {
  return `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

// 38 pre-phase-1 sources. Mix of catalog-adoptable rows + the 0002 reconciliation rows
// (LCP old ISSN, CUNY, CogSci duplicate). Fixed IDs so we can prove preservation.
const LEGACY_38: Array<[number, string, string | null, string]> = [
  [1, 'Journal of Memory and Language', '0749-596X', 'P0'],
  [2, 'Cognition', '0010-0277', 'P0'],
  [3, 'Journal of Child Language', '0305-0009', 'P0'],
  [4, 'First Language', '0142-7237', 'P0'],
  [5, 'Applied Psycholinguistics', '0142-7164', 'P0'],
  [6, 'Language Acquisition', '1048-6928', 'P1'],
  [7, 'Bilingualism: Language and Cognition', '1366-7289', 'P1'],
  [8, 'Language Development Research', null, 'P0'],
  [9, 'AMLaP', null, 'P0'],
  [10, 'CUNY Conference on Human Sentence Processing', null, 'P0'],
  [11, 'BUCLD', null, 'P0'],
  [12, 'arXiv cs.CL / stat.ML / q-bio.NC', null, 'P3'],
  [13, 'ACL Anthology', null, 'P3'],
  [14, 'Language, Cognition and Neuroscience', '2327-3798', 'P1'],
  [15, 'Language and Cognitive Processes', '0169-0965', 'P2'],
  [16, 'CogSci Conference', null, 'P3'],
  [17, 'Annual Meeting of the Cognitive Science Society', null, 'P3'],
  [18, 'Cognitive Science', '0364-0213', 'P2'],
  [19, 'Language Learning', '0023-8333', 'P1'],
  [20, 'Child Development', '0009-3920', 'P1'],
  [21, 'Developmental Science', '1467-7687', 'P1'],
  [22, 'Memory & Cognition', '0090-502X', 'P2'],
  [23, 'Cognitive Psychology', '0010-0285', 'P2'],
  [24, 'Psychonomic Bulletin & Review', '1069-9384', 'P2'],
  [25, 'Behavior Research Methods', '1554-3528', 'P2'],
  [26, 'Studies in Second Language Acquisition', '0272-2631', 'P1'],
  [27, 'Second Language Research', '0267-6583', 'P1'],
  [28, 'Developmental Psychology', '0012-1649', 'P1'],
  [29, 'Journal of Experimental Child Psychology', '0022-0965', 'P1'],
  [30, 'Language', '0097-8507', 'P2'],
  [31, 'TACL', '2307-3874', 'P3'],
  [32, 'Computational Linguistics', '0891-2017', 'P3'],
  [33, 'Infancy', '1532-7018', 'P3'],
  [34, 'Journal of Speech, Language, and Hearing Research', '1092-4388', 'P2'],
  [35, 'Child Language Teaching and Therapy', '0265-6590', 'P2'],
  [36, 'Topics in Cognitive Science', '1756-5687', 'P2'],
  [37, 'COLM', null, 'P3'],
  [38, 'SRCD Biennial Meeting', null, 'P3'],
];

async function resetDb(client: Client, applyLegacyBaseline = true) {
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  // applyLegacyBaseline=true simulates an existing legacy DB (hand-provisioned
  // deploy/migration.sql). Scenario A passes false: a truly empty DB that must be
  // built entirely by runUp (0000_base creates the tables).
  if (applyLegacyBaseline) {
    await client.query(f(join(root, 'deploy', 'migration.sql')));
  }
}

async function upMigrations(client: Client) {
  for (const m of UP) await client.query(f(join(migDir, m)));
}

async function scenarioEmpty(client: Client) {
  await resetDb(client, false); // TRULY empty: no hand-applied baseline.
  await upMigrations(client);
  const q = async (s: string) => (await client.query(s)).rows;
  const ready = Number((await q(`SELECT COUNT(*) c FROM journals WHERE connector_status='ready'`))[0].c);
  if (ready !== 7) throw new Error(`[empty] expected 7 ready, got ${ready}`);
  const cols = (await q(
    `SELECT column_name FROM information_schema.columns WHERE table_name='journals' AND column_name IN ('status','connector_type','connector_status','parent_id','poll_policy','last_synced_at')`,
  )).length;
  if (cols !== 6) throw new Error(`[empty] journals missing phase-1 columns, got ${cols}/6`);
  console.log('[ok] A) empty DB migrated: 7 ready, phase-1 columns present');
}

async function scenarioLegacy38(client: Client) {
  await resetDb(client);
  // seed 38 legacy journals
  for (const [n, name, issn, prio] of LEGACY_38) {
    await client.query(
      `INSERT INTO journals (id,name,abbreviation,source_type,issn,priority) VALUES ($1,$2,NULL,'journal',$3,$4)`,
      [legacyId(n), name, issn, prio],
    );
  }
  // forward twice -> idempotent
  await upMigrations(client);
  await upMigrations(client);
  const q = async (s: string, p?: any[]) => (await client.query(s, p)).rows;

  // all legacy UUIDs preserved
  const alive = Number((await q(`SELECT COUNT(*) c FROM journals WHERE id = ANY($1)`, [LEGACY_38.map((r) => legacyId(r[0]))]))[0].c);
  if (alive !== 38) throw new Error(`[legacy-38] expected 38 legacy UUIDs preserved, got ${alive}`);

  // no duplicate active names
  const dupNames = await q(`SELECT name, COUNT(*) c FROM journals WHERE status='active' GROUP BY name HAVING COUNT(*)>1`);
  if (dupNames.length) throw new Error(`[legacy-38] duplicate active names: ${JSON.stringify(dupNames)}`);

  // no duplicate non-null ISSNs
  const dupIssn = await q(`SELECT issn, COUNT(*) c FROM journals WHERE issn IS NOT NULL GROUP BY issn HAVING COUNT(*)>1`);
  if (dupIssn.length) throw new Error(`[legacy-38] duplicate ISSNs: ${JSON.stringify(dupIssn)}`);

  // 7 ready, all crossref journals
  const ready = Number((await q(`SELECT COUNT(*) c FROM journals WHERE connector_status='ready'`))[0].c);
  if (ready !== 7) throw new Error(`[legacy-38] expected 7 ready, got ${ready}`);
  const bad = await q(`SELECT name FROM journals WHERE source_type<>'journal' AND connector_type='crossref'`);
  if (bad.length) throw new Error(`[legacy-38] non-journal faked as crossref: ${JSON.stringify(bad)}`);

  // LCP legacy row archived (not deleted); LCN row kept
  const lcp = (await q(`SELECT id,status FROM journals WHERE issn='0169-0965'`))[0];
  if (!lcp || lcp.status !== 'archived') throw new Error('[legacy-38] LCP legacy row should be archived, not deleted');
  console.log('[ok] B) legacy-38: 38 UUIDs preserved, no dup names/ISSN, 7 ready, LCP archived');
}

async function scenarioProduction64(client: Client) {
  await resetDb(client);
  for (const [n, name, issn, prio] of LEGACY_38) {
    await client.query(
      `INSERT INTO journals (id,name,abbreviation,source_type,issn,priority) VALUES ($1,$2,NULL,'journal',$3,$4)`,
      [legacyId(n), name, issn, prio],
    );
  }
  // 64 papers: round-robin across journals; 8 duplicate-DOI pairs; DOI-less rows; missing abstracts.
  const journalIds = LEGACY_38.map((r) => legacyId(r[0]));
  for (let i = 0; i < 64; i++) {
    const jid = journalIds[i % journalIds.length];
    // duplicate-DOI pairs: papers 0-1, 2-3, ..., 14-15 share a DOI (8 pairs)
    let doi: string | null = `10.1000/prod.${i}`;
    if (i < 16) doi = `10.1000/dup.${Math.floor(i / 2)}`;
    else if (i >= 54) doi = null; // 10 DOI-less rows (must NOT be fuzzy-merged)
    const abstractText = i % 7 === 0 ? null : `Abstract for paper ${i}.`; // ~9 missing abstracts
    await client.query(
      `INSERT INTO papers (journal_id,title,doi,abstract_text,fetched_at) VALUES ($1,$2,$3,$4,now())`,
      [jid, `Legacy paper ${i}`, doi, abstractText],
    );
  }
  const before = Number((await client.query(`SELECT COUNT(*) c FROM papers`)).rows[0].c);
  const linkedBefore = Number((await client.query(`SELECT COUNT(*) c FROM papers WHERE journal_id IS NOT NULL`)).rows[0].c);
  const noAbstractBefore = Number((await client.query(`SELECT COUNT(*) c FROM papers WHERE abstract_text IS NULL`)).rows[0].c);

  await upMigrations(client);
  await upMigrations(client); // idempotent

  const q = async (s: string) => (await client.query(s)).rows;
  const after = Number((await q(`SELECT COUNT(*) c FROM papers`))[0].c);
  if (after !== before) throw new Error(`[prod-64] paper rows lost: ${before} -> ${after}`);

  // no duplicate non-null DOI remains
  const dup = await q(`SELECT doi, COUNT(*) c FROM papers WHERE doi IS NOT NULL GROUP BY doi HAVING COUNT(*)>1`);
  if (dup.length) throw new Error(`[prod-64] duplicate DOIs after migration: ${JSON.stringify(dup)}`);

  // no orphaned journal_id (relation loss)
  const orphans = Number((await q(`
    SELECT COUNT(*) c FROM papers p LEFT JOIN journals j ON p.journal_id=j.id
    WHERE p.journal_id IS NOT NULL AND j.id IS NULL`))[0].c);
  if (orphans) throw new Error(`[prod-64] ${orphans} papers lost their journal relation`);
  const linkedAfter = Number((await q(`SELECT COUNT(*) c FROM papers WHERE journal_id IS NOT NULL`))[0].c);
  if (linkedAfter !== linkedBefore) throw new Error(`[prod-64] linked papers changed: ${linkedBefore} -> ${linkedAfter}`);

  // DOI-less rows preserved as distinct rows (not fuzzy-merged)
  const nullDois = Number((await q(`SELECT COUNT(*) c FROM papers WHERE doi IS NULL`))[0].c);
  // original 10 DOI-less + up to 8 deduped-pair members NULLed by 0001
  if (nullDois < 10) throw new Error(`[prod-64] expected >=10 DOI-less rows preserved, got ${nullDois}`);

  // missing abstract stays explicit NULL (not invented)
  const noAbstractAfter = Number((await q(`SELECT COUNT(*) c FROM papers WHERE abstract_text IS NULL`))[0].c);
  if (noAbstractAfter !== noAbstractBefore) {
    throw new Error(`[prod-64] abstract NULL count changed: ${noAbstractBefore} -> ${noAbstractAfter}`);
  }
  console.log(`[ok] C) production-64: ${after} rows preserved, no dup DOI, ${orphans} orphaned, ${nullDois} DOI-less, ${noAbstractAfter} missing-abstract explicit`);

  // down then re-up: legacy rows survive down
  for (const d of DOWN) await client.query(f(join(migDir, d)));
  const still = Number((await client.query(`SELECT COUNT(*) c FROM journals WHERE id = ANY($1)`, [journalIds])).rows[0].c);
  if (still !== 38) throw new Error(`[prod-64] legacy journals lost on down: ${still}/38`);
  for (const u of UP) await client.query(f(join(migDir, u)));
  console.log('[ok] C) down/re-up cycle: legacy rows survive, re-up clean');
}

async function main() {
  const pgPort = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: pgPort });
  await pg.initialise();
  await pg.start();
  const client = new Client({ connectionString: `postgres://postgres:postgres@localhost:${pgPort}/postgres` });
  await client.connect();
  try {
    await scenarioEmpty(client);
    await scenarioLegacy38(client);
    await scenarioProduction64(client);
    console.log('\n=== MIGRATION FIXTURE SUITE PASSED ===');
  } finally {
    await client.end();
    await pg.stop();
  }
}

main().catch((e) => { console.error('MIGRATION FIXTURE FAILED:', e.message); process.exit(1); });
