// Gate: a TRULY EMPTY Postgres bootstraps solely through the tracked migrator
// (server/database/migrator.ts runUp/runDownOne) — no hand-applied deploy/migration.sql.
//
//  1. runUp on empty DB        -> applies 0000..0004, records them in _migrations.
//  2. runUp again              -> no-op (change tracking, no duplication).
//  3. asserts core tables/constraints exist, 7 ready, install marker = created_by_migrator.
//  4. runDownOne loop          -> exact teardown on a provably migration-built DB
//                                 (0000 down drops the core tables because the marker
//                                  proves the DB was created by the migrator).
//  5. runUp again              -> rebuilds cleanly (idempotent re-boot).
//
// Uses an embedded throwaway Postgres on an OS-assigned port; never touches prod/staging.
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUp, runDownOne } from '../server/database/migrator.ts';
import { freePort, hardTimeout } from './lib/test-env.ts';

hardTimeout(180_000, 'runup.boot');
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-runup-'));

async function tableExists(client: Client, name: string): Promise<boolean> {
  const r = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${name}`]);
  return r.rows[0].ok;
}

async function main() {
  const pgPort = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: pgPort });
  await pg.initialise();
  await pg.start();
  const client = new Client({ connectionString: `postgres://postgres:postgres@localhost:${pgPort}/postgres` });
  await client.connect();
  try {
    // --- 1) runUp on a truly empty DB ---
    const applied = await runUp(client);
    if (applied.length !== 5) throw new Error(`expected runUp to apply 5 migrations, got ${applied.length}: ${applied.join(', ')}`);
    console.log('[ok] runUp on empty DB applied:', applied.join(', '));

    // core tables + constraints exist
    for (const t of ['journals', 'papers', 'users', 'user_favorites', 'reading_checklist', 'user_notes', 'user_settings', '_migrations', '_schema_meta']) {
      if (!(await tableExists(client, t))) throw new Error(`expected table ${t} after runUp`);
    }
    console.log('[ok] all core tables + _migrations + _schema_meta created');

    const ready = Number((await client.query(`SELECT COUNT(*) c FROM journals WHERE connector_status='ready'`)).rows[0].c);
    if (ready !== 7) throw new Error(`expected 7 ready, got ${ready}`);

    const mode = (await client.query(`SELECT value FROM _schema_meta WHERE key='base_install_mode'`)).rows[0]?.value;
    if (mode !== 'created_by_migrator') throw new Error(`expected install marker created_by_migrator on fresh DB, got ${mode}`);
    console.log('[ok] fresh-DB marker =', mode, '; 7 ready sources');

    // --- 2) runUp again is a no-op (change tracking) ---
    const applied2 = await runUp(client);
    if (applied2.length !== 0) throw new Error(`second runUp should be a no-op, re-applied: ${applied2.join(', ')}`);
    console.log('[ok] second runUp applied nothing (change tracking)');

    // --- 4) runDownOne loop: exact teardown on the disposable, migration-built DB ---
    let undone: string | null;
    const undoneList: string[] = [];
    do {
      undone = await runDownOne(client);
      if (undone) undoneList.push(undone);
    } while (undone);
    if (undoneList.length !== 5) throw new Error(`expected 5 reverts, got ${undoneList.length}: ${undoneList.join(', ')}`);
    console.log('[ok] runDownOne loop reverted:', undoneList.join(', '));

    // provably-migrator-built DB -> 0000 down dropped the core tables (exact rollback).
    for (const t of ['journals', 'papers', 'users', 'user_favorites', 'reading_checklist', 'user_notes', 'user_settings']) {
      if (await tableExists(client, t)) throw new Error(`fresh-DB down should have dropped table ${t}`);
    }
    console.log('[ok] exact teardown: core tables gone (disposable, migration-built DB)');

    // --- 5) rebuild from scratch via runUp ---
    const rebuilt = await runUp(client);
    if (rebuilt.length !== 5) throw new Error(`expected rebuild to apply 5, got ${rebuilt.length}`);
    const ready2 = Number((await client.query(`SELECT COUNT(*) c FROM journals WHERE connector_status='ready'`)).rows[0].c);
    if (ready2 !== 7) throw new Error(`rebuild expected 7 ready, got ${ready2}`);
    console.log('[ok] re-up rebuilt schema; ready =', ready2);

    console.log('\n=== runUp EMPTY-DB BOOT GATE PASSED ===');
  } finally {
    await client.end();
    await pg.stop();
  }
}

main().catch((e) => { console.error('RUNUP BOOT GATE FAILED:', e.message); process.exit(1); });
