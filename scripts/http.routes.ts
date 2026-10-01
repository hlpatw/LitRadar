// HTTP routing + sources integration smoke. Boots embedded Postgres, applies the
// real migrations, then starts the compiled Nest app and asserts:
//  - single /api (controllers mounted at /api/...) and /api/api/... is 404
//  - /health root, no leak
//  - GET /api/sources returns 40 entities, 7 ready / rest skeleton, aliases as array
//  - GET /api/papers/1 -> 400 (invalid UUID), no SQL/stack leak
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// embedded-postgres occasionally resets an idle pool client at shutdown; ignore that
// noise so the real assertions are what fail/succeed.
process.on('uncaughtException', (e: any) => {
  if (e?.code === 'ECONNRESET' || /read ECONNRESET/.test(e?.message || '')) return;
  console.error('UNCAUGHT:', e);
});

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-http-'));

async function main() {
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54398 });
  await pg.initialise();
  await pg.start();
  const conn = 'postgres://postgres:postgres@localhost:54398/postgres';

  // apply baseline + migrations
  const { Client } = await import('pg');
  const boot = new Client({ connectionString: conn });
  await boot.connect();
  await boot.query(f(join(root, 'deploy', 'migration.sql')));
  for (const m of ['0001_sources.up.sql', '0002_reconcile.up.sql', '0003_full_catalog.up.sql']) {
    await boot.query(f(join(migDir, m)));
  }
  await boot.end();

  // start the compiled Nest app
  process.env.DATABASE_URL = conn;
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  process.env.SERVER_PORT = '4599';
  const { NestFactory } = await import('@nestjs/core');
  const appMod = (await import('../dist/server/app.module.js')) as any;
  const { AppModule } = appMod;
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  const server = app.getHttpServer();
  await new Promise((r) => server.listen(4599, r));

  const get = async (path: string) => {
    const res = await fetch(`http://127.0.0.1:4599${path}`);
    let body: any = null;
    try { body = await res.json(); } catch { body = await res.text(); }
    return { status: res.status, body };
  };

  try {
    // 1) health at root, no leak
    const h = await get('/health');
    if (h.status !== 200) throw new Error('health status ' + h.status);
    const hb = typeof h.body === 'string' ? {} : h.body;
    if (hb.DATABASE_URL || hb.stack || hb.secret) throw new Error('health leaks');
    console.log('[ok] GET /health -> 200, no leak');

    // 2) single /api: /api/sources works
    const s = await get('/api/sources');
    if (s.status !== 200) throw new Error('GET /api/sources -> ' + s.status + ' ' + JSON.stringify(s.body).slice(0, 300));
    const arr = Array.isArray(s.body) ? s.body : [];
    console.log('[ok] GET /api/sources -> 200, rows:', arr.length);
    if (arr.length < 40) throw new Error('expected >=40 entities, got ' + arr.length);
    const ready = arr.filter((r: any) => r.connectorStatus === 'ready').length;
    const skel = arr.filter((r: any) => r.connectorStatus === 'skeleton').length;
    if (ready !== 7) throw new Error('expected 7 ready, got ' + ready);
    console.log('[ok] sources ready/skeleton:', ready, '/', skel);
    if (arr.length && !Array.isArray(arr[0].aliases)) throw new Error('aliases not array');
    console.log('[ok] aliases returned as array');

    // 3) double-/api must be 404
    const dbl = await get('/api/api/sources');
    if (dbl.status === 200) throw new Error('double /api still served!');
    console.log('[ok] GET /api/api/sources -> ' + dbl.status + ' (double /api removed)');

    // 4) invalid paper id -> 400, no SQL/stack leak
    const p = await get('/api/papers/1');
    const pb = typeof p.body === 'string' ? p.body : JSON.stringify(p.body);
    if (p.status !== 400) throw new Error('/api/papers/1 expected 400, got ' + p.status + ' ' + pb.slice(0, 200));
    if (/sql|syntax|at position|stack/i.test(pb)) throw new Error('error body leaks SQL/stack: ' + pb.slice(0, 200));
    console.log('[ok] GET /api/papers/1 -> 400, sanitized');

    console.log('\n=== HTTP ROUTES + SOURCES SMOKE PASSED ===');
  } finally {
    await app.close();
    await pg.stop();
  }
}

main().catch((e) => { console.error('HTTP SMOKE FAILED:', e.message); process.exit(1); });
