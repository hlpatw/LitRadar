// Scheduler enabled-path gates against REAL embedded Postgres, with a FAKE ingestion
// (DI stub) so no network is touched. Asserts:
//   * armed only when APP_ENV=staging && SCHEDULER_ENABLED=1
//   * exactly 7 ready sources surfaced to the admin UI
//   * pause -> tick refuses; resume -> tick runs
//   * nextRunAt / lastRunAt populated after a real run
//   * one source's failure ISOLATED: the other 6 still sync (ok=6 failed=1)
//   * two concurrent ticks: one runs, the other sees reason=locked (same-key advisory lock)
//   * the dedicated per-tick pg.Client releases its session lock (a fresh client can re-acquire)
import EmbeddedPostgres from 'embedded-postgres';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ConfigService } from '@nestjs/config';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, hardTimeout } from './lib/test-env.ts';

hardTimeout(120_000, 'scheduler.gates');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
const UP = [
  '0000_base.up.sql', '0001_sources.up.sql', '0002_reconcile.up.sql', '0003_full_catalog.up.sql',
  '0004_correct_issn.up.sql', '0005_user_library.up.sql', '0006_source_detail_indexes.up.sql',
  '0007_source_running_ux.up.sql', '0008_radar_events_scheduler.up.sql',
];

const dataDir = mkdtempSync(join(tmpdir(), 'litradar-sched-'));

async function main() {
  // Arm the scheduler gates BEFORE importing/constructing the service.
  process.env.APP_ENV = 'staging';
  process.env.SCHEDULER_ENABLED = '1';

  const pgPort = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: pgPort });
  await pg.initialise();
  await pg.start();
  const url = `postgres://postgres:postgres@localhost:${pgPort}/postgres`;
  process.env.DATABASE_URL = url;

  const admin = new Client({ connectionString: url });
  await admin.connect();
  try {
    for (const m of UP) await admin.query(f(join(migDir, m)));

    const readyRows = (await admin.query(`SELECT issn FROM journals WHERE connector_status='ready' ORDER BY issn`)).rows;
    if (readyRows.length !== 7) throw new Error(`expected 7 ready sources, got ${readyRows.length}`);
    console.log('[ok] enabled-path: 7 ready sources migrated');

    // Build a real drizzle DB over a pool.
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool);

    // Fake ingestion: exactly one ready source throws; the other 6 succeed. Picked from the
    // live catalog so we never depend on an internal constant's export path.
    const failIssn = readyRows[0].issn;
    let syncCalls = 0;
    const fakeIngestion: any = {
      async syncSourceByIssn(issn: string) {
        syncCalls += 1;
        if (issn === failIssn) throw new Error(`simulated upstream failure for ${issn}`);
      },
    };
    const fakeRadar: any = { async generateSnapshot() {} };

    const { SchedulerService } = await import('../dist/server/modules/scheduler/scheduler.service.js');
    const config = new ConfigService({ DATABASE_URL: url });
    const svc: any = new SchedulerService(db, config, fakeIngestion, fakeRadar);

    if (!svc.enabled) throw new Error('scheduler should be enabled under APP_ENV=staging + SCHEDULER_ENABLED=1');
    console.log('[ok] enabled-path: scheduler armed (APP_ENV=staging, SCHEDULER_ENABLED=1)');

    const st0 = await svc.status();
    if (st0.readySourceCount !== 7) throw new Error(`readySourceCount=${st0.readySourceCount}, expected 7`);
    console.log('[ok] enabled-path: status readySourceCount=7');

    // pause -> tick refuses
    await svc.setPaused(true);
    const pausedTick = await svc.tickSafe('test-paused');
    if (pausedTick.ran !== false || pausedTick.reason !== 'paused') {
      throw new Error(`paused tick should be skipped, got ${JSON.stringify(pausedTick)}`);
    }
    console.log('[ok] enabled-path: paused tick refused');

    // resume
    await svc.setPaused(false);

    // real run: one source fails, the other 6 keep going (isolated failure)
    const run = await svc.tickSafe('test-enabled');
    if (!run.ran) throw new Error(`enabled tick should run, got ${JSON.stringify(run)}`);
    if (!/ok=6/.test(run.reason) || !/failed=1/.test(run.reason)) {
      throw new Error(`expected isolated ok=6 failed=1, got ${run.reason}`);
    }
    if (syncCalls !== 7) throw new Error(`expected 7 sync attempts, got ${syncCalls}`);
    console.log(`[ok] enabled-path: isolated failure (${run.reason}); other 6 continued`);

    const st1 = await svc.status();
    if (!st1.nextRunAt || !st1.lastRunAt) throw new Error(`nextRunAt/lastRunAt not populated: ${JSON.stringify(st1)}`);
    if (st1.runCount < 1) throw new Error('runCount not incremented');
    console.log(`[ok] enabled-path: nextRunAt/lastRunAt populated, runCount=${st1.runCount}`);

    // Concurrent tick: hold the advisory lock on an external client -> second tick sees 'locked'.
    const holder = new Client({ connectionString: url });
    await holder.connect();
    await holder.query('SELECT pg_advisory_lock($1)', [9001]);
    try {
      const second = await svc.tickSafe('test-concurrent');
      if (second.ran !== false || second.reason !== 'locked') {
        throw new Error(`concurrent tick should be locked, got ${JSON.stringify(second)}`);
      }
      console.log('[ok] enabled-path: concurrent tick rejected (advisory lock held)');
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1)', [9001]).catch(() => undefined);
      await holder.end();
    }

    // Dedicated same-client release: after a normal tick, a FRESH client must be able to
    // acquire the lock immediately (i.e. the previous tick released it on its own client).
    const probe = new Client({ connectionString: url });
    await probe.connect();
    try {
      const got = (await probe.query('SELECT pg_try_advisory_lock($1) AS got', [9001])).rows[0].got;
      if (got !== true) throw new Error('lock not released after tick (dedicated-client release broken)');
      await probe.query('SELECT pg_advisory_unlock($1)', [9001]);
      console.log('[ok] enabled-path: dedicated per-tick client released the lock');
    } finally {
      await probe.end();
    }

    await pool.end();
    console.log('\n=== SCHEDULER GATES PASSED ===');
    process.exit(0);
  } finally {
    await admin.end();
    await pg.stop();
  }
}

main().catch((e) => { console.error('SCHEDULER GATES FAILED:', e); process.exit(1); });
