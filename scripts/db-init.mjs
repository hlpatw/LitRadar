// 首次启动自动建表 + 导入预置期刊；重复启动安全，不会重复执行
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[db-init] 缺少 DATABASE_URL 环境变量');
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString,
    ssl: /\.railway\.internal|railway/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  for (let attempt = 1; attempt <= 30; attempt++) {
    try { await client.connect(); break; }
    catch (e) {
      console.log(`[db-init] 等待数据库就绪... (${attempt}/30)`);
      if (attempt === 30) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const { rows } = await client.query(
    "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'journals'"
  );
  const journalsTableExists = rows[0].n > 0;

  if (!journalsTableExists) {
    console.log('[db-init] 首次启动：执行建表 migration.sql ...');
    const migration = await readFile(join(root, 'deploy', 'migration.sql'), 'utf8');
    await client.query(migration);
    console.log('[db-init] 建表完成');
  } else {
    console.log('[db-init] 表已存在，跳过建表');
  }

  const { rows: j } = await client.query('SELECT COUNT(*)::int AS n FROM journals');
  if (Number(j[0].n) === 0) {
    console.log('[db-init] 导入预置期刊数据 seed.sql ...');
    const seed = await readFile(join(root, 'deploy', 'seed.sql'), 'utf8');
    await client.query(seed);
    console.log('[db-init] 数据导入完成');
  } else {
    console.log(`[db-init] journals 已有 ${j[0].n} 条数据，跳过导入`);
  }

  await client.end();
  console.log('[db-init] 数据库初始化检查通过');
}

main().catch(err => {
  console.error('[db-init] 失败：', err);
  process.exit(1);
});
