import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const f = (p: string) => readFileSync(join(root, p), 'utf8');

test('shared: LibraryState authoritative shape + unfavorite direction + transitionToken exist', () => {
  const shared = f('shared/api.interface.ts');
  assert.match(shared, /interface LibraryState/, 'LibraryState type must exist');
  for (const field of ['rowExists', 'libraryId', 'favoriteTransition', 'changed', 'transitionToken']) {
    assert.ok(shared.includes(field), `LibraryState must declare ${field}`);
  }
  assert.match(shared, /'unfavorite'/, 'BehaviorEventType must include unfavorite direction');
});

test('digest: BLANK_ACTIONS includes unfavorite:0 so an empty report never omits the new direction', () => {
  const digest = f('server/modules/digest/digest.service.ts');
  assert.match(digest, /BLANK_ACTIONS/, 'digest must build a blank action map');
  assert.match(digest, /unfavorite:\s*0/, 'BLANK_ACTIONS must seed unfavorite:0');
});

test('backend: favorite mutation returns authoritative LibraryState, no fake id:null row', () => {
  const ctrl = f('server/modules/library/library.controller.ts');
  assert.match(ctrl, /Promise<LibraryState>/, 'favorite controller must return LibraryState');
  assert.match(ctrl, /setFavorite\(userId/, 'controller must delegate to setFavorite');

  const svc = f('server/modules/library/library.service.ts');
  // The favorite quick-action builds an explicit snapshot and reports the true transition;
  // it must NOT fall through to the old "fake removed row" construction.
  assert.match(svc, /buildState/, 'service must build an explicit snapshot');
  assert.match(svc, /async setFavorite/, 'service must expose setFavorite');
  assert.match(svc, /favoriteTransition/, 'service must report the true favorite transition');
  assert.match(svc, /'favorited'/, 'favorited direction present');
  assert.match(svc, /'unfavorited'/, 'unfavorited direction present');
  // Server-minted transition token on real change only; no in-memory client counter.
  assert.match(svc, /randomUUID\(\)/, 'service must mint a transitionToken with crypto.randomUUID');
  assert.match(svc, /transitionToken: favoriteTransition !== 'none' \? randomUUID\(\) : null/,
    'token must be present only when changed=true, null on no-op double-click');
});

test('events: direction-aware favorite/unfavorite keyed on the server transitionToken (no in-memory seq)', () => {
  const ev = f('client/src/utils/events.ts');
  assert.match(ev, /trackFavoriteTransition/, 'must expose a direction-aware favorite tracker');
  // The old in-memory per-paper ordinal is gone — it reset on reload and swallowed re-favorites.
  assert.ok(!ev.includes('favSeq'), 'in-memory favSeq must be removed (resets on reload)');
  // Key must embed the transitionToken.
  assert.match(ev, /transitionToken/, 'event idempotency key must use the server transitionToken');
  assert.match(ev, /\$\{weekStartKey\(\)\}:\$\{direction\}:\$\{paperId\}:\$\{transitionToken\}/,
    'key = week:direction:paperId:transitionToken');
});

test('FavoriteButton: filled/outline, 收藏/已收藏, aria-pressed/busy/disabled, stopPropagation', () => {
  const btn = f('client/src/library/FavoriteButton.tsx');
  assert.match(btn, /aria-pressed/, 'button must expose aria-pressed');
  assert.match(btn, /aria-busy/, 'button must expose aria-busy');
  assert.match(btn, /disabled=\{busy\}/, 'button must disable while pending');
  assert.match(btn, /e\.stopPropagation\(\)/, 'action must stopPropagation inside clickable rows');
  assert.match(btn, /已收藏/, 'labeled state must say 已收藏');
  assert.match(btn, /收藏/, 'must have 收藏 label');
  assert.match(btn, /fill-\[var\(--primary\)\]/, 'filled star style present');
});

test('store: optimistic update + rollback + per-action pending guard + direction events gated on token', () => {
  const store = f('client/src/library/library-store.ts');
  assert.match(store, /begin\(paperId, 'favorite'\)/, 'per-action pending guard used for favorite');
  assert.match(store, /hydratePaperLibrary\(paperId, prev\)/, 'failure must rollback to previous snapshot');
  assert.match(store, /trackFavoriteTransition\('favorite', paperId, res\.transitionToken\)/, 'fire favorite event with the server token');
  assert.match(store, /trackFavoriteTransition\('unfavorite', paperId, res\.transitionToken\)/, 'fire unfavorite event with the server token');
  assert.match(store, /res\.favoriteTransition/, 'events driven by server-reported true transition');
  assert.match(store, /res\.transitionToken/, 'event only fires when the server minted a token (changed=true)');
});

test('pages: favorite entry points use the shared FavoriteButton (no direct toggleFavorite calls)', () => {
  const forbidden: string[] = [];
  for (const p of [
    'client/src/components/RadarSection.tsx',
    'client/src/pages/Papers/Papers.tsx',
    'client/src/pages/Papers/PaperDetail.tsx',
    'client/src/pages/Sources/SourceDetail.tsx',
    'client/src/pages/Library/Library.tsx',
  ]) {
    const src = f(p);
    assert.ok(!src.includes('libraryApi.toggleFavorite') && !src.includes('toggleFavorite(paper.id'), `${p} must not call toggleFavorite directly`);
  }
  // The old client API method name must be retired in favor of setFavorite.
  const apiClient = f('client/src/api/library.ts');
  assert.ok(!apiClient.includes('toggleFavorite'), 'client library API must export setFavorite, not toggleFavorite');
});

test('paper detail: favorites hydrated from user_library, never from legacy workspace/favorites', () => {
  const pd = f('client/src/pages/Papers/PaperDetail.tsx');
  // No favorite hydration via the old workspace projection.
  assert.ok(!pd.includes('getFavorites'), 'PaperDetail must NOT call workspace.getFavorites()');
  // Favorite/reading state is hydrated from the authoritative user_library endpoint.
  assert.match(pd, /libraryApi\.getLibrary\(\)/, 'PaperDetail must hydrate from user_library list');
  assert.match(pd, /row\?\.isFavorite/, 'PaperDetail must read isFavorite from the user_library row');
  // Every favorite-capable UI surface must be free of legacy favorite reads.
  for (const p of [
    'client/src/components/RadarSection.tsx',
    'client/src/pages/Papers/Papers.tsx',
    'client/src/pages/Papers/PaperDetail.tsx',
    'client/src/pages/Sources/SourceDetail.tsx',
    'client/src/pages/Library/Library.tsx',
  ]) {
    assert.ok(!f(p).includes('getFavorites'), `${p} must not read favorites via the legacy workspace endpoint`);
  }
});

test('layout: md and below use a hamburger Sheet drawer; single responsive gutter; min-w-0 main', () => {
  const layout = f('client/src/components/Layout.tsx');
  // persistent sidebar hidden below lg (e.g. "hidden ... lg:flex")
  assert.ok(/hidden[\s\S]{0,300}lg:flex/.test(layout), 'persistent sidebar must be hidden below lg (drawer instead)');
  assert.match(layout, /Sheet/, 'mobile nav must use the Sheet drawer');
  assert.match(layout, /aria-label="打开导航菜单"/, 'hamburger must be labeled');
  assert.match(layout, /min-w-0 flex-1/, 'main must be min-w-0 to prevent horizontal overflow');
  assert.match(layout, /px-4 py-6 sm:px-6/, 'single responsive gutter on <main>');
  // Pages must NOT add their own max-w-[1080px] container anymore (the double-container bug).
  const dash = f('client/src/pages/Dashboard/Dashboard.tsx');
  const papers = f('client/src/pages/Papers/Papers.tsx');
  assert.ok(!dash.includes('max-w-[1080px]'), 'Dashboard must not re-declare the centered container');
  assert.ok(!papers.includes('max-w-[1080px]'), 'Papers must not re-declare the centered container');
});
test('papers list: long uppercase keywords wrap inside the card (no internal horizontal scroll)', () => {
  const papers = f('client/src/pages/Papers/Papers.tsx');
  assert.match(papers, /min-w-0 flex-1/, 'paper card text column must be min-w-0 flex-1');
  assert.match(papers, /flex flex-wrap items-center gap-2/, 'keyword chips container must flex-wrap');
  // inline-block (NOT inline-flex) + min-w-0 + max-w-full lets a 97-char no-space token
  // actually shrink and wrap; overflow-wrap:anywhere makes min-content small inside the chip.
  assert.match(papers, /inline-block max-w-full min-w-0[\s\S]*?overflow-wrap:anywhere/, 'keyword badge must be shrinkable inline-block with overflow-wrap:anywhere');
  assert.match(papers, /whitespace-normal/, 'keyword badge must override the base badge whitespace-nowrap');
});

test("store reset: identity change wipes all entries + pending so user B sees no stale visuals", () => {
  const store = f('client/src/library/library-store.ts');
  assert.match(store, /export function resetLibraryStore/, 'store must export resetLibraryStore');
  assert.match(store, /state\.clear\(\)/, 'reset must drop every cached per-paper entry');
  assert.match(store, /pending\.clear\(\)/, 'reset must also clear all pending guards');
  assert.match(store, /export function peekPaperLibraryState/, 'store needs a non-mutating read for list filtering');
  const auth = f('client/src/contexts/AuthContext.tsx');
  assert.match(auth, /resetLibraryStore\(\)/, 'AuthContext must call resetLibraryStore on identity change');
  assert.match(auth, /prevIdentityRef|user\?\.id/, 'reset must fire on user id change (login/logout/bootstrap swap)');
});

test('papers favorite filter: unfavorited card drops instantly via store subscription (rollback restores)', () => {
  const papers = f('client/src/pages/Papers/Papers.tsx');
  assert.match(papers, /subscribeLibrary\(bumpList\)/, 'list must subscribe to the shared store for instant updates');
  assert.match(papers, /peekPaperLibraryState\(paper\.id\)/, 'list must read explicit cached state (not materialize a default)');
  assert.match(papers, /favorite === '1' && cached && cached\.isFavorite === false\) return null/, 'favorite-only filter must drop a card when the store reports unfavorited');
});