// Boot-guard tests for the production fail-fast safety net. We spawn the COMPILED
// server (dist/server/main.js) as a child process because the guards run at bootstrap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const mainJs = join(root, 'dist', 'server', 'main.js');

function spawnMain(env: Record<string, string | undefined>) {
  const child = spawn(process.execPath, [mainJs], {
    env: { PATH: process.env.PATH, ...env } as Record<string, string>,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d.toString()));
  child.stderr.on('data', (d) => (out += d.toString()));
  return { child, getOut: () => out };
}

test('production boot FAILS fast when DATABASE_URL is missing', async () => {
  const { child, getOut } = spawnMain({
    NODE_ENV: 'production',
    JWT_SECRET: 'a-very-long-random-token-without-forbidden-words-1234567890',
  });
  const code: number = await new Promise((r) => child.on('exit', r));
  assert.notEqual(code, 0, 'should refuse to boot');
  assert.match(getOut(), /DATABASE_URL is required/i);
});

test('production boot FAILS fast with a weak/default JWT_SECRET', async () => {
  const { child, getOut } = spawnMain({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://user:pass@127.0.0.1:1/nodb', // set, so we reach the JWT guard
    JWT_SECRET: 'secret',
  });
  const code: number = await new Promise((r) => child.on('exit', r));
  assert.notEqual(code, 0, 'should refuse weak JWT');
  assert.match(getOut(), /JWT_SECRET/i);
});

test('staging (NODE_ENV=production, APP_ENV=staging, real DB) boots and reports environment=staging', async () => {
  const EmbeddedPostgres = (await import('embedded-postgres')).default;
  const dataDir = mkdtempSync(join(tmpdir(), 'litradar-boot-'));
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port: 54409 });
  await pg.initialise();
  await pg.start();
  try {
    // Migrations are incremental on the legacy baseline (0001 ALTERs journals/papers).
    // Replicate that baseline here, exactly as the local scripts do.
    const { Client } = await import('pg');
    const boot = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54409/postgres' });
    await boot.connect();
    await boot.query(readFileSync(join(root, 'deploy', 'migration.sql'), 'utf8'));
    await boot.end();

    const { child, getOut } = spawnMain({
      NODE_ENV: 'production',
      APP_ENV: 'staging',
      DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:54409/postgres',
      JWT_SECRET: 'a-very-long-random-token-without-forbidden-words-1234567890',
      SERVER_PORT: '4597',
    });
    // wait for listen
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('boot timed out: ' + getOut())), 20000);
      const iv = setInterval(async () => {
        try {
          const r = await fetch('http://127.0.0.1:4597/api/version');
          if (r.ok) {
            clearTimeout(t); clearInterval(iv);
            const body = await r.json();
            assert.equal(body.environment, 'staging');
            assert.ok(body.migrationsApplied >= 1, 'migrations should have run on the fresh DB');
            resolve();
          }
        } catch { /* not up yet */ }
      }, 500);
      child.on('exit', (c) => { clearTimeout(t); clearInterval(iv); reject(new Error('server exited early code=' + c + ' out=' + getOut())); });
    });
    child.kill();
  } finally {
    await pg.stop();
  }
});
