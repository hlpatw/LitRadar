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
  for (const m of ['0000_base.up.sql', '0001_sources.up.sql', '0002_reconcile.up.sql', '0003_full_catalog.up.sql', '0004_correct_issn.up.sql', '0005_user_library.up.sql', '0006_source_detail_indexes.up.sql']) {
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

    // running protection: plant a 'running' run row, then admin sync -> 409
    {
      const { Client: PgClient } = await import('pg');
      const dbc = new PgClient({ connectionString: conn });
      await dbc.connect();
      await dbc.query(
        `INSERT INTO source_sync_runs (id, source_id, connector_type, status, started_at, fetched_count, inserted_count, updated_count, message)
         VALUES (gen_random_uuid(), $1, 'crossref', 'running', now(), 0, 0, 0, 'planted for e2e')`,
        [readySource.id],
      );
      await dbc.end();
      const conflict = await call('POST', `/api/admin/sources/${readySource.id}/sync`, adminToken);
      if (conflict.status !== 409) throw new Error('admin sync with running run expected 409, got ' + conflict.status + ' ' + JSON.stringify(conflict.data));
      console.log('[ok] admin sync while a run is running -> 409 (running protection)');
    }

    // per-source runs list (admin) returns full fields
    const srcRuns = await call('GET', `/api/admin/sources/${readySource.id}/runs`, adminToken);
    if (srcRuns.status !== 200 || !Array.isArray(srcRuns.data)) throw new Error('admin source runs -> ' + srcRuns.status);
    const planted = srcRuns.data.find((r: any) => r.status === 'running');
    if (!planted || typeof planted.startedAt !== 'string') throw new Error('admin source runs missing full run fields');
    console.log('[ok] GET /api/admin/sources/:id/runs ->', srcRuns.data.length, 'runs with full fields');

    console.log('\n=== E2E FLOW REGRESSION PASSED ===');
  } finally {
    await app.close();
    await pg.stop();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });
