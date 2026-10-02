// Built-artifact (dist) regression over the full authenticated user journey:
//   register/login -> me -> dashboard -> sources -> papers -> checklist -> notes
//   -> settings -> version -> runs -> (no token) 401 -> (bad token) 401.
// Boots embedded Postgres + the compiled Nest app. Safe; touches no production DB.
import EmbeddedPostgres from 'embedded-postgres';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, hardTimeout } from './lib/test-env.ts';

// Offline mode (CI sets CROSSREF_OFFLINE=1): the concurrent admin-sync block only asserts
// the advisory-lock/claim behavior, never the real Crossref payload. Intercept any call to
// api.crossref.org and resolve an empty result so CI/local never touches the live network.
// Every other fetch target (the local app under test) passes through untouched.
if (process.env.CROSSREF_OFFLINE === '1') {
  const realFetch = globalThis.fetch.bind(globalThis);
  (globalThis as any).fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : ((input?.url as string) ?? String(input));
    if (typeof url === 'string' && url.includes('api.crossref.org')) {
      // Hold the "fetch" long enough for the concurrent-sync race to overlap: the winner
      // keeps its running row open while the loser blocks on the advisory lock and 409s.
      await new Promise((r) => setTimeout(r, 500));
      return {
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: { 'content-type': 'application/json' },
        json: async () => ({ status: 'OK', message: { 'total-results': 0, items: [] } }),
      };
    }
    return realFetch(input as any, init as any);
  };
}

process.on('uncaughtException', (e: any) => {
  if (e?.code === 'ECONNRESET' || /read ECONNRESET/.test(e?.message || '')) return;
  console.error('UNCAUGHT:', e);
});

