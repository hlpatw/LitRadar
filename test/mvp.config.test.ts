import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MVP_SOURCES, CROSSREF_READY_ISSNS } from '../server/modules/sources/mvp.sources.ts';

test('MVP has exactly the 13 authoritative entities', () => {
  assert.equal(MVP_SOURCES.length, 13);
  const names = MVP_SOURCES.map((s) => s.name);
  for (const expected of [
    'Journal of Memory and Language',
    'Cognition',
    'Journal of Child Language',
    'First Language',
    'Applied Psycholinguistics',
    'Language Acquisition',
    'Bilingualism: Language and Cognition',
    'Language Development Research',
    'AMLaP',
    'HSP / CUNY Human Sentence Processing',
    'BUCLD',
    'arXiv cs.CL / stat.ML / q-bio.NC',
    'ACL Anthology',
  ]) {
    assert.ok(names.includes(expected), `missing MVP entity: ${expected}`);
  }
});

test('exactly 7 Crossref-ready journals, exact ISSN list', () => {
  assert.equal(CROSSREF_READY_ISSNS.length, 7);
  assert.deepEqual(
    CROSSREF_READY_ISSNS.slice().sort(),
    ['0010-0277', '0142-7164', '0142-7237', '0305-0009', '0749-596X', '1048-9223', '1366-7289'],
  );
});

test('conferences/preprints/library/oa-journal are skeleton, never ready', () => {
  for (const s of MVP_SOURCES) {
    if (s.sourceType !== 'journal' || !s.issn) {
      assert.equal(s.connectorStatus, 'skeleton', `${s.name} must be skeleton`);
    }
  }
});
