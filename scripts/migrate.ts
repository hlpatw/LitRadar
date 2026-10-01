// Migration runner: applies server/database/migrations against DATABASE_URL.
// Usage: node --experimental-strip-types scripts/migrate.ts up|down
// Idempotent: up.sql files use IF NOT EXISTS and can be re-run safely.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'server', 'database', 'migrations');

async function main() {
  const cmd = process.argv[2] || 'up';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const wantUp = cmd === 'up';
      const isUp = f.endsWith('.up.sql');
      if (wantUp !== isUp) continue;
      const sql = readFileSync(join(dir, f), 'utf8');
      console.log(`[migrate:${cmd}] applying ${f}`);
      await client.query(sql);
    }
    console.log(`[migrate:${cmd}] done`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
