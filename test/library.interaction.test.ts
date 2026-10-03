import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const f = (p: string) => readFileSync(join(root, p), 'utf8');

test('shared: LibraryState authoritative shape + unfavorite direction exist', () => {
  const shared = f('shared/api.interface.ts');
  assert.match(shared, /interface LibraryState/, 'LibraryState type must exist');
  for (const field of ['rowExists', 'libraryId', 'favoriteTransition', 'changed']) {
    assert.ok(shared.includes(field), `LibraryState must declare ${field}`);
  }
  assert.match(shared, /'unfavorite'/, 'BehaviorEventType must include unfavorite direction');
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
});

test('events: direction-aware favorite/unfavorite with per-paper transition ordinal', () => {
  const ev = f('client/src/utils/events.ts');
  assert.match(ev, /trackFavoriteTransition/, 'must expose a direction-aware favorite tracker');
  assert.match(ev, /favSeq/, 'per-paper transition ordinal must exist (re-favorite not swallowed)');
  // Plain fire-and-forget favorite keying is gone.
  assert.ok(!/eventType:\s*'favorite'/.test(ev) || ev.includes("direction"), 'favorite event must be direction-aware');
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

test('store: optimistic update + rollback + per-action pending guard + direction events', () => {
  const store = f('client/src/library/library-store.ts');
  assert.match(store, /begin\(paperId, 'favorite'\)/, 'per-action pending guard used for favorite');
  assert.match(store, /hydratePaperLibrary\(paperId, prev\)/, 'failure must rollback to previous snapshot');
  assert.match(store, /trackFavoriteTransition\('favorite'/, 'fire favorite event only on favorited transition');
  assert.match(store, /trackFavoriteTransition\('unfavorite'/, 'fire unfavorite event on unfavorited transition');
  assert.match(store, /res\.favoriteTransition/, 'events driven by server-reported true transition');
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
