import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_REC_WEIGHTS } from '../shared/api.interface.ts';

test('default recommendation weights are present and explainable', () => {
  for (const k of ['interest', 'lexical', 'source', 'freshness', 'abstract'] as const) {
    assert.equal(typeof DEFAULT_REC_WEIGHTS[k], 'number');
    assert.ok(DEFAULT_REC_WEIGHTS[k] >= 0, `${k} weight must be non-negative`);
  }
  const total = Object.values(DEFAULT_REC_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(total > 0.9 && total < 1.1, `weights should normalize to ~1, got ${total}`);
});

test('library controller routes every handler through the shared authenticated-user helper', () => {
  const ctrlPath = join(import.meta.dirname, '..', 'server', 'modules', 'library', 'library.controller.ts');
  const source = readFileSync(ctrlPath, 'utf8');
  // no raw req.user access
  assert.equal(source.includes('req.user'), false);
  const uses = source.match(/const userId = getAuthenticatedUserId\(req\)/g) ?? [];
  // list, recommendations, upsert, remove, favorite, reading-state, setFeedback, clearFeedback = 8
  assert.ok(uses.length >= 8, `expected >=8 getAuthenticatedUserId uses, got ${uses.length}`);
});
