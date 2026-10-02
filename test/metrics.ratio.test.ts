// Internal-metrics conversion formula: explicit numerator/denominator/zero handling.
// A conversion rate must be `null` when the denominator is 0 (no exposure), never 0 —
// otherwise the dashboard reads "0% CTR" for a paper nobody has seen.
import test from 'node:test';
import assert from 'node:assert/strict';

const mod: any = await import('../dist/server/common/utils/rate.js');
const safeRate = mod.safeRate ?? mod.default?.safeRate;
assert.equal(typeof safeRate, 'function', 'safeRate not exported');

test('zero denominator -> null (no divide-by-zero, no fake 0%)', () => {
  assert.equal(safeRate(0, 0), null);
  assert.equal(safeRate(5, 0), null);
});

test('negative denominator -> null', () => {
  assert.equal(safeRate(1, -3), null);
});

test('normal ratio rounded to 4dp', () => {
  assert.equal(safeRate(1, 4), 0.25);
  assert.equal(safeRate(3, 7), 0.4286);
  assert.equal(safeRate(10, 10), 1);
});

test('CTR detail/impression contract', () => {
  // 2 details / 5 impressions = 0.4
  assert.equal(safeRate(2, 5), 0.4);
  // 0 details / 3 impressions = 0 (a real zero conversion, distinct from no exposure)
  assert.equal(safeRate(0, 3), 0);
});