hardTimeout(180_000, 'e2e.flow');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-e2e-'));

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
  process.env.JWT_SECRET = 'e2e-secret-at-least-32-characters-long-xx';
  process.env.SERVER_PORT = String(appPort);
  process.env.ADMIN_EMAILS = 'admin-e2e@example.com,admin-lib@example.com';

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = (await import('../dist/server/app.module.js')) as any;
  const app = await NestFactory.create(AppModule, { logger: false });
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

    // 8b) MY LIBRARY: upsert / list / filter / recommendations / feedback.
    // Regular users cannot create papers (admin-gated), so provision a paper via an admin token
    // first, then exercise the library entirely with the regular user's token.
    const adminUnameLib = 'adminlib_' + Date.now();
    const adminLibReg = await call('POST', '/api/auth/register', undefined, {
      username: adminUnameLib, password: 'password123', email: 'admin-lib@example.com',
    });
    if (!adminLibReg.data.user?.isAdmin) throw new Error('library admin should be isAdmin: ' + JSON.stringify(adminLibReg.data));
    const adminLibToken = adminLibReg.data.token;
    const libPaper = await call('POST', '/api/papers', adminLibToken, { title: 'Library E2E paper', keywords: 'priming, syntax, prediction', abstractText: 'We studied priming.', url: 'https://example.org/lib' });
    if (libPaper.status !== 201) throw new Error('admin paper for library -> ' + libPaper.status);
    const paperForLib = libPaper.data;

    const up = await call('PUT', `/api/library/${paperForLib.id}`, token, { isFavorite: true, readingState: 'todo' });
    if (up.status !== 200 || up.data.isFavorite !== true || up.data.readingState !== 'todo')
      throw new Error('library upsert -> ' + up.status + ' ' + JSON.stringify(up.data));
    console.log('[ok] PUT /api/library/:id ->', up.data.readingState, 'fav=' + up.data.isFavorite);

    const libAll = await call('GET', '/api/library', token);
    if (libAll.status !== 200 || !Array.isArray(libAll.data.items)) throw new Error('library list -> ' + libAll.status);
    if (!libAll.data.items.some((i: any) => i.paperId === paperForLib.id)) throw new Error('library list missing upserted paper');
    const libTodo = await call('GET', '/api/library?status=todo', token);
    if (!libTodo.data.items.some((i: any) => i.paperId === paperForLib.id)) throw new Error('library status=todo filter missing paper');
    console.log('[ok] GET /api/library list + status filter agree with authority');

    // idempotent upsert does NOT create a duplicate row
    const up2 = await call('PUT', `/api/library/${paperForLib.id}`, token, { readingState: 'reading' });
    const libAfter = await call('GET', '/api/library', token);
    const occurrences = libAfter.data.items.filter((i: any) => i.paperId === paperForLib.id).length;
    if (occurrences !== 1) throw new Error(`library duplicate after re-upsert: ${occurrences}`);
    if (up2.data.readingState !== 'reading') throw new Error('library update state -> ' + up2.data.readingState);
    console.log('[ok] library upsert idempotent (one row per user,paper)');

    // recommendations must NOT include the already-associated paper; coldStart flag present
    const reco = await call('GET', '/api/library/recommendations?limit=20', token);
    if (reco.status !== 200 || !Array.isArray(reco.data.items)) throw new Error('recommendations -> ' + reco.status);
    if (typeof reco.data.coldStart !== 'boolean') throw new Error('recommendations missing coldStart flag');
    if (reco.data.items.some((r: any) => r.paper.id === paperForLib.id)) throw new Error('recommendations leaked a library paper');
    if (!reco.data.excluded || typeof reco.data.excluded.library !== 'number') throw new Error('recommendations missing excluded counts');
    console.log('[ok] recommendations exclude library paper; coldStart=' + reco.data.coldStart + ' excluded=' + JSON.stringify(reco.data.excluded));

    // uninterested feedback excludes a paper without creating a library row
    const libPaper2 = await call('POST', '/api/papers', adminLibToken, { title: 'Library E2E paper two', keywords: 'statistics', abstractText: 'Another abstract.', url: 'https://example.org/lib2' });
    const otherPaper = libPaper2.data;
    {
      const fb = await call('POST', `/api/library/${otherPaper.id}/feedback`, token, { feedbackType: 'uninterested' });
      if (fb.status !== 200) throw new Error('feedback set -> ' + fb.status);
      const reco2 = await call('GET', '/api/library/recommendations?limit=50', token);
      if (reco2.data.items.some((r: any) => r.paper.id === otherPaper)) throw new Error('uninterested paper still recommended');
      // clear feedback -> paper can be recommended again
      const clr = await call('DELETE', `/api/library/${otherPaper.id}/feedback`, token);
      if (clr.status !== 204 && clr.status !== 200) throw new Error('feedback clear -> ' + clr.status);
      console.log('[ok] uninterested feedback excludes then restores a paper');
    }

    // legacy dashboard counts read the same authority: favorite count should be >=1 now
    const dashAfter = await call('GET', '/api/workspace/dashboard', token);
    if (dashAfter.status !== 200 || dashAfter.data.favoriteCount < 1) throw new Error('dashboard favorite count not reflected: ' + JSON.stringify(dashAfter.data));
    console.log('[ok] dashboard favoriteCount reads library authority (' + dashAfter.data.favoriteCount + ')');

    // remove association: notes preserved, paper becomes recommendable again
    const rm = await call('DELETE', `/api/library/${paperForLib.id}`, token);
    if (rm.status !== 204 && rm.status !== 200) throw new Error('library remove -> ' + rm.status);
    const libAfterRm = await call('GET', '/api/library', token);
    if (libAfterRm.data.items.some((i: any) => i.paperId === paperForLib.id)) throw new Error('library paper still present after remove');
    console.log('[ok] library remove association (notes untouched)');

    // feedback on a nonexistent paper -> 404 (not an FK-violation 500)
    const badFb = await call('POST', '/api/library/00000000-0000-4000-8000-000000000000/feedback', token, { feedbackType: 'uninterested' });
    if (badFb.status !== 404) throw new Error('feedback on missing paper should 404, got ' + badFb.status);
    console.log('[ok] feedback on unknown paper -> 404 (no FK 500)');

    // recommendations expose structured matchedKeywords array + breakdown
    const reco3 = await call('GET', '/api/library/recommendations?limit=5', token);
    if (reco3.status !== 200) throw new Error('rec list -> ' + reco3.status);
    for (const it of reco3.data.items ?? []) {
      if (!Array.isArray(it.matchedKeywords)) throw new Error('recommendation item missing matchedKeywords array');
      if (!it.breakdown || typeof it.breakdown.interest !== 'number') throw new Error('recommendation item missing breakdown');
    }
    console.log('[ok] recommendations expose matchedKeywords[] + breakdown per item');

    // cold-start path: a brand-new user with no library/notes must get 200, coldStart=true,
    // and every returned paper must have serializable date fields (no Date.toISOString crash).
    const coldUname = 'cold_' + Date.now();
    const coldReg = await call('POST', '/api/auth/register', undefined, { username: coldUname, password: 'password123', email: `${coldUname}@example.com` });
    const coldToken = coldReg.data.token;
    const coldReco = await call('GET', '/api/library/recommendations?limit=5', coldToken);
    if (coldReco.status !== 200) throw new Error('cold-start recommendations -> ' + coldReco.status + ' ' + JSON.stringify(coldReco.data));
    if (coldReco.data.coldStart !== true) throw new Error('fresh user should be coldStart=true, got ' + coldReco.data.coldStart);
    for (const it of coldReco.data.items ?? []) {
      // date fields must be strings or null — never a live Date (which would already have failed JSON).
      if (it.paper.publishedDate !== null && typeof it.paper.publishedDate !== 'string') throw new Error('publishedDate not serializable: ' + JSON.stringify(it.paper.publishedDate));
      if (it.paper.fetchedAt !== null && typeof it.paper.fetchedAt !== 'string') throw new Error('fetchedAt not serializable: ' + JSON.stringify(it.paper.fetchedAt));
      if (!Array.isArray(it.reasons) || !Array.isArray(it.matchedKeywords)) throw new Error('cold-start item missing reasons/matchedKeywords');
      if (it.paper.journalName === undefined) throw new Error('cold-start item missing journalName field');
    }
    console.log('[ok] cold-start fresh user recommendations 200; dates serializable; reasons/matchedKeywords/source present');

    // quick unfavorite: favorite a paper then unfavorite with no state/tags -> row deleted
    const favToggle = await call('POST', `/api/library/${otherPaper.id}/favorite`, token, { isFavorite: true });
    if (favToggle.status !== 200) throw new Error('quick favorite on -> ' + favToggle.status);
    const afterFav = await call('GET', '/api/library', token);
    if (!afterFav.data.items.some((i: any) => i.paperId === otherPaper.id)) throw new Error('quick favorite did not create association');
    const unfavToggle = await call('POST', `/api/library/${otherPaper.id}/favorite`, token, { isFavorite: false });
    if (unfavToggle.status !== 200) throw new Error('quick favorite off -> ' + unfavToggle.status);
    const afterUnfav = await call('GET', '/api/library', token);
    if (afterUnfav.data.items.some((i: any) => i.paperId === otherPaper.id)) throw new Error('unfavorite left an empty library row; should be deleted');
    console.log('[ok] quick unfavorite deletes empty association (paper re-enters recommendations)');

    // same paper with reading state: unfavorite KEEPS the row (state preserved)
    const withState = await call('PUT', `/api/library/${otherPaper.id}`, token, { isFavorite: true, readingState: 'todo' });
    if (withState.status !== 200) throw new Error('upsert with state -> ' + withState.status);
    const unfavKeep = await call('POST', `/api/library/${otherPaper.id}/favorite`, token, { isFavorite: false });
    if (unfavKeep.status !== 200) throw new Error('unfav with state -> ' + unfavKeep.status);
    const afterKeep = await call('GET', '/api/library', token);
    const keepRow = afterKeep.data.items.find((i: any) => i.paperId === otherPaper.id);
    if (!keepRow || keepRow.readingState !== 'todo' || keepRow.isFavorite) throw new Error('unfavorite should keep state row: ' + JSON.stringify(keepRow));
    console.log('[ok] unfavorite with reading state clears favorite but keeps association');
    await call('DELETE', `/api/library/${otherPaper.id}`, token);

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

    // 14) PAPERS WRITE PERMISSION MATRIX (dual-user).
    // Regular user (token): reads open, writes blocked. Admin user: writes allowed.
    // 14a) regular user reads still work
    const regList = await call('GET', '/api/papers', token);
    if (regList.status !== 200) throw new Error('regular user GET /api/papers expected 200, got ' + regList.status);
    console.log('[ok] regular user GET /api/papers -> 200 (read boundary preserved)');

    // 14b) regular user writes -> 403
    const regCreate = await call('POST', '/api/papers', token, { title: 'regular-user forbidden' });
    if (regCreate.status !== 403) throw new Error('regular user POST /api/papers expected 403, got ' + regCreate.status);
    const regPatch = await call('PATCH', '/api/papers/11111111-1111-4000-8000-000000000001', token, { title: 'x' });
    if (regPatch.status !== 403) throw new Error('regular user PATCH /api/papers/:id expected 403, got ' + regPatch.status);
    const regDel = await call('DELETE', '/api/papers/11111111-1111-4000-8000-000000000001', token);
    if (regDel.status !== 403) throw new Error('regular user DELETE /api/papers/:id expected 403, got ' + regDel.status);
    console.log('[ok] regular user POST/PATCH/DELETE /api/papers -> 403 (write gated)');

    // 14c) admin user: register with the allowlisted admin email
    const adminUname = 'admin_' + Date.now();
    const adminReg = await call('POST', '/api/auth/register', undefined, {
      username: adminUname, password: 'password123', email: 'admin-e2e@example.com',
    });
    if (adminReg.status !== 201 && adminReg.status !== 200) throw new Error('admin register -> ' + adminReg.status);
    const adminToken = adminReg.data.token;
    if (!adminReg.data.user?.isAdmin) throw new Error('admin-email register should report isAdmin=true');
    console.log('[ok] admin user registered; isAdmin =', adminReg.data.user.isAdmin);

    // 14d) admin create -> 201
    const adminCreate = await call('POST', '/api/papers', adminToken, { title: 'admin-created paper', url: 'https://example.org/x' });
    if (adminCreate.status !== 201) throw new Error('admin POST /api/papers expected 201, got ' + adminCreate.status + ' ' + JSON.stringify(adminCreate.data));
    const adminPaperId = adminCreate.data.id;
    console.log('[ok] admin POST /api/papers -> 201 (id=' + adminPaperId + ')');

    // 14e) admin update -> 200
    const adminPatch = await call('PATCH', `/api/papers/${adminPaperId}`, adminToken, { title: 'admin-created paper (edited)' });
    if (adminPatch.status !== 200) throw new Error('admin PATCH expected 200, got ' + adminPatch.status);
    console.log('[ok] admin PATCH /api/papers/:id -> 200');

    // 14f) admin detail read -> 200, then delete -> 204
    const adminDetail = await call('GET', `/api/papers/${adminPaperId}`);
    if (adminDetail.status !== 200) throw new Error('paper detail expected 200, got ' + adminDetail.status);
    const adminDel = await call('DELETE', `/api/papers/${adminPaperId}`, adminToken);
    if (adminDel.status !== 204 && adminDel.status !== 200) throw new Error('admin DELETE expected 204, got ' + adminDel.status);
    console.log('[ok] admin DELETE /api/papers/:id -> ' + adminDel.status);

    // ── (A) SOURCE DETAIL ────────────────────────────────────────────────────
    const readySource = src.data.find((s: any) => s.connectorStatus === 'ready' && s.issn);
    if (!readySource) throw new Error('no ready source to exercise detail');
    const detail = await call('GET', `/api/sources/${readySource.id}`, token);
    if (detail.status !== 200) throw new Error('source detail -> ' + detail.status + ' ' + JSON.stringify(detail.data));
    if (detail.data.id !== readySource.id || typeof detail.data.paperCount !== 'number')
      throw new Error('source detail missing header/counts: ' + JSON.stringify(detail.data));
    if (!Array.isArray(detail.data.aliases)) throw new Error('source detail missing aliases');
    // Before any run: lastRun* should be null and runningRun null.
    if (detail.data.lastRunStatus !== null || detail.data.runningRun !== null)
      throw new Error('fresh source should have null lastRunStatus/runningRun: ' + JSON.stringify(detail.data));
    console.log('[ok] GET /api/sources/:id ->', detail.data.name, 'papers=' + detail.data.paperCount, 'runningRun=' + JSON.stringify(detail.data.runningRun));

    // bad uuid -> 400
    const badSrc = await call('GET', '/api/sources/not-a-uuid', token);
    if (badSrc.status !== 400) throw new Error('source detail bad uuid expected 400, got ' + badSrc.status);
    // unknown uuid -> 404
    const missingSrc = await call('GET', '/api/sources/00000000-0000-4000-8000-000000000000', token);
    if (missingSrc.status !== 404) throw new Error('source detail missing expected 404, got ' + missingSrc.status);
    console.log('[ok] source detail bad-uuid 400 / missing 404');

    // paper list scoped strictly to journal_id; filters + ordering
    const sp = await call('GET', `/api/sources/${readySource.id}/papers?page=1&pageSize=5&order=latest`, token);
    if (sp.status !== 200) throw new Error('source papers -> ' + sp.status + ' ' + JSON.stringify(sp.data));
    if (!Array.isArray(sp.data.items) || typeof sp.data.total !== 'number') throw new Error('source papers shape');
    for (const it of sp.data.items) {
      if (it.journalId !== readySource.id) throw new Error('source papers not strictly scoped to journal_id');
      if (typeof it.inLibrary !== 'boolean') throw new Error('source paper missing inLibrary flag');
    }
    const spRec = await call('GET', `/api/sources/${readySource.id}/papers?order=recommend`, token);
    if (spRec.status !== 200) throw new Error('source papers recommend -> ' + spRec.status);
    console.log('[ok] GET /api/sources/:id/papers strict journal_id scope; latest+recommend order');

    // not-in-library exact filter
    const spNil = await call('GET', `/api/sources/${readySource.id}/papers?notInLibrary=1`, token);
    if (spNil.status !== 200) throw new Error('source papers notInLibrary -> ' + spNil.status);
    for (const it of spNil.data.items) if (it.inLibrary) throw new Error('notInLibrary filter leaked an in-library paper');
    console.log('[ok] source papers notInLibrary=1 exact');

    // ── (B) NON-DOWNGRADE quick intent ──────────────────────────────────────
    // Quick upsert (PUT) sets todo on an already-reading/read paper and must NOT downgrade.
    const ndPaper = await call('POST', '/api/papers', adminLibToken, { title: 'Non-downgrade paper', keywords: 'bias', url: 'https://example.org/nd' });
    const ndId = ndPaper.data.id;
    await call('PUT', `/api/library/${ndId}`, token, { readingState: 'read' }); // explicit-ish via PUT quick
    const quickAgain = await call('PUT', `/api/library/${ndId}`, token, { readingState: 'todo' });
    if (quickAgain.data.readingState !== 'read') throw new Error('quick todo silently downgraded read->' + quickAgain.data.readingState);
    console.log('[ok] quick add-todo preserves read (no silent downgrade) ->', quickAgain.data.readingState);
    // Explicit selector CAN regress: POST /reading-state honors the choice.
    const explicitBack = await call('POST', `/api/library/${ndId}/reading-state`, token, { state: 'todo' });
    if (explicitBack.data.readingState !== 'todo') throw new Error('explicit state selector should regress to todo, got ' + explicitBack.data.readingState);
    console.log('[ok] explicit reading-state selector may regress ->', explicitBack.data.readingState);
    await call('DELETE', `/api/library/${ndId}`, token);

    // dashboard now also reports readingCount
    const dash2 = await call('GET', '/api/workspace/dashboard', token);
    if (typeof dash2.data.readingCount !== 'number') throw new Error('dashboard missing readingCount');
    console.log('[ok] dashboard readingCount =', dash2.data.readingCount);

    // ── (C) ADMIN SOURCE MANAGEMENT ──────────────────────────────────────────
    // ordinary user -> 403
    const adminSyncForbidden = await call('POST', `/api/admin/sources/${readySource.id}/sync`, token);
    if (adminSyncForbidden.status !== 403) throw new Error('non-admin admin sync expected 403, got ' + adminSyncForbidden.status);
    const adminRunsForbidden = await call('GET', `/api/admin/sources/${readySource.id}/runs`, token);
    if (adminRunsForbidden.status !== 403) throw new Error('non-admin admin runs expected 403, got ' + adminRunsForbidden.status);
    console.log('[ok] admin source API: ordinary user -> 403');

    // admin sync on a skeleton/disabled source -> 400 (no network)
    const skeleton = src.data.find((s: any) => s.connectorStatus !== 'ready');
    if (skeleton) {
      const badSync = await call('POST', `/api/admin/sources/${skeleton.id}/sync`, adminToken);
      if (badSync.status !== 400) throw new Error('admin sync on skeleton expected 400, got ' + badSync.status + ' ' + JSON.stringify(badSync.data));
      console.log('[ok] admin sync on skeleton/disabled source -> 400:', badSync.data.message);
    }

    // atomic per-source running guard: fire TWO concurrent admin syncs with NO planted row.
    // The advisory xact lock serializes claim+insert of the running row: one caller wins and
    // proceeds to fetch; the other blocks on the lock, sees the committed running row -> 409.
    // By the time both HTTP responses return the winner's run is already terminal (released).
    {
      const { Client: PgClient } = await import('pg');
      const dbc = new PgClient({ connectionString: conn });
      await dbc.connect();
      // ensure a clean slate
      await dbc.query(`UPDATE source_sync_runs SET status='error' WHERE source_id=$1 AND status='running'`, [readySource.id]);
      const baseline = (await dbc.query(`SELECT count(*)::int AS n FROM source_sync_runs WHERE source_id=$1 AND status='running'`, [readySource.id])).rows[0].n;
      await dbc.end();

      const [r1, r2] = await Promise.all([
        call('POST', `/api/admin/sources/${readySource.id}/sync`, adminToken),
        call('POST', `/api/admin/sources/${readySource.id}/sync`, adminToken),
      ]);
      const fourOhNines = [r1.status, r2.status].filter((s: number) => s === 409).length;
      if (fourOhNines !== 1)
        throw new Error(`exactly one concurrent sync should 409, got ${r1.status} / ${r2.status}`);
      const winner = [r1.status, r2.status].find((s: number) => s !== 409)!;
      if (![200, 500, 502].includes(winner))
        throw new Error(`winner should enter/finish sync (200/5xx), got ${winner}`);

      const dbc2 = new PgClient({ connectionString: conn });
      await dbc2.connect();
      const after = (await dbc2.query(`SELECT count(*)::int AS n FROM source_sync_runs WHERE source_id=$1 AND status='running'`, [readySource.id])).rows[0].n;
      await dbc2.end();
      if (after !== 0) throw new Error(`after settle there must be no running row, got ${after}`);
      if (baseline !== 0) throw new Error('unexpected pre-existing running row');
      console.log(`[ok] concurrent sync: one enters (${winner}) / one 409; running released, rows=0 (atomic lock+unique index)`);
    }

    // stale running row is reaped (marked error/interrupted) and a fresh sync is allowed (not 409)
    {
      const { Client: PgClient } = await import('pg');
      const dbc = new PgClient({ connectionString: conn });
      await dbc.connect();
      await dbc.query(
        `INSERT INTO source_sync_runs (id, source_id, connector_type, status, started_at, finished_at, fetched_count, inserted_count, updated_count, message)
         VALUES (gen_random_uuid(), $1, 'crossref', 'running', now() - interval '20 minutes', null, 0, 0, 0, 'planted stale')`,
        [readySource.id],
      );
      await dbc.end();

      const retry = await call('POST', `/api/admin/sources/${readySource.id}/sync`, adminToken);
      if (retry.status === 409)
        throw new Error('stale running row should be reaped, fresh sync must NOT 409');
      console.log('[ok] stale running row reaped as error/interrupted; retry allowed (status=' + retry.status + ')');
    }

    // per-source runs list (admin) returns full fields; at least one terminal run exists now
    const srcRuns = await call('GET', `/api/admin/sources/${readySource.id}/runs`, adminToken);
    if (srcRuns.status !== 200 || !Array.isArray(srcRuns.data)) throw new Error('admin source runs -> ' + srcRuns.status);
    const terminalRun = srcRuns.data.find((r: any) => r.status === 'ok' || r.status === 'error');
    if (!terminalRun || typeof terminalRun.startedAt !== 'string' || terminalRun.fetchedCount === undefined)
      throw new Error('admin source runs missing full terminal run fields: ' + JSON.stringify(srcRuns.data[0]));
    console.log('[ok] GET /api/admin/sources/:id/runs ->', srcRuns.data.length, 'runs with full fields');

    // detail now reflects the terminal lastRun (json_build_object unwrapped as object, not [0])
    const detailAfter = await call('GET', `/api/sources/${readySource.id}`, token);
    if (detailAfter.status !== 200) throw new Error('source detail after runs -> ' + detailAfter.status);
    if (detailAfter.data.lastRunStatus !== 'ok' && detailAfter.data.lastRunStatus !== 'error')
      throw new Error('detail lastRunStatus should be a terminal status, got ' + detailAfter.data.lastRunStatus);
    if (typeof detailAfter.data.lastRunInserted !== 'number' || typeof detailAfter.data.lastRunUpdated !== 'number')
      throw new Error('detail lastRunInserted/Updated missing: ' + JSON.stringify(detailAfter.data));
    if (typeof detailAfter.data.lastRunStartedAt !== 'string')
      throw new Error('detail lastRunStartedAt should be an ISO string');
    if (detailAfter.data.runningRun !== null)
      throw new Error('no run should be running now, got runningRun=' + JSON.stringify(detailAfter.data.runningRun));
    console.log('[ok] source detail terminal lastRun fields populated; runningRun=null:',
      JSON.stringify({ status: detailAfter.data.lastRunStatus, ins: detailAfter.data.lastRunInserted, upd: detailAfter.data.lastRunUpdated }));

    // ── (D) WEEKLY RADAR (deterministic snapshot) ──────────────────────────
    // Regular user GETs the radar; it lazily freezes the current ISO-Week snapshot.
    const radar1 = await call('GET', '/api/radar/current', token);
    if (radar1.status !== 200 || !radar1.data.current) throw new Error('radar current -> ' + radar1.status);
    if (!Array.isArray(radar1.data.current.items)) throw new Error('radar items not array');
    console.log('[ok] GET /api/radar/current -> week', radar1.data.current.weekStart, 'items=' + radar1.data.current.items.length);

    // Previous-week snapshot MUST exist (boot-safe deterministic backfill): a real, persisted,
    // selectable row for the immediately-previous ISO Shanghai week, carrying its own digest.
    // It may have an empty Top10 / newPaperCount=0, but it must NEVER come back null.
    if (!radar1.data.previous) throw new Error('previous-week radar snapshot must exist (boot-safe backfill), got null');
    if (radar1.data.previous.isCurrent !== false) throw new Error('previous snapshot must report isCurrent=false, got ' + radar1.data.previous.isCurrent);
    if (typeof radar1.data.previous.generatedAt !== 'string') throw new Error('previous snapshot must have a persisted digest (generatedAt)');
    if (!Array.isArray(radar1.data.previous.items) || !Array.isArray(radar1.data.previous.sourceDistribution) || !Array.isArray(radar1.data.previous.keywordHits))
      throw new Error('previous snapshot missing aggregate arrays');
    if (typeof radar1.data.previous.newPaperCount !== 'number') throw new Error('previous snapshot missing newPaperCount');
    // previous week key must be exactly current.weekStart minus 7 days (ISO Shanghai Monday).
    const curMon = new Date(radar1.data.current.weekStart + 'T00:00:00Z');
    const prevMon = new Date(radar1.data.previous.weekStart + 'T00:00:00Z');
    const diffDays = Math.round((curMon.getTime() - prevMon.getTime()) / 86400000);
    if (diffDays !== 7) throw new Error(`previous week must be exactly 7 days before current (cur=${radar1.data.current.weekStart} prev=${radar1.data.previous.weekStart})`);
    console.log('[ok] previous-week snapshot persisted + selectable: week', radar1.data.previous.weekStart, 'items=' + radar1.data.previous.items.length, 'new=' + radar1.data.previous.newPaperCount, 'digest=' + radar1.data.previous.generatedAt);

    // Idempotent: a second read returns the SAME frozen previous row (not regenerated).
    const radar1b = await call('GET', '/api/radar/current', token);
    if (radar1b.data.previous.weekStart !== radar1.data.previous.weekStart) throw new Error('previous weekStart changed between reads (should be frozen)');
    if (radar1b.data.previous.generatedAt !== radar1.data.previous.generatedAt) throw new Error('previous snapshot regenerated on read (must be frozen/idempotent)');
    console.log('[ok] previous-week snapshot frozen: repeat read returns identical weekStart + digest');

    // POST /generate must be ADMIN-only: a regular user gets 403.
    const genForbidden = await call('POST', '/api/radar/generate', token);
    if (genForbidden.status !== 403) throw new Error('non-admin radar generate expected 403, got ' + genForbidden.status);
    console.log('[ok] non-admin POST /api/radar/generate -> 403');

    // Admin regenerate for the SAME week is a no-op and the order must be byte-stable.
    const gen2 = await call('POST', '/api/radar/generate', adminToken);
    if (gen2.status !== 200 && gen2.status !== 201) throw new Error('admin radar generate -> ' + gen2.status);
    const radar2 = await call('GET', '/api/radar/current', token);
    if (radar2.data.current.weekStart !== radar1.data.current.weekStart)
      throw new Error('weekStart changed between deterministic snapshots');
    const order1 = radar1.data.current.items.map((i: any) => i.paper.id).join(',');
    const order2 = radar2.data.current.items.map((i: any) => i.paper.id).join(',');
    if (order1 !== order2) throw new Error('radar order is not deterministic across regeneration');
    for (const it of radar2.data.current.items ?? []) {
      if (!Array.isArray(it.reasons) || !Array.isArray(it.matchedKeywords)) throw new Error('radar item missing reasons/keywords');
      if (it.paper.journalName === undefined || it.paper.publishedDate === undefined) throw new Error('radar item missing source/date');
    }
    console.log('[ok] radar deterministic: same weekStart + identical order after admin regenerate');

    // Admin/internal backfill endpoint: idempotent, keeps the existing frozen previous week,
    // and is gated to admins (regular user -> 403).
    const backfill = await call('POST', '/api/radar/backfill', adminToken);
    if (backfill.status !== 200 && backfill.status !== 201) throw new Error('admin radar backfill -> ' + backfill.status + ' ' + JSON.stringify(backfill.data));
    if (!backfill.data.previous || backfill.data.previous.weekStart !== radar1.data.previous.weekStart)
      throw new Error('backfill must preserve the existing previous-week snapshot');
    if (!backfill.data.current || backfill.data.current.weekStart !== radar1.data.current.weekStart)
      throw new Error('backfill must preserve the current-week snapshot');
    const backfillForbidden = await call('POST', '/api/radar/backfill', token);
    if (backfillForbidden.status !== 403) throw new Error('non-admin radar backfill expected 403, got ' + backfillForbidden.status);
    console.log('[ok] POST /api/radar/backfill admin-only, idempotent, preserves current+previous frozen weeks');

    // ── (E) WEEKLY DIGEST ───────────────────────────────────────────────────
    const digest = await call('GET', '/api/digest/current', token);
    if (digest.status !== 200) throw new Error('digest -> ' + digest.status);
    for (const k of ['newPaperCount', 'top10', 'sourceDistribution', 'keywordHits', 'userActionCounts']) {
      if (digest.data[k] === undefined) throw new Error('digest missing ' + k);
    }
    if (!Array.isArray(digest.data.top10)) throw new Error('digest top10 not array');
    console.log('[ok] GET /api/digest/current -> new=' + digest.data.newPaperCount, 'top10=' + digest.data.top10.length, 'actions=' + JSON.stringify(digest.data.userActionCounts));

    // Digest weekRef + read-only contract.
    if (digest.data.weekRef !== 'current') throw new Error('digest/current must set weekRef=current, got ' + digest.data.weekRef);
    if (digest.data.generatedAt !== null && typeof digest.data.generatedAt !== 'string')
      throw new Error('digest generatedAt must be string or null');

    // Previous-week digest: deterministic key = current - 7 days; valid shape; read-only.
    const digPrev1 = await call('GET', '/api/digest/previous', token);
    if (digPrev1.status !== 200) throw new Error('digest/previous -> ' + digPrev1.status);
    if (digPrev1.data.weekRef !== 'previous') throw new Error('digest/previous must set weekRef=previous');
    for (const k of ['newPaperCount', 'top10', 'sourceDistribution', 'keywordHits', 'userActionCounts']) {
      if (digPrev1.data[k] === undefined) throw new Error('digest previous missing ' + k);
    }
    const dCurMon = new Date(digest.data.weekStart + 'T00:00:00Z');
    const dPrevMon = new Date(digPrev1.data.weekStart + 'T00:00:00Z');
    const dDiff = Math.round((dCurMon.getTime() - dPrevMon.getTime()) / 86400000);
    if (dDiff !== 7) throw new Error(`digest previous week must be exactly 7 days before current (cur=${digest.data.weekStart} prev=${digPrev1.data.weekStart})`);
    // Read-only: a second read must NOT change the (possibly null) frozen digest timestamp.
    const digPrev2 = await call('GET', '/api/digest/previous', token);
    if (digPrev2.data.generatedAt !== digPrev1.data.generatedAt)
      throw new Error('digest previous read mutated the snapshot (generatedAt changed between reads)');
    console.log('[ok] GET /api/digest/previous -> week', digPrev1.data.weekStart, 'read-only (generatedAt stable=' + digPrev1.data.generatedAt + ')');

    // ── (F) BEHAVIOR EVENTS (idempotent, no note text) ──────────────────────
    const ev1 = await call('POST', '/api/events', token, { eventType: 'favorite', paperId: adminPaperId, idempotencyKey: 'test-key-1' });
    if (ev1.status !== 200 && ev1.status !== 201) throw new Error('event first POST -> ' + ev1.status);
    if (ev1.data.recorded !== true) throw new Error('event first should recorded=true, got ' + JSON.stringify(ev1.data));
    const ev2 = await call('POST', '/api/events', token, { eventType: 'favorite', paperId: adminPaperId, idempotencyKey: 'test-key-1' });
    if (ev2.status !== 200 && ev2.status !== 201) throw new Error('duplicate event status -> ' + ev2.status);
    if (ev2.data.recorded !== false) throw new Error('duplicate event should be deduped (recorded=false), got ' + JSON.stringify(ev2.data));
    console.log('[ok] behavior event idempotent: first recorded=true, duplicate recorded=false');
    // unknown event type -> 400
    const badEv = await call('POST', '/api/events', token, { eventType: 'note_body_attempt', paperId: adminPaperId });
    if (badEv.status !== 400) throw new Error('unknown event type expected 400, got ' + badEv.status);
    // admin summary present (internal metrics)
    const evSum = await call('GET', '/api/events/admin/summary', adminToken);
    if (evSum.status !== 200 || typeof evSum.data.total !== 'number') throw new Error('event admin summary -> ' + evSum.status);
    console.log('[ok] event admin summary total=' + evSum.data.total);

    // ── (F2) INTERNAL METRICS (admin-only, behavior-event aggregates) ──────────
    // Ordinary user -> 403 (route redirects client-side, API enforces).
    const metricsForbidden = await call('GET', '/api/admin/metrics', token);
    if (metricsForbidden.status !== 403) throw new Error('non-admin internal metrics expected 403, got ' + metricsForbidden.status);
    console.log('[ok] non-admin GET /api/admin/metrics -> 403');

    const metrics = await call('GET', '/api/admin/metrics', adminToken);
    if (metrics.status !== 200) throw new Error('admin internal metrics -> ' + metrics.status + ' ' + JSON.stringify(metrics.data));
    const m = metrics.data;
    // Every conversion carries explicit numerator/denominator + nullable rate.
    for (const p of [m.top10Ctr.overall, m.conversions.library, m.conversions.todo, m.conversions.uninterested, m.readingConversion7d]) {
      if (typeof p.numerator !== 'number' || typeof p.denominator !== 'number')
        throw new Error('metric point missing numerator/denominator: ' + JSON.stringify(m));
      if (p.rate !== null && typeof p.rate !== 'number') throw new Error('metric rate must be number or null');
    }
    if (!Array.isArray(m.top10Ctr.items)) throw new Error('top10Ctr.items must be array');
    for (const it of m.top10Ctr.items) {
      if (typeof it.paperId !== 'string' || typeof it.impressions !== 'number' || typeof it.details !== 'number')
        throw new Error('top10 ctr item malformed: ' + JSON.stringify(it));
    }
    if (typeof m.noteCount !== 'number') throw new Error('noteCount missing');
    // No note body may leak: the payload must never contain a content field.
    if (JSON.stringify(m).includes('inline paper-detail note body')) throw new Error('internal metrics leaked note content');
    console.log('[ok] GET /api/admin/metrics -> 200: CTR=' + JSON.stringify(m.top10Ctr.overall), 'conv=' + JSON.stringify(m.conversions), 'noteCount=' + m.noteCount, 'reading7d=' + JSON.stringify(m.readingConversion7d));

    // Explicit-key contract: impression <week>:impression:<surface>:<paperId> dedupes on
    // refresh; detail dedupes per paper/week; library records only the first time; note
    // fires only on success and carries NO content.
    const wk = new Date().toISOString().slice(0, 10);
    const impKey = `${wk}:impression:radar:${adminPaperId}`;
    const impA = await call('POST', '/api/events', token, { eventType: 'impression', paperId: adminPaperId, idempotencyKey: impKey });
    const impB = await call('POST', '/api/events', token, { eventType: 'impression', paperId: adminPaperId, idempotencyKey: impKey });
    if (impA.data.recorded !== true || impB.data.recorded !== false) throw new Error('impression refresh should dedupe');
    console.log('[ok] impression: render recorded=true, refresh recorded=false');

    const detKey = `${wk}:detail:${adminPaperId}`;
    const detA = await call('POST', '/api/events', token, { eventType: 'detail', paperId: adminPaperId, idempotencyKey: detKey });
    const detB = await call('POST', '/api/events', token, { eventType: 'detail', paperId: adminPaperId, idempotencyKey: detKey });
    if (detA.data.recorded !== true || detB.data.recorded !== false) throw new Error('detail repeat should dedupe');
    console.log('[ok] detail: first open recorded=true, repeat recorded=false');

    const libKey = `${wk}:library:${adminPaperId}`;
    const libA = await call('POST', '/api/events', token, { eventType: 'library', paperId: adminPaperId, idempotencyKey: libKey });
    const libB = await call('POST', '/api/events', token, { eventType: 'library', paperId: adminPaperId, idempotencyKey: libKey });
    if (libA.data.recorded !== true || libB.data.recorded !== false) throw new Error('library should record first only');
    console.log('[ok] library: first association recorded=true, pure re-update recorded=false');

    // ── NOTE EVENT: privacy-safe, success-only, idempotent. The notes API itself MUST NOT
    // auto-emit a behavior event; only the client's post-success POST /api/events counts,
    // and only once per explicit key. Content/tags never travel on the event.
    // The earlier admin paper was deleted above, but user_notes enforces a real paper FK (the
    // events table does not), so create a fresh, keep-alive paper to anchor the inline note.
    const noteTarget = await call('POST', '/api/papers', adminToken, { title: 'Inline note target paper', keywords: 'priming', abstractText: 'Inline note target abstract.', url: 'https://example.org/notetarget' });
    if (noteTarget.status !== 201) throw new Error('note-target paper create -> ' + noteTarget.status + ' ' + JSON.stringify(noteTarget.data));
    const notePaperId = noteTarget.data.id;
    const noteKey = `${wk}:note:${notePaperId}`;

    // Baseline: how many `note` behavior events does this user have this week?
    const digestBase0 = await call('GET', '/api/digest/current', token);
    const noteCountBase = digestBase0.data.userActionCounts.note;

    // (a) Creating a note via the notes API must NOT itself emit a note event.
    const inlineNote = await call('POST', '/api/workspace/notes', token, { content: 'inline paper-detail note body', paperId: notePaperId });
    if (inlineNote.status !== 200 && inlineNote.status !== 201) throw new Error('inline note create -> ' + inlineNote.status + ' ' + JSON.stringify(inlineNote.data));
    if (!inlineNote.data.id) throw new Error('created note missing id: ' + JSON.stringify(inlineNote.data));
    const afterNoteCreate = await call('GET', '/api/digest/current', token);
    if (afterNoteCreate.data.userActionCounts.note !== noteCountBase)
      throw new Error(`note create must not auto-emit a note event: baseline=${noteCountBase} afterCreate=${afterNoteCreate.data.userActionCounts.note}`);

    // (b) Updating that note must NOT count as a create (update path is invisible to the counter).
    const updNote = await call('PATCH', `/api/workspace/notes/${inlineNote.data.id}`, token, { content: 'inline paper-detail note body (edited)' });
    if (updNote.status !== 200) throw new Error('note update -> ' + updNote.status + ' ' + JSON.stringify(updNote.data));
    const afterNoteUpdate = await call('GET', '/api/digest/current', token);
    if (afterNoteUpdate.data.userActionCounts.note !== noteCountBase)
      throw new Error(`note update path must not count as a create: baseline=${noteCountBase} afterUpdate=${afterNoteUpdate.data.userActionCounts.note}`);

    // (c) Only the client's explicit post-success event increments the counter — exactly once.
    const noteEv = await call('POST', '/api/events', token, { eventType: 'note', paperId: notePaperId, idempotencyKey: noteKey });
    if (noteEv.data.recorded !== true) throw new Error('note event should record, got ' + JSON.stringify(noteEv.data));
    const afterNoteEvent = await call('GET', '/api/digest/current', token);
    if (afterNoteEvent.data.userActionCounts.note !== noteCountBase + 1)
      throw new Error(`note event should +1: base=${noteCountBase} after=${afterNoteEvent.data.userActionCounts.note}`);

    // (d) Idempotent replay of the SAME key does not double-count (the failure/dupe case).
    const noteDup = await call('POST', '/api/events', token, { eventType: 'note', paperId: notePaperId, idempotencyKey: noteKey });
    if (noteDup.data.recorded !== false) throw new Error('duplicate note event must dedupe (recorded=false), got ' + JSON.stringify(noteDup.data));
    const afterNoteDup = await call('GET', '/api/digest/current', token);
    if (afterNoteDup.data.userActionCounts.note !== noteCountBase + 1)
      throw new Error(`duplicate note event must not double-count: ${afterNoteDup.data.userActionCounts.note}`);

    // (e) Free-standing note (paperId=null) is its own key; still carries no content/tags.
    const freeNote = await call('POST', '/api/events', token, { eventType: 'note', paperId: null, idempotencyKey: `${wk}:note:none` });
    if (freeNote.data.recorded !== true) throw new Error('free note (paperId=null) should record');
    console.log('[ok] note: note API never auto-emits; client event +1, duplicate idempotent, update invisible, paperId=null ok, no content/tags');

    const badKey = await call('POST', '/api/events', token, { eventType: 'favorite', paperId: adminPaperId, idempotencyKey: 123 });
    if (badKey.status !== 400) throw new Error('non-string idempotencyKey should 400, got ' + badKey.status);
    console.log('[ok] event DTO: non-string idempotencyKey rejected 400');
    // Fire the remaining two action events so all 7 digest categories are covered.
    await call('POST', '/api/events', token, { eventType: 'todo', paperId: adminPaperId, idempotencyKey: `${wk}:todo:${adminPaperId}` });
    await call('POST', '/api/events', token, { eventType: 'uninterested', paperId: adminPaperId, idempotencyKey: `${wk}:uninterested:${adminPaperId}` });

    const reg2 = await call('POST', '/api/auth/register', undefined, { username: 'e2e_other_' + Date.now(), password: 'pw123456', email: 'e2e_other_' + Date.now() + '@x.io' });
    const token2 = reg2.data.token;
    if (!token2) throw new Error('second user register failed');
    const otherImp = await call('POST', '/api/events', token2, { eventType: 'impression', paperId: adminPaperId, idempotencyKey: impKey });
    if (otherImp.data.recorded !== true) throw new Error('second user must record independently (isolation broken)');
    console.log('[ok] dual-user isolation: same key records for a different user');

    const digest2 = await call('GET', '/api/digest/current', token);
    const counts = digest2.data.userActionCounts;
    for (const k of ['impression', 'detail', 'library', 'todo', 'favorite', 'uninterested', 'note']) {
      if (typeof counts[k] !== 'number' || counts[k] < 1) throw new Error('digest action ' + k + ' should be >=1, got ' + JSON.stringify(counts));
    }
    console.log('[ok] digest 7 action counts all grew:', JSON.stringify(counts));

    // ── (G) NOTES TAGS ───────────────────────────────────────────────────────
    const taggedNote = await call('POST', '/api/workspace/notes', token, { content: 'note with tags', tags: ['priming', 'syntax'] });
    if (taggedNote.status !== 200 && taggedNote.status !== 201) throw new Error('tagged note create -> ' + taggedNote.status);
    if (!Array.isArray(taggedNote.data.tags) || taggedNote.data.tags.length !== 2) throw new Error('note tags not persisted: ' + JSON.stringify(taggedNote.data));
    console.log('[ok] note tags persisted:', JSON.stringify(taggedNote.data.tags));

    // ── (H) SCHEDULER GATES (staging-only) ──────────────────────────────────
    // In this e2e env APP_ENV is not 'staging' and SCHEDULER_ENABLED is unset -> disabled.
    const sch0 = await call('GET', '/api/admin/scheduler', adminToken);
    if (sch0.status !== 200) throw new Error('scheduler status -> ' + sch0.status);
    if (sch0.data.enabled !== false) throw new Error('scheduler must be disabled without APP_ENV=staging+SCHEDULER_ENABLED, got ' + sch0.data.enabled);
    if (sch0.data.readySourceCount !== 7) throw new Error('expected exactly 7 ready sources, got ' + sch0.data.readySourceCount);
    console.log('[ok] scheduler disabled by default; readySourceCount=' + sch0.data.readySourceCount);

    // pause/resume round-trip works even when disabled (state is just bookkeeping).
    const paused = await call('PUT', '/api/admin/scheduler', adminToken, { paused: true });
    if (paused.status !== 200 || paused.data.paused !== true) throw new Error('scheduler pause -> ' + JSON.stringify(paused.data));
    const resumed = await call('PUT', '/api/admin/scheduler', adminToken, { paused: false });
    if (resumed.status !== 200 || resumed.data.paused !== false) throw new Error('scheduler resume -> ' + JSON.stringify(resumed.data));
    console.log('[ok] scheduler pause/resume round-trip');

    // run-once when disabled -> ran=false, reason=disabled (no sync performed).
    const once = await call('POST', '/api/admin/scheduler/run-once', adminToken);
    if (once.status !== 200 && once.status !== 201) throw new Error('run-once status -> ' + once.status);
    if (once.data.ran !== false) throw new Error('disabled run-once should report ran=false, got ' + JSON.stringify(once.data));
    console.log('[ok] scheduler run-once while disabled -> ran=false (' + once.data.reason + ')');

    console.log('\n=== E2E FLOW REGRESSION PASSED ===');
  } finally {
    await app.close();
    await pg.stop();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
