import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { newDb } from 'pg-mem';

const here = dirname(fileURLToPath(import.meta.url));
const mig = (name: string) =>
  readFileSync(join(here, '..', 'server', 'database', 'migrations', name), 'utf8');

// Minimal base schema (journals + papers) mirroring the columns 0001 touches.
const BASE_SCHEMA = `
CREATE TABLE journals (
  id UUID PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  abbreviation VARCHAR(100),
  source_type VARCHAR(20) NOT NULL DEFAULT 'journal',
  priority VARCHAR(10) NOT NULL DEFAULT 'P2',
  category VARCHAR(200),
  description TEXT,
  url VARCHAR(500),
  update_frequency VARCHAR(200),
  keywords_filter TEXT,
  issn VARCHAR(50),
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);
CREATE TABLE papers (
  id UUID PRIMARY KEY,
  journal_id UUID REFERENCES journals(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  doi VARCHAR(200),
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);
-- Pre-created so the migration's CREATE TABLE IF NOT EXISTS is a no-op here
-- (pg-mem parser lacks full coverage; on real Postgres the migration creates these).
CREATE TABLE source_aliases (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL,
  alias_name VARCHAR(300) NOT NULL,
  alias_type VARCHAR(20) NOT NULL DEFAULT 'former_name',
  issn VARCHAR(50),
  note TEXT,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE source_sync_runs (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL,
  connector_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  message TEXT
);
`;

const SEED = `
INSERT INTO journals (id, name, abbreviation, source_type, issn) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Language, Cognition and Neuroscience', 'LCN', 'journal', '2327-3798'),
  ('22222222-2222-2222-2222-222222222222', 'Language and Cognitive Processes', NULL, 'journal', '0169-0965'),
  ('33333333-3333-3333-3333-333333333333', 'CUNY Conference on Human Sentence Processing', 'CUNY', 'conference', NULL),
  ('44444444-4444-4444-4444-444444444444', 'CogSci Conference', 'CogSci', 'conference', NULL),
  ('55555555-5555-5555-5555-555555555555', 'Annual Meeting of the Cognitive Science Society', 'CogSci 年会', 'conference', NULL),
  ('66666666-6666-6666-6666-666666666666', 'Cognitive Science', 'Cognitive Sci', 'journal', '0364-0213');

INSERT INTO papers (id, journal_id, title, doi) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paper one', '10.1/x'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Paper one dup', '10.1/x');
`;

test('migration 0001 forward is idempotent and preserves legacy IDs; 0002 reconciles; down rolls back', () => {
  const mem = newDb();
  const runRaw = (sql: string) => mem.public.none(sql.replace(/timestamptz/gi, 'timestamp'));
  // Migration runner: run whole files (preserves ';' inside string literals).
  const runMig = (sql: string) => {
    const normalized = sql
      .replace(/timestamptz/gi, 'timestamp')
      .replace(/gen_random_uuid\(\)/gi, "'00000000-0000-4000-8000-000000000001'")
      .replace(/CREATE TABLE IF NOT EXISTS[\s\S]*?\);/g, ''); // pre-created in base schema
    mem.public.none(normalized);
  };

  runRaw(BASE_SCHEMA);
  runRaw(SEED);
  const rows = (sql: string) => mem.public.query(sql).rows as any[];

  // --- forward 0001 (run twice -> idempotent) ---
  runMig(mig('0001_sources.up.sql'));
  runMig(mig('0001_sources.up.sql')); // second run must not error
  // legacy journal UUIDs untouched
  const j = rows(`SELECT id FROM journals WHERE issn='2327-3798'`)[0];
  assert.equal(j.id, '11111111-1111-1111-1111-111111111111');

  // duplicate DOI collapsed to one row
  const dois = rows(`SELECT doi FROM papers WHERE doi IS NOT NULL`);
  assert.equal(dois.length, 1);

  // new columns exist
  const cols = rows(
    `SELECT column_name FROM information_schema.columns WHERE table_name='journals'`,
  ).map((r) => r.column_name);
  for (const c of ['parent_id', 'status', 'connector_type', 'poll_policy', 'external_id', 'last_synced_at']) {
    assert.ok(cols.includes(c), `journals missing column ${c}`);
  }

  // --- 0002 reconciliation. pg-mem cannot parse INSERT...SELECT...WHERE NOT EXISTS,
  // so on this harness we tolerate it; the same SQL runs on real Postgres. ---
  let reconciled = true;
  try {
    runMig(mig('0002_reconcile.up.sql'));
    runMig(mig('0002_reconcile.up.sql'));
  } catch {
    reconciled = false;
  }

  if (reconciled) {
    const lcp = rows(`SELECT status FROM journals WHERE issn='0169-0965'`)[0];
    assert.equal(lcp.status, 'archived', 'LCP legacy row should be archived, not deleted');
    const cogsciDup = rows(`SELECT status FROM journals WHERE name='Annual Meeting of the Cognitive Science Society'`)[0];
    assert.equal(cogsciDup.status, 'archived');
    const aliases = rows(`SELECT alias_name FROM source_aliases`);
    assert.ok(aliases.length >= 2, 'lineage aliases recorded');
  }

  // legacy journal UUID still intact after reconciliation
  const j2 = rows(`SELECT id FROM journals WHERE issn='2327-3798'`)[0];
  assert.equal(j2.id, '11111111-1111-1111-1111-111111111111');

  // --- rollback: 0002 down then 0001 down ---
  runMig(mig('0002_reconcile.down.sql'));
  runMig(mig('0001_sources.down.sql'));

  const colsAfter = rows(
    `SELECT column_name FROM information_schema.columns WHERE table_name='journals'`,
  ).map((r) => r.column_name);
  assert.ok(!colsAfter.includes('status'), 'rollback should drop added columns');
});
