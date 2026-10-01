// CLI migration runner: up | down | reset.
// Usage: DATABASE_URL=... node --experimental-strip-types scripts/migrate.ts up
import { Client } from 'pg';
import { runUp, runDownOne } from '../server/database/migrator.ts';

async function main() {
  const cmd = process.argv[2] || 'up';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (cmd === 'up') {
      const ran = await runUp(client);
      console.log(ran.length ? `[migrate] applied: ${ran.join(', ')}` : '[migrate] already up to date');
    } else if (cmd === 'down') {
      const undone = await runDownOne(client);
      console.log(undone ? `[migrate] reverted: ${undone}` : '[migrate] nothing to revert');
    } else if (cmd === 'reset') {
      for (;;) {
        const undone = await runDownOne(client);
        if (!undone) break;
        console.log(`[migrate] reverted: ${undone}`);
      }
    } else {
      throw new Error(`unknown cmd ${cmd}`);
    }
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
