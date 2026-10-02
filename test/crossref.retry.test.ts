import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from '../server/modules/connectors/retry.util.ts';

type Script = Array<{ status: number; body?: unknown; headers?: Record<string, string> }>;

function makeFetch(script: Script) {
  const calls: string[] = [];
  let i = 0;
  const fn = async (url: string) => {
    calls.push(url);
    const c = script[Math.min(i, script.length - 1)];
    i += 1;
    return {
      status: c.status,
      headers: c.headers ?? {},
      json: async () => c.body ?? { message: { items: [] } },
    };
  };
  return { fn, calls };
}

test('retries 429/5xx then succeeds; honours Retry-After', async () => {
  const { fn, calls } = makeFetch([
    { status: 429, headers: { 'retry-after': '0' } },
    { status: 503, headers: { 'retry-after': '0' } },
    { status: 200, body: { message: { 'total-results': 1, items: [{ DOI: '10.1/a' }] } } },
  ]);
  const res = await fetchWithRetry('https://x/y', fn, { baseDelayMs: 1 });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
});

test('does NOT retry permanent 404', async () => {
  const { fn, calls } = makeFetch([{ status: 404 }]);
  await assert.rejects(() => fetchWithRetry('https://x/y', fn, { baseDelayMs: 1 }), /HTTP 404/);
  assert.equal(calls.length, 1);
});

test('gives up after max attempts on persistent 5xx', async () => {
  const { fn, calls } = makeFetch([{ status: 500 }]);
  await assert.rejects(() => fetchWithRetry('https://x/y', fn, { baseDelayMs: 1, maxAttempts: 4 }), /after 4 attempts/);
  assert.equal(calls.length, 4);
});
