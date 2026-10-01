import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidUuid, normalizeDoi, isValidDoi } from '../server/common/utils/doi.util.ts';

test('isValidUuid accepts canonical UUIDs and rejects garbage', () => {
  assert.equal(isValidUuid('123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), true);
  // the acceptance case: /api/papers/1 must be rejected (400), not query the DB
  assert.equal(isValidUuid('1'), false);
  assert.equal(isValidUuid('not-a-uuid'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid(undefined), false);
});

test('normalizeDoi strips resolver prefixes and lowercases', () => {
  assert.equal(normalizeDoi('https://doi.org/10.1234/ABC.567'), '10.1234/abc.567');
  assert.equal(normalizeDoi('http://dx.doi.org/10.1/XYZ'), '10.1/xyz');
  assert.equal(normalizeDoi('  10.9999/keepMe  '), '10.9999/keepme');
  assert.equal(normalizeDoi('   '), null);
  assert.equal(normalizeDoi(undefined), null);
});

test('isValidDoi accepts proper DOIs and rejects malformed', () => {
  assert.equal(isValidDoi('10.1016/j.jml.2024.10.001'), true);
  assert.equal(isValidDoi('https://doi.org/10.1111/cogs.12345'), true);
  assert.equal(isValidDoi('not-a-doi'), false);
  assert.equal(isValidDoi(''), false);
});
