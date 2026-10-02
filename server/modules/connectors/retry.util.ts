// Plain (decoration-free) retry policy so it can be unit-tested with node:test.
// Retries transient failures (HTTP 429 / 5xx / network timeout) with limited
// exponential backoff that honours Retry-After. Permanent failures (>=400,
// non-transient) are NOT retried.

export interface RetryableResponse {
  status: number;
  headers?: Record<string, string | string[] | undefined>;
  json: () => Promise<unknown>;
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const TRANSIENT = /aborted|timeout|network|fetch failed|ENOTFOUND|ECONNRESET/i;

export async function fetchWithRetry(
  url: string,
  fetchFn: (u: string, init?: Record<string, unknown>) => Promise<RetryableResponse>,
  opts: RetryOptions = {},
): Promise<RetryableResponse> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  let delayMs = opts.baseDelayMs ?? 500;
  let attempt = 0;

  for (;;) {
    attempt += 1;
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(20_000) });
      const transientStatus = res.status === 429 || (res.status >= 500 && res.status <= 599);
      if (transientStatus) {
        if (attempt >= maxAttempts) {
          throw new Error(`Crossref request failed after ${attempt} attempts: HTTP ${res.status}`);
        }
        const ra = Number(res.headers?.['retry-after']);
        const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : delayMs;
        await new Promise((r) => setTimeout(r, waitMs));
        delayMs = Math.min(delayMs * 2, maxDelayMs);
        continue;
      }
      if (res.status >= 400) {
        // Permanent (e.g. 404 unknown ISSN) — do not retry.
        throw new Error(`Crossref request failed: HTTP ${res.status}`);
      }
      return res;
    } catch (err) {
      const transientNet = err instanceof Error && TRANSIENT.test(err.message);
      if (!transientNet || attempt >= maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }
}
