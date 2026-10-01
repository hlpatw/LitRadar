import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Tracked, idempotent migration runner.
 *
 * - up: applies every *.up.sql not yet recorded in `_migrations`, in filename order.
 * - down: reverts the most recently applied migration (reverse order), records it.
 *
 * A `_migrations(name)` table is the source of truth for what has run, so a fresh
 * database applies everything once and an existing database applies only the deltas.
 */
export async function runUp(client: Client): Promise<string[]> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const applied = new Set(
    (await client.query(`SELECT name FROM _migrations`)).rows.map((r) => r.name),
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
  const last = applied[0].name as string; // e.g. 0003_full_catalog.up.sql
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
