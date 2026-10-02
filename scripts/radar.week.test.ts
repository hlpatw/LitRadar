// Week-anchor contract for radar/digest/dashboard.
// The product "this week" = Asia/Shanghai ISO Monday 00:00 local == Sunday 16:00 UTC.
// These assertions pin the exact UTC instant so a rolling-7d / UTC-week drift can't sneak back in.
import assert from 'node:assert/strict';

const mod: any = await import('../dist/server/modules/radar/radar.service.js');
const isoWeekStart = mod.isoWeekStart ?? mod.default?.isoWeekStart;
const weekStartKey = mod.weekStartKey ?? mod.default?.weekStartKey;
assert.equal(typeof isoWeekStart, 'function', 'isoWeekStart not exported');

// 2026-09-28 is an ISO Monday. Local Monday 00:00 CST == Sunday 2026-09-27 16:00:00Z.
const MON_2026_09_28_CST_0000 = new Date('2026-09-27T16:00:00.000Z');

// 1) At the exact boundary (Mon 00:00 CST / Sun 16:00 UTC) the week start is that instant.
assert.equal(
  isoWeekStart(MON_2026_09_28_CST_0000).toISOString(),
  MON_2026_09_28_CST_0000.toISOString(),
  'week start must equal the Mon-00:00-CST instant (Sun 16:00 UTC)',
);

// 2) One minute BEFORE the boundary (Sun 23:59 CST = Sun 15:59 UTC) still belongs to last week.
const justBefore = new Date('2026-09-27T15:59:00.000Z'); // Sun 23:59 CST
assert.equal(
  isoWeekStart(justBefore).toISOString(),
  new Date('2026-09-20T16:00:00.000Z').toISOString(),
  'Sun 23:59 CST must roll back to the previous Monday',
);

// 3) The stored key is the Shanghai WALL Monday date (not a UTC date).
assert.equal(weekStartKey(MON_2026_09_28_CST_0000), '2026-09-28');

// 4) A mid-week instant (Wed noon CST = Wed 04:00 UTC) anchors to the same Monday.
const wedNoon = new Date('2026-09-30T04:00:00.000Z'); // Wed 12:00 CST
assert.equal(isoWeekStart(wedNoon).toISOString(), MON_2026_09_28_CST_0000.toISOString());

console.log('[ok] radar week anchor: Mon-00:00-CST = Sun-16:00-UTC boundary pinned');
