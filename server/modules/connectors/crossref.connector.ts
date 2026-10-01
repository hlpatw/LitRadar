import { Injectable } from '@nestjs/common';
import { CrossrefWork, mapCrossrefWork, MappedPaper } from './crossref.mapper';

export interface CrossrefFetchResult {
  items: MappedPaper[];
  total: number;
}

// Injectable fetch so tests can supply a stub without network.
export type FetchFn = (url: string, init?: Record<string, unknown>) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

@Injectable()
export class CrossrefConnector {
  private readonly base = 'https://api.crossref.org';
  private readonly mailto = process.env.CROSSREF_MAILTO || 'litradar@example.com';
  private readonly fetchFn: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this.fetchFn = (fetchFn ?? globalThis.fetch) as unknown as FetchFn;
  }

  /**
   * Fetch the most recent works for a journal ISSN, newest first. Real network call.
   * `since` (ISO date) enables an incremental pull: only works published on/after it
   * are requested (Crossref from-pub-date filter), so repeat runs fetch only deltas.
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

    const res = await this.fetchFn(url, { headers: { 'User-Agent': `LitRadar/1.0 (${this.mailto})` } });
    if (res.status >= 400) {
      throw new Error(`Crossref request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      message?: { 'total-results'?: number; items?: CrossrefWork[] };
    };
    const items = (body.message?.items ?? [])
      .map(mapCrossrefWork)
      .filter((x): x is MappedPaper => x !== null);
    return { items, total: body.message?.['total-results'] ?? items.length };
  }
}
