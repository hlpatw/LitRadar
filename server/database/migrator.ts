import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

/**
 * Locate the migrations directory, robust to nest/SWC asset path differences.
 * __dirname in prod = dist/server/database. Try the likely layouts in priority order.
 */
function resolveMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'migrations'), // expected: dist/server/database/migrations
    join(here, 'migrations', 'database', 'migrations'), // nest outDir doubling
    join(here, '..', '..', 'database', 'migrations'), // dist/database/migrations
    join(process.cwd(), 'server', 'database', 'migrations'), // ts/node dev
  ];
  for (const c of candidates) {
    const abs = resolve(c);
    if (existsSync(abs) && readdirSync(abs).some((f) => f.endsWith('.up.sql'))) {
      return abs;
    }
  }
  throw new Error(`Could not locate migrations dir; tried: ${candidates.join(', ')}`);
}

const MIGRATIONS_DIR = resolveMigrationsDir();

/**
 * Tracked, idempotent migration runner.
 *  up: applies every *.up.sql not yet recorded in `_migrations`, in filename order.
 *  down: reverts the most recently applied migration (reverse order).
 */
export async function runUp(client: Client): Promise<string[]> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const applied = new Set(
    (await client.query(`SELECT name FROM _migrations`)).rows.map((r: any) => r.name),
  );
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.up.sql')).sort();
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = (await import('node:fs')).readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [f]);
      await client.query('COMMIT');
      ran.push(f);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  return ran;
}

export async function runDownOne(client: Client): Promise<string | null> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const applied = (await client.query(`SELECT name FROM _migrations ORDER BY applied_at DESC, name DESC`)).rows;
  if (applied.length === 0) return null;
  const last = applied[0].name as string;
  const downFile = last.replace(/\.up\.sql$/, '.down.sql');
  const sql = (await import('node:fs')).readFileSync(join(MIGRATIONS_DIR, downFile), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(`DELETE FROM _migrations WHERE name=$1`, [last]);
    await client.query('COMMIT');
    return last;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
