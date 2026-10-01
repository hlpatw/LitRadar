import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCrossrefWork } from '../server/modules/connectors/crossref.mapper.ts';

test('mapCrossrefWork maps a rich Crossref record and strips JATS abstract', () => {
  const out = mapCrossrefWork({
    DOI: '10.1234/ABC.1',
    title: ['A Study of Child Language'],
    author: [
      { given: 'Jane', family: 'Doe' },
      { given: 'John', family: 'Roe' },
    ],
    abstract: '<jats:p>We studied acquisition.</jats:p>',
    issued: { 'date-parts': [[2026, 3, 15]] },
    URL: 'https://api.crossref.org/works/10.1234/ABC.1',
  });
  assert.deepEqual(out, {
    doi: '10.1234/abc.1',
    title: 'A Study of Child Language',
    authors: 'Jane Doe, John Roe',
    abstractText: 'We studied acquisition.',
    publishedDate: '2026-03-15',
    url: 'https://api.crossref.org/works/10.1234/ABC.1',
  });
});

test('mapCrossrefWork skips records without DOI or title', () => {
  assert.equal(mapCrossrefWork({ title: ['no DOI'] }), null);
  assert.equal(mapCrossrefWork({ DOI: '10.1/x' }), null);
});
