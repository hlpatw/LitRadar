// Built-artifact (dist) regression over the full authenticated user journey:
//   register/login -> me -> dashboard -> sources -> papers -> checklist -> notes
//   -> settings -> version -> runs -> (no token) 401 -> (bad token) 401.
// Boots embedded Postgres + the compiled Nest app. Safe; touches no production DB.
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
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-e2e-'));
const PORT = 4597;

async function main() {
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54402 });
  await pg.initialise();
  await pg.start();
  const conn = 'postgres://postgres:postgres@localhost:54402/postgres';

  const { Client } = await import('pg');
  const boot = new Client({ connectionString: conn });
  await boot.connect();
  await boot.query(f(join(root, 'deploy', 'migration.sql')));
  for (const m of ['0001_sources.up.sql', '0002_reconcile.up.sql', '0003_full_catalog.up.sql', '0004_correct_issn.up.sql']) {
    await boot.query(f(join(migDir, m)));
  }
  await boot.end();

  process.env.DATABASE_URL = conn;
  process.env.JWT_SECRET = 'e2e-secret-at-least-32-characters-long-xx';
  process.env.SERVER_PORT = String(PORT);

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
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  };

  try {
    const uname = `e2e_${Date.now()}`;
    // 1) register (login surrogate)
    const reg = await call('POST', '/api/auth/register', undefined, {
      username: uname, password: 'password123', email: `${uname}@example.com`,
    });
    if (reg.status !== 201 && reg.status !== 200) throw new Error('register -> ' + reg.status + ' ' + JSON.stringify(reg.data));
    const token = reg.data.token;
    if (!token) throw new Error('no token after register');
    console.log('[ok] register/login -> token issued');

    // 2) me
    const me = await call('GET', '/api/auth/me', token);
    if (me.status !== 200 || me.data.username !== uname) throw new Error('me -> ' + me.status);
    console.log('[ok] /api/auth/me ->', me.data.username);

    // 3) dashboard
    const dash = await call('GET', '/api/workspace/dashboard', token);
    if (dash.status !== 200 || typeof dash.data.paperCount !== 'number') throw new Error('dashboard -> ' + dash.status);
    console.log('[ok] dashboard counts:', JSON.stringify(dash.data));

    // 4) sources
    const src = await call('GET', '/api/sources', token);
    if (src.status !== 200) throw new Error('sources -> ' + src.status);
    const ready = src.data.filter((r: any) => r.connectorStatus === 'ready').length;
    if (ready !== 7) throw new Error('expected 7 ready, got ' + ready);
    console.log('[ok] /api/sources ->', src.data.length, 'entities,', ready, 'ready');

    // 5) papers list + invalid id sanitized (auth boundary: anonymous 401, logged-in 200)
    const anonPapers = await call('GET', '/api/papers');
    if (anonPapers.status !== 401) throw new Error('anonymous GET /api/papers expected 401, got ' + anonPapers.status);
    console.log('[ok] anonymous GET /api/papers -> 401 (intentional inbox boundary)');
    const papers = await call('GET', '/api/papers', token);
    if (papers.status !== 200 || !Array.isArray(papers.data.items)) throw new Error('papers -> ' + papers.status);
    console.log('[ok] authed GET /api/papers ->', papers.data.total, 'papers');
    const badPaper = await call('GET', '/api/papers/not-a-uuid', token);
    if (badPaper.status !== 400) throw new Error('papers/:badid expected 400, got ' + badPaper.status);
    console.log('[ok] /api/papers/not-a-uuid -> 400 sanitized');

    // 6) checklist create/list
    const created = await call('POST', '/api/workspace/checklist', token, { titleOverride: 'Read X', status: 'todo' });
    if (created.status !== 201 && created.status !== 200) throw new Error('create checklist -> ' + created.status);
    const cl = await call('GET', '/api/workspace/checklist', token);
    if (cl.status !== 200 || cl.data.length < 1) throw new Error('list checklist -> ' + cl.status);
    console.log('[ok] checklist create+list ->', cl.data.length, 'items');

    // 7) notes create/list
    const note = await call('POST', '/api/workspace/notes', token, { content: 'note body' });
    if (note.status !== 201 && note.status !== 200) throw new Error('create note -> ' + note.status);
    const notes = await call('GET', '/api/workspace/notes', token);
    if (notes.status !== 200 || notes.data.length < 1) throw new Error('list notes -> ' + notes.status);
    console.log('[ok] notes create+list ->', notes.data.length, 'items');

    // 8) settings put/get
    const set = await call('PUT', '/api/workspace/settings', token, { fieldOfStudy: 'psycholinguistics' });
    if (set.status !== 200 || set.data.fieldOfStudy !== 'psycholinguistics') throw new Error('settings put -> ' + set.status);
    const getSet = await call('GET', '/api/workspace/settings', token);
    if (getSet.status !== 200 || getSet.data.fieldOfStudy !== 'psycholinguistics') throw new Error('settings get -> ' + getSet.status);
    console.log('[ok] settings put+get ->', getSet.data.fieldOfStudy);

    // 9) version (public)
    const ver = await call('GET', '/api/version');
    if (ver.status !== 200 || !ver.data.commit || !ver.data.environment) throw new Error('version -> ' + ver.status);
    console.log('[ok] /api/version ->', ver.data.commit, ver.data.migrationVersion);

    // 10) sync runs (auth)
    const runs = await call('GET', '/api/connectors/runs', token);
    if (runs.status !== 200 || !Array.isArray(runs.data)) throw new Error('runs -> ' + runs.status);
    console.log('[ok] /api/connectors/runs ->', runs.data.length, 'runs');

    // 11) no token -> 401 (logout)
    const noTok = await call('GET', '/api/workspace/dashboard');
    if (noTok.status !== 401) throw new Error('logout: expected 401 without token, got ' + noTok.status);
    console.log('[ok] protected route without token -> 401');

    // 12) bad token -> 401
    const badTok = await call('GET', '/api/workspace/dashboard', 'garbage.token.value');
    if (badTok.status !== 401) throw new Error('expected 401 with bad token, got ' + badTok.status);
    console.log('[ok] protected route with bad token -> 401');

    // 13) admin sync without admin -> 403 (not 200)
    const sync = await call('POST', '/api/connectors/sync-all', token);
    if (sync.status !== 403) throw new Error('non-admin sync-all expected 403, got ' + sync.status);
    console.log('[ok] non-admin manual sync -> 403 (admin-gated)');

    console.log('\n=== E2E FLOW REGRESSION PASSED ===');
  } finally {
    await app.close();
    await pg.stop();
  }
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
