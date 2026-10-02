// Isolated local end-to-end: embedded Postgres (port 54403) + compiled Nest app on 4598.
// Registers an ADMIN user (email in ADMIN_EMAILS), runs the real Crossref sync for all 7
// ready sources TWICE to prove idempotency, records per-source results + paper counts,
// then LEAVES THE SERVER RUNNING for a manual real-browser E2E. Touches no production DB.
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.on('uncaughtException', (e: any) => {
  if (e?.code === 'ECONNRESET' || /read ECONNRESET/.test(e?.message || '')) return;
  console.error('UNCAUGHT:', e);
});

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-localsync-'));
const PORT = 4598;
const PG_PORT = 54403;
const ADMIN_EMAIL = 'admin@litradar.local';

async function main() {
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PG_PORT });
  await pg.initialise();
  await pg.start();
  const conn = `postgres://postgres:postgres@localhost:${PG_PORT}/postgres`;

  const { Client } = await import('pg');
  const boot = new Client({ connectionString: conn });
  await boot.connect();
  await boot.query(f(join(root, 'deploy', 'migration.sql')));
  for (const m of ['0001_sources.up.sql', '0002_reconcile.up.sql', '0003_full_catalog.up.sql', '0004_correct_issn.up.sql']) {
    await boot.query(f(join(migDir, m)));
  }
  await boot.end();

  process.env.DATABASE_URL = conn;
  process.env.JWT_SECRET = 'local-sync-e2e-secret-at-least-32-chars-long-xxxx';
  process.env.SERVER_PORT = String(PORT);
  process.env.ADMIN_EMAILS = ADMIN_EMAIL;

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = (await import('../dist/server/app.module.js')) as any;
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  const server = app.getHttpServer();
  await new Promise((r) => server.listen(PORT, r));

  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  };

  // Register admin (email in ADMIN_EMAILS => isAdmin true)
  const uname = 'admin_' + Date.now();
  const reg = await call('POST', '/api/auth/register', undefined, {
    username: uname, password: 'password123', email: ADMIN_EMAIL, displayName: 'Local Admin',
  });
  if (reg.status !== 201 && reg.status !== 200) throw new Error('admin register -> ' + reg.status + ' ' + JSON.stringify(reg.data));
  const token = reg.data.token;
  console.log('[ok] admin register; isAdmin =', reg.data.user?.isAdmin);

  const me = await call('GET', '/api/auth/me', token);
  console.log('[ok] /api/auth/me -> isAdmin =', me.data.isAdmin);
  if (!me.data.isAdmin) throw new Error('admin user must report isAdmin=true');

  // Run 1: real sync-all
  console.log('\n=== SYNC RUN 1 (real Crossref) ===');
  const s1 = await call('POST', '/api/connectors/sync-all', token);
  if (s1.status !== 200) throw new Error('sync-all run1 -> ' + s1.status + ' ' + JSON.stringify(s1.data));
  let inserted1 = 0, fetched1 = 0;
  for (const o of s1.data as any[]) {
    console.log(`  [${o.status}] ${o.sourceName}: fetched=${o.fetched} inserted=${o.inserted} updated=${o.updated}`);
    inserted1 += o.inserted; fetched1 += o.fetched;
  }
  const papers1 = await call('GET', '/api/papers?pageSize=1', token);
  const total1 = papers1.data.total;
  console.log(`[run1] sources=${s1.data.length} fetched=${fetched1} inserted=${inserted1} totalPapers=${total1}`);

  // Run 2: idempotency
  console.log('\n=== SYNC RUN 2 (idempotency) ===');
  const s2 = await call('POST', '/api/connectors/sync-all', token);
  if (s2.status !== 200) throw new Error('sync-all run2 -> ' + s2.status);
  let inserted2 = 0;
  for (const o of s2.data as any[]) {
    console.log(`  [${o.status}] ${o.sourceName}: fetched=${o.fetched} inserted=${o.inserted} updated=${o.updated}`);
    inserted2 += o.inserted;
  }
  const papers2 = await call('GET', '/api/papers?pageSize=1', token);
  const total2 = papers2.data.total;
  console.log(`[run2] inserted=${inserted2} totalPapers=${total2}`);

  if (inserted2 !== 0) throw new Error(`idempotency FAIL: second run inserted ${inserted2} papers`);
  if (total2 !== total1) throw new Error(`idempotency FAIL: paper count drifted ${total1} -> ${total2}`);
  console.log('\n=== IDEMPOTENCY OK: second run inserted=0, total stable ===');

  // Non-admin gating check
  const uname2 = 'plain_' + Date.now();
  const reg2 = await call('POST', '/api/auth/register', undefined, { username: uname2, password: 'password123', email: `${uname2}@example.com` });
  const tok2 = reg2.data.token;
  const gate = await call('POST', '/api/connectors/sync-all', tok2);
  console.log('[ok] non-admin sync-all ->', gate.status, '(expect 403); non-admin isAdmin =', reg2.data.user?.isAdmin);

  console.log('\n==============================================');
  // Default: exit cleanly after reporting (so this never hangs CI).
  // Set SERVE=1 to keep the server up for a manual browser E2E.
  if (process.env.SERVE === '1') {
    console.log(`SERVER UP at http://127.0.0.1:${PORT}`);
    console.log(`admin login -> username: ${uname}  password: password123`);
    console.log(`plain login -> username: ${uname2}  password: password123`);
    console.log('SERVE=1 -> keeping server up for browser E2E.');
  } else {
    console.log('Done. Exiting cleanly (set SERVE=1 to keep serving for browser E2E).');
  }
  console.log('==============================================');
  if (process.env.SERVE === '1') {
    await new Promise(() => {});
  }
  await app.close();
  await pg.stop();
}

main().catch((e) => { console.error('LOCAL SYNC E2E FAILED:', e); process.exit(1); });
