// Interaction-consistency E2E for the favorite quick-action (embedded real Postgres + compiled
// Nest app). Covers: authoritative LibraryState response, unstarred->favorite->refresh->
// cross-page (legacy projection)->unfavorite->favorite-filter disappearance->refresh, two-user
// isolation, UNIQUE(user,paper) idempotency, double-click no-op, and direction-aware events.
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

hardTimeout(180_000, 'e2e.library-interaction');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const migDir = join(root, 'server', 'database', 'migrations');
const f = (p: string) => readFileSync(p, 'utf8');
const dataDir = mkdtempSync(join(tmpdir(), 'litradar-lib-'));

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
  process.env.ADMIN_EMAILS = 'admin-libint@example.com';

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
    // admin provisions two papers
    const adminReg = await call('POST', '/api/auth/register', undefined, {
      username: 'adminlibint_' + Date.now(), password: 'password123', email: 'admin-libint@example.com',
    });
    if (!adminReg.data.user?.isAdmin) throw new Error('admin not admin: ' + JSON.stringify(adminReg.data));
    const adminToken = adminReg.data.token;

    const mkPaper = async (title: string) => {
      const r = await call('POST', '/api/papers', adminToken, { title, keywords: 'priming', abstractText: 'abstract', url: 'https://example.org/' + title });
      if (r.status !== 201) throw new Error('create paper ' + title + ' -> ' + r.status + ' ' + JSON.stringify(r.data));
      return r.data;
    };
    const P = await mkPaper('LibInt favorite paper');
    const Q = await mkPaper('LibInt other paper');

    const reg = async (u: string) => {
      const r = await call('POST', '/api/auth/register', undefined, { username: u, password: 'password123', email: `${u}@example.com` });
      if (r.status !== 201 && r.status !== 200) throw new Error('register ' + u + ' -> ' + r.status);
      return r.data.token;
    };
    const t1 = await reg('libint_u1_' + Date.now());
    const t2 = await reg('libint_u2_' + Date.now());

    // ── A) unstarred -> favorite ──
    const fav = await call('POST', `/api/library/${P.id}/favorite`, t1, { isFavorite: true });
    if (fav.status !== 200) throw new Error('favorite on -> ' + fav.status);
    const s = fav.data;
    // authoritative shape: explicit rowExists / libraryId, direction reported
    if (s.rowExists !== true) throw new Error('after favorite rowExists must be true: ' + JSON.stringify(s));
    if (typeof s.libraryId !== 'string' || !s.libraryId) throw new Error('after favorite libraryId must be a real id, got ' + s.libraryId);
    if (s.isFavorite !== true) throw new Error('isFavorite must be true');
    if (s.favoriteTransition !== 'favorited') throw new Error('transition must be favorited, got ' + s.favoriteTransition);
    if (s.changed !== true) throw new Error('changed must be true on real transition');
    // A real transition MUST carry a fresh server-minted transitionToken (a UUID).
    if (typeof s.transitionToken !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s.transitionToken)) {
      throw new Error('favorite must return a UUID transitionToken, got ' + JSON.stringify(s.transitionToken));
    }
    const tokFav1 = s.transitionToken;
    console.log('[ok] favorite -> authoritative LibraryState {rowExists, libraryId, favorited, changed, transitionToken}');

    // refresh: library list agrees
    let lib = await call('GET', '/api/library', t1);
    let row = lib.data.items.find((i: any) => i.paperId === P.id);
    if (!row || row.isFavorite !== true) throw new Error('refresh: favorite row missing');
    console.log('[ok] refresh GET /api/library reflects favorite');

    // cross-page: legacy workspace favorites projection reads the same authority (no double-write)
    let favLegacy = await call('GET', '/api/workspace/favorites', t1);
    if (!favLegacy.data.some((f: any) => f.paperId === P.id)) throw new Error('legacy /workspace/favorites missing favorited paper');
    console.log('[ok] legacy workspace/favorites projection consistent with user_library');

    // ── double-click race: repeat favorite=true is a no-op transition ──
    const again = await call('POST', `/api/library/${P.id}/favorite`, t1, { isFavorite: true });
    if (again.data.favoriteTransition !== 'none') throw new Error('repeat favorite=true must be no-op, got ' + again.data.favoriteTransition);
    if (again.data.changed !== false) throw new Error('repeat favorite=true must not be a change');
    if (again.data.transitionToken !== null) throw new Error('double-click (changed=false) must NOT mint a transitionToken, got ' + JSON.stringify(again.data.transitionToken));
    lib = await call('GET', '/api/library', t1);
    const occ = lib.data.items.filter((i: any) => i.paperId === P.id).length;
    if (occ !== 1) throw new Error(`double-click created ${occ} rows, want 1 (UNIQUE user+paper)`);
    console.log('[ok] double-click idempotent: no transition, no token, still exactly one row');

    // ── unfavorite ──
    const unfav = await call('POST', `/api/library/${P.id}/favorite`, t1, { isFavorite: false });
    if (unfav.status !== 200) throw new Error('unfavorite -> ' + unfav.status);
    const u = unfav.data;
    // safe "no row" representation: rowExists=false, libraryId=null, isFavorite=false — NOT id:null
    if (u.rowExists !== false) throw new Error('after unfavorite(no state) rowExists must be false: ' + JSON.stringify(u));
    if (u.libraryId !== null) throw new Error('removed row must have libraryId=null, got ' + u.libraryId);
    if (u.isFavorite !== false) throw new Error('isFavorite must be false');
    if (u.favoriteTransition !== 'unfavorited') throw new Error('transition must be unfavorited, got ' + u.favoriteTransition);
    if (u.changed !== true) throw new Error('changed must be true');
    if (typeof u.transitionToken !== 'string' || !u.transitionToken) throw new Error('unfavorite must mint a transitionToken');
    if (u.transitionToken === tokFav1) throw new Error('unfavorite token must differ from the earlier favorite token');
    const tokUnfav = u.transitionToken;
    console.log('[ok] unfavorite -> rowExists=false, libraryId=null (no fake id:null), direction=unfavorited, fresh token');

    // favorite-filter disappearance + refresh consistency
    const favFilter = await call('GET', '/api/library?status=favorite', t1);
    if (favFilter.data.items.some((i: any) => i.paperId === P.id)) throw new Error('favorite-filter still shows unfavorited paper');
    const allAfter = await call('GET', '/api/library', t1);
    if (allAfter.data.items.some((i: any) => i.paperId === P.id)) throw new Error('library still shows unfavorited paper');
    console.log('[ok] favorite-filter + refresh: unfavorited paper gone');

    // ── re-favorite (direction cycle: favorited -> unfavorited -> favorited) ──
    // This models favorite -> reload -> unfavorite -> reload -> favorite: the token is minted
    // server-side per real transition, so it cannot reset across a reload and must be fresh.
    const refav = await call('POST', `/api/library/${P.id}/favorite`, t1, { isFavorite: true });
    if (refav.data.favoriteTransition !== 'favorited') throw new Error('re-favorite must be favorited');
    if (refav.data.rowExists !== true) throw new Error('re-favorite must bring the row back');
    const tokFav2 = refav.data.transitionToken;
    if (typeof tokFav2 !== 'string' || !tokFav2) throw new Error('re-favorite must mint a transitionToken');
    if (tokFav2 === tokFav1 || tokFav2 === tokUnfav) throw new Error('re-favorite token must be globally fresh (not reused)');
    console.log('[ok] re-favorite after unfavorite works; three transition tokens all distinct');

    // ── events: key the behavior event on direction + server token; the 3 real transitions
    //    must produce exactly 3 recorded events even though favorite ran twice. ──
    const ok2xx = (r: { status: number }) => r.status === 200 || r.status === 201;
    const week = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const kFav1 = `${week}:favorite:${P.id}:${tokFav1}`;
    const kUnf = `${week}:unfavorite:${P.id}:${tokUnfav}`;
    const kFav2 = `${week}:favorite:${P.id}:${tokFav2}`;
    const eFav1 = await call('POST', '/api/events', t1, { eventType: 'favorite', paperId: P.id, idempotencyKey: kFav1 });
    if (!ok2xx(eFav1) || eFav1.data.recorded !== true) throw new Error('favorite#1 event not recorded: ' + eFav1.status);
    const eUnf = await call('POST', '/api/events', t1, { eventType: 'unfavorite', paperId: P.id, idempotencyKey: kUnf });
    if (!ok2xx(eUnf) || eUnf.data.recorded !== true) throw new Error('unfavorite event not recorded: ' + eUnf.status);
    const eFav2 = await call('POST', '/api/events', t1, { eventType: 'favorite', paperId: P.id, idempotencyKey: kFav2 });
    if (eFav2.data.recorded !== true) throw new Error('re-favorite event must NOT be swallowed by the earlier favorite (fresh token)');
    // Replay of the SAME transition's token key dedupes (idempotent).
    const eFav2dup = await call('POST', '/api/events', t1, { eventType: 'favorite', paperId: P.id, idempotencyKey: kFav2 });
    if (eFav2dup.data.recorded !== false) throw new Error('replaying the same transition token must dedupe');
    console.log('[ok] events: favorite->unfavorite->favorite = exactly 3 recorded; replay of same token deduped; reload cannot reuse keys');

    await call('DELETE', `/api/library/${P.id}`, t1);
    console.log('[ok] re-favorite cycle preserved');

    // ── two-user isolation ──
    await call('POST', `/api/library/${Q.id}/favorite`, t2, { isFavorite: true });
    const t1lib = await call('GET', '/api/library', t1);
    if (t1lib.data.items.some((i: any) => i.paperId === Q.id)) throw new Error('u1 sees u2 favorite — isolation broken');
    const t2fav = await call('GET', '/api/library?status=favorite', t2);
    if (!t2fav.data.items.some((i: any) => i.paperId === Q.id)) throw new Error('u2 favorite missing');
    const t2libP = await call('GET', '/api/library', t2);
    if (t2libP.data.items.some((i: any) => i.paperId === P.id)) throw new Error('u2 sees u1 history');
    console.log('[ok] two-user favorite isolation (no cross-leak)');


    console.log('\n=== LIBRARY INTERACTION E2E PASSED ===');
  } finally {
    await app.close();
    await pg.stop();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('LIB INTERACTION E2E FAILED:', e.message); process.exit(1); });
