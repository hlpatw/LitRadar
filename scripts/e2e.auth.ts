// Auth-focused E2E (embedded Postgres + compiled Nest app). Locks in the staging auth fix:
//   * password < 8 (the old 6-char client allowance) -> 400, with a translated validation envelope
//   * 7-char password still rejected (boundary is 8)
//   * invalid email -> 400
//   * duplicate username -> 409 "用户名已存在"; duplicate email -> 409 "邮箱已被注册"
//   * successful register -> 201 with token (auto-login) + /auth/me works
//   * logout (drop token) -> protected API 401
//   * re-login with username/password -> 200 token
// Safe; touches no production DB. Requires `npm run build` first (imports dist/server).
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, hardTimeout } from './lib/test-env.ts';

process.on('uncaughtException', (e: any) => {
  if (e?.code === 'ECONNRESET' || /read ECONNRESET/.test(e?.message || '')) return;
  console.error('UNCAUGHT:', e);
});

hardTimeout(120_000, 'e2e.auth');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-auth-e2e-'));

function passwordRulesFromDetails(details: unknown): string[] {
  if (typeof details !== 'string') return [];
  try {
    const parsed = JSON.parse(details);
    return Array.isArray(parsed?.message) ? parsed.message : [];
  } catch {
    return [];
  }
}

async function main() {
  const pgPort = await freePort();
  const appPort = await freePort();
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: pgPort });
  await pg.initialise();
  await pg.start();
  const conn = `postgres://postgres:postgres@localhost:${pgPort}/postgres`;

  const { Client } = await import('pg');
  const boot = new Client({ connectionString: conn });
  await boot.connect();
  for (const m of ['0000_base.up.sql', '0001_sources.up.sql', '0002_reconcile.up.sql', '0003_full_catalog.up.sql', '0004_correct_issn.up.sql', '0005_user_library.up.sql', '0006_source_detail_indexes.up.sql', '0007_source_running_ux.up.sql', '0008_radar_events_scheduler.up.sql']) {
    await boot.query(f(join(migDir, m)));
  }
  await boot.end();

  process.env.DATABASE_URL = conn;
  process.env.JWT_SECRET = 'auth-e2e-secret-at-least-32-characters-long';
  process.env.SERVER_PORT = String(appPort);
  process.env.ADMIN_EMAILS = 'admin-auth@example.com';

  const { NestFactory } = await import('@nestjs/core');
  const { ValidationPipe } = await import('@nestjs/common');
  const { AppModule } = (await import('../dist/server/app.module.js')) as any;
  const app = await NestFactory.create(AppModule, { logger: false });
  // Mirror production (main.ts): DTO validation MUST be on, or short passwords slip
  // through as 201. The harness boots AppModule directly, so main.ts's global pipe
  // is not applied automatically.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const server = app.getHttpServer();
  await new Promise((r) => server.listen(appPort, r));

  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`http://127.0.0.1:${appPort}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  };

  try {
    const stamp = Date.now();
    const username = `auth_${stamp}`;
    const email = `${username}@example.com`;

    // 1) 6-char password (the old client allowance) -> 400, validation envelope unwraps
    const short6 = await call('POST', '/api/auth/register', undefined, {
      username: `${username}_6`, password: 'abc123', email: `${username}_6@example.com`,
    });
    if (short6.status !== 400) throw new Error('6-char password should 400, got ' + short6.status);
    const rules6 = passwordRulesFromDetails(short6.data?.error?.details);
    if (!rules6.some((r: string) => /password/.test(r))) throw new Error('6-char pw: details missing password rule: ' + JSON.stringify(short6.data));
    console.log('[ok] 6-char password -> 400; validation details:', rules6.join(' | '));

    // 2) 7-char password (boundary: must still be rejected; 8 is the floor)
    const short7 = await call('POST', '/api/auth/register', undefined, {
      username: `${username}_7`, password: 'abc1234', email: `${username}_7@example.com`,
    });
    if (short7.status !== 400) throw new Error('7-char password should 400, got ' + short7.status);
    console.log('[ok] 7-char password -> 400 (floor is 8)');

    // 3) invalid email -> 400
    const badEmail = await call('POST', '/api/auth/register', undefined, {
      username: `${username}_e`, password: 'password123', email: 'not-an-email',
    });
    if (badEmail.status !== 400) throw new Error('invalid email should 400, got ' + badEmail.status);
    const emailRules = passwordRulesFromDetails(badEmail.data?.error?.details);
    if (!emailRules.some((r: string) => /email/.test(r))) throw new Error('invalid email rule missing: ' + JSON.stringify(badEmail.data));
    console.log('[ok] invalid email -> 400; validation details:', emailRules.join(' | '));

    // 4) successful register -> 201 + token (auto-login)
    const reg = await call('POST', '/api/auth/register', undefined, { username, password: 'password123', email });
    if (reg.status !== 201 && reg.status !== 200) throw new Error('register -> ' + reg.status + ' ' + JSON.stringify(reg.data));
    const token = reg.data.token;
    if (!token) throw new Error('register must return a token (auto-login), got: ' + JSON.stringify(reg.data));
    if (reg.data.user.username !== username || reg.data.user.email !== email) throw new Error('register user shape wrong');
    console.log('[ok] register -> token issued (auto-login), user =', reg.data.user.username);

    // 4b) token works immediately on /auth/me
    const me = await call('GET', '/api/auth/me', token);
    if (me.status !== 200 || me.data.username !== username) throw new Error('post-register /auth/me -> ' + me.status);
    console.log('[ok] auto-login token authorizes /auth/me');

    // 5) duplicate username -> 409 with the server's Chinese conflict message
    const dupName = await call('POST', '/api/auth/register', undefined, {
      username, password: 'password123', email: `other_${stamp}@example.com`,
    });
    if (dupName.status !== 409) throw new Error('duplicate username should 409, got ' + dupName.status);
    if (dupName.data?.error?.message !== '用户名已存在') throw new Error('duplicate username message wrong: ' + JSON.stringify(dupName.data));
    console.log('[ok] duplicate username -> 409:', dupName.data.error.message);

    // 6) duplicate email -> 409
    const dupEmail = await call('POST', '/api/auth/register', undefined, {
      username: `other_${stamp}`, password: 'password123', email,
    });
    if (dupEmail.status !== 409) throw new Error('duplicate email should 409, got ' + dupEmail.status);
    if (dupEmail.data?.error?.message !== '邮箱已被注册') throw new Error('duplicate email message wrong: ' + JSON.stringify(dupEmail.data));
    console.log('[ok] duplicate email -> 409:', dupEmail.data.error.message);

    // 7) logout (drop the token) -> protected API must 401
    const noTok = await call('GET', '/api/workspace/dashboard');
    if (noTok.status !== 401) throw new Error('protected route without token should 401, got ' + noTok.status);
    console.log('[ok] logout (no token) -> protected route 401');

    // 8) re-login with username + password -> 200 + fresh token
    const relog = await call('POST', '/api/auth/login', undefined, { username, password: 'password123' });
    if (relog.status !== 200 && relog.status !== 201) throw new Error('re-login -> ' + relog.status);
    if (!relog.data.token) throw new Error('re-login must return a token');
    const reloggedMe = await call('GET', '/api/auth/me', relog.data.token);
    if (reloggedMe.status !== 200 || reloggedMe.data.username !== username) throw new Error('re-login token invalid');
    console.log('[ok] re-login -> fresh token authorizes /auth/me');

    // 9) wrong password -> 401 (client maps to 用户名或密码错误; no raw 401 in body)
    const badPw = await call('POST', '/api/auth/login', undefined, { username, password: 'wrong-password' });
    if (badPw.status !== 401) throw new Error('wrong password should 401, got ' + badPw.status);
    if (badPw.data?.error?.message !== '用户名或密码错误') throw new Error('bad-password message wrong: ' + JSON.stringify(badPw.data));
    console.log('[ok] wrong password -> 401:', badPw.data.error.message);

    console.log('\n=== AUTH E2E PASSED ===');
  } finally {
    await app.close();
    await pg.stop();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('AUTH E2E FAILED:', e.message); process.exit(1); });
