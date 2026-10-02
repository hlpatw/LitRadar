import { Injectable, Inject, Optional } from '@nestjs/common';
import { CrossrefWork, mapCrossrefWork, MappedPaper } from './crossref.mapper';
import { fetchWithRetry } from './retry.util';

export interface CrossrefFetchResult {
  items: MappedPaper[];
  total: number;
}

// Injectable fetch so tests can supply a stub without network.
export type FetchFn = (url: string, init?: Record<string, unknown>) => Promise<{
  status: number;
  headers?: Record<string, string | string[] | undefined>;
  json: () => Promise<unknown>;
}>;

// Explicit DI token — cannot rely on the (erased) FetchFn type as a paramtype.
export const CROSSREF_FETCH_FN = 'CROSSREF_FETCH_FN';

@Injectable()
export class CrossrefConnector {
  private readonly base = 'https://api.crossref.org';
  private readonly mailto = process.env.CROSSREF_MAILTO || 'litradar@example.com';
  private readonly fetchFn: FetchFn;

  constructor(@Optional() @Inject(CROSSREF_FETCH_FN) injected?: FetchFn) {
    this.fetchFn = (injected ?? (globalThis as any).fetch) as unknown as FetchFn;
  }

  /**
   * Fetch the most recent works for a journal ISSN, newest first. Real network call.
   * `since` (ISO date) enables an incremental pull: only works published on/after it
   * are requested (Crossref from-pub-date filter), so repeat runs fetch only deltas.
   *
   * Transient failures (HTTP 429 / 5xx / network timeout) are retried with a limited
   * exponential backoff that honours the Retry-After header. Permanent failures
   * (e.g. 404 unknown ISSN) are NOT retried and surface immediately.
   */
  async fetchRecent(issn: string, rows = 25, since?: string): Promise<CrossrefFetchResult> {
    const params = new URLSearchParams({
      rows: String(rows),
      sort: 'published',
      order: 'desc',
      select: 'DOI,title,author,abstract,issued,URL,type',
      mailto: this.mailto,
    });
    if (since) {
      params.set('filter', `from-pub-date:${since}`);
    }
    const url = `${this.base}/journals/${encodeURIComponent(issn)}/works?${params.toString()}`;

    const res = await fetchWithRetry(url, (u, init) =>
      this.fetchFn(u, { headers: { 'User-Agent': `LitRadar/1.0 (${this.mailto})` }, ...init }),
    );
    const body = (await res.json()) as {
      message?: { 'total-results'?: number; items?: CrossrefWork[] };
    };
    const items = (body.message?.items ?? [])
      .map(mapCrossrefWork)
      .filter((x): x is MappedPaper => x !== null);
    return { items, total: body.message?.['total-results'] ?? items.length };
  }
}
