// Source-level (no browser) regression for the ordinary Dashboard reorder:
//   * Weekly Radar Top10 is the FIRST substantive section (RadarSection before the summary strip).
//   * The global 7 count cards are demoted to a compact research summary.
//   * The raw recent-sync operations table is removed from the ordinary Dashboard.
//   * Recent user notes with paper links are surfaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dash = readFileSync(
  join(import.meta.dirname, '..', 'client', 'src', 'pages', 'Dashboard', 'Dashboard.tsx'),
  'utf8',
);

test('Radar Top10 is rendered before the research summary', () => {
  const radarIdx = dash.indexOf('<RadarSection />');
  const summaryIdx = dash.indexOf('{/* Compact research summary */}');
  assert.ok(radarIdx >= 0, 'Dashboard must render <RadarSection />');
  assert.ok(summaryIdx > radarIdx, 'RadarSection must come BEFORE the research summary section');
});

test('raw recent-sync operations table is removed from the ordinary Dashboard', () => {
  assert.doesNotMatch(dash, /最近同步/, 'sync ops table heading must be gone');
  assert.doesNotMatch(dash, /recentRuns/, 'dashboard must not consume the sync-runs list');
  assert.doesNotMatch(dash, /OverviewRun/, 'OverviewRun type should no longer be referenced on dashboard');
});

test('global 7 count cards demoted to compact research summary', () => {
  // The old per-card global counts are replaced by a 5-metric compact strip.
  assert.match(dash, /本周新增论文/, 'summary must include this-week new');
  assert.match(dash, /关键词命中/, 'summary must include keyword hits');
  assert.match(dash, /高优先待读/, 'summary must include high-relevance pending');
  assert.match(dash, /待读积压/, 'summary must include todo backlog');
  assert.doesNotMatch(dash, /期刊源/, 'old global journal card must be gone');
});

test('recent notes are surfaced with paper links', () => {
  assert.match(dash, /最近笔记/, 'recent notes heading present');
  assert.match(dash, /recentNotes/, 'dashboard consumes recentNotes');
  assert.match(dash, /`\/papers\/\$\{n\.paperId\}`/, 'note row must link through to its paper');
});
