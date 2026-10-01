// Real-PostgreSQL smoke: forward (x2 idempotent) -> assertions -> down -> re-up,
// plus a real Crossref end-to-end write twice proving DOI upsert idempotency + provenance.
// Uses an embedded, throwaway Postgres (temp dir). Safe; touches no production DB.
import EmbeddedPostgres from 'embedded-postgres';
import { Client } from 'pg';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-pg-'));

const ISSN = '0749-596X'; // Journal of Memory and Language (whitelist)

async function runSteps() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: 54399,
  });
  await pg.initialise();
  await pg.start();
  const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:54399/postgres' });
  await client.connect();
  const q = async (sql: string, params?: any[]) => (await client.query(sql, params)).rows as any[];

  try {
    // --- baseline: prod base schema + a legacy row with a FIXED uuid + linked paper ---
    await client.query(f(join(root, 'deploy', 'migration.sql')));
    await client.query(
      `INSERT INTO journals (id,name,issn,priority) VALUES
        ('11111111-1111-1111-1111-111111111111','Language, Cognition and Neuroscience','2327-3798','P1'),
        ('22222222-2222-2222-2222-222222222222','Language and Cognitive Processes','0169-0965','P2')`,
    );
    await client.query(
      `INSERT INTO papers (journal_id,title,doi,fetched_at) VALUES
        ('11111111-1111-1111-1111-111111111111','legacy paper 1','10.1000/legacy.1', now())`,
    );

    const up = ['0001_sources.up.sql', '0002_reconcile.up.sql', '0003_full_catalog.up.sql'];
    const down = ['0003_full_catalog.down.sql', '0002_reconcile.down.sql', '0001_sources.down.sql'];

    // forward twice (idempotency)
    for (const file of up) { await client.query(f(join(migDir, file))); }
    for (const file of up) { await client.query(f(join(migDir, file))); }
    console.log('[ok] forward up x2 applied (idempotent)');

    // legacy UUID preserved
    const j = await q(`SELECT id FROM journals WHERE issn='2327-3798'`);
    if (j[0].id !== '11111111-1111-1111-1111-111111111111') throw new Error('legacy UUID changed!');
    console.log('[ok] legacy journal UUID preserved:', j[0].id);

    // linked paper still attached
    const link = await q(`SELECT COUNT(*) c FROM papers WHERE journal_id='11111111-1111-1111-1111-111111111111'`);
    console.log('[ok] linked papers preserved:', link[0].c);

    // catalog count + connector status mix
    const counts = await q(`SELECT connector_status, COUNT(*) c FROM journals GROUP BY connector_status ORDER BY 1`);
    console.log('[ok] connector_status counts:', JSON.stringify(counts));
    const total = await q(`SELECT COUNT(*) c FROM journals`);
    console.log('[ok] total journals:', total[0].c);

    // ===== SourcesService.list() equivalent query (catches the SQL syntax error) =====
    const sourcesRows = await q(`
      SELECT
        journals.id, journals.parent_id, journals.name, journals.abbreviation,
        journals.source_type, journals.priority, journals.category, journals.url,
        journals.issn, journals.status, journals.connector_type, journals.connector_status,
        journals.poll_policy, journals.last_synced_at,
        COALESCE((SELECT json_agg(a.alias_name) FROM source_aliases a WHERE a.source_id = journals.id), '[]') AS aliases,
        (SELECT s.status FROM source_sync_runs s WHERE s.source_id = journals.id ORDER BY s.started_at DESC LIMIT 1) AS last_run_status,
        (SELECT s.inserted_count FROM source_sync_runs s WHERE s.source_id = journals.id ORDER BY s.started_at DESC LIMIT 1) AS last_run_inserted
      FROM journals
      ORDER BY journals.priority ASC, journals.name ASC
    `);
    console.log('[ok] /api/sources query executed; rows:', sourcesRows.length);
    const readyN = sourcesRows.filter((r: any) => r.connector_status === 'ready').length;
    const skelN = sourcesRows.filter((r: any) => r.connector_status === 'skeleton').length;
    console.log('[ok] sources ready/skeleton:', readyN, '/', skelN);
    if (readyN !== 7) throw new Error('expected 7 ready sources, got ' + readyN);
    console.log('[ok] sources query returns aliases as array:', Array.isArray(sourcesRows[0].aliases));

    // non-crossref sources must NOT carry a crossref ISSN / be marked skeleton
    const bad = await q(`SELECT name FROM journals WHERE source_type<>'journal' AND connector_type='crossref'`);
    if (bad.length) throw new Error('non-journal wrongly marked crossref: ' + JSON.stringify(bad));
    console.log('[ok] no non-journal faked as crossref');

    const skeletons = await q(`SELECT name, connector_type FROM journals WHERE connector_status='skeleton'`);
    console.log('[ok] skeleton/disabled connectors:', skeletons.length, '(e.g. ' + skeletons.slice(0,3).map(s=>s.name).join(', ') + ')');

    // ===== real Crossref fetch -> upsert twice =====
    const url = `https://api.crossref.org/journals/${ISSN}/works?rows=3&sort=published&order=desc&select=DOI,title,issued,URL&mailto=litradar@example.com`;
    const cr = await fetch(url, { headers: { 'User-Agent': 'LitRadar/1.0' } });
    const body: any = await cr.json();
    const works = body.message.items.slice(0, 3);
    const srcRow = await q(`SELECT id FROM journals WHERE issn='${ISSN}'`);
    const srcId = srcRow[0].id;
    console.log('[ok] real Crossref HTTP', cr.status, 'works:', works.length);

    const upsertOnce = async () => {
      const run = (await q(`INSERT INTO source_sync_runs (source_id, connector_type, status) VALUES ($1,'crossref','running') RETURNING id`, [srcId]))[0];
      for (const w of works) {
        const doi = String(w.DOI).toLowerCase();
        await client.query(
          `INSERT INTO papers (journal_id,title,doi,fetched_at,source_run_id)
           VALUES ($1,$2,$3,now(),$4)
           ON CONFLICT (doi) WHERE doi IS NOT NULL AND doi <> ''
           DO UPDATE SET title=EXCLUDED.title, fetched_at=now(), source_run_id=$4`,
          [srcId, w.title?.[0]?.slice(0,500) || 'untitled', doi, run.id],
        );
      }
      await client.query(`UPDATE source_sync_runs SET status='ok', finished_at=now(), fetched_count=$1 WHERE id=$2`, [works.length, run.id]);
      return run.id;
    };
    const run1 = await upsertOnce();
    const after1 = (await q(`SELECT COUNT(*) c FROM papers WHERE doi LIKE '10.1016%'`))[0].c;
    const run2 = await upsertOnce();
    const after2 = (await q(`SELECT COUNT(*) c FROM papers WHERE doi LIKE '10.1016%'`))[0].c;
    if (after1 !== after2) throw new Error(`idempotency broken: ${after1} -> ${after2}`);
    console.log(`[ok] upsert twice -> rows stable ${after1} == ${after2} (no duplicates)`);

    const runs = await q(`SELECT status, fetched_count FROM source_sync_runs WHERE source_id=$1 ORDER BY started_at`, [srcId]);
    console.log('[ok] source_sync_runs provenance rows:', JSON.stringify(runs));
    const prov = await q(`SELECT doi, source_run_id, fetched_at IS NOT NULL has_fetched FROM papers WHERE source_run_id IS NOT NULL LIMIT 1`);
    console.log('[ok] provenance sample:', JSON.stringify(prov));

    // ===== down then re-up =====
    for (const file of down) { await client.query(f(join(migDir, file))); }
    console.log('[ok] down migrations applied');
    const hasCol = await q(`SELECT 1 FROM information_schema.columns WHERE table_name='journals' AND column_name='connector_status'`);
    if (hasCol.length) throw new Error('connector_status should be dropped after down');
    console.log('[ok] connector_status column removed on down');
    const legacyStill = await q(`SELECT id FROM journals WHERE id='11111111-1111-1111-1111-111111111111'`);
    if (!legacyStill.length) throw new Error('legacy row dropped on down!');
    console.log('[ok] legacy row survives down');

    for (const file of up) { await client.query(f(join(migDir, file))); }
    console.log('[ok] re-up applied cleanly');

    console.log('\n=== REAL POSTGRES SMOKE PASSED ===');
  } finally {
    await client.end();
    await pg.stop();
  }
}

runSteps().catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1); });
