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
   * Fetch the most recent works for a journal ISSN, newest first. Real network call;
   * returns mapped papers ready for DOI upsert.
   */
  async fetchRecent(issn: string, rows = 25): Promise<CrossrefFetchResult> {
    const url =
      `${this.base}/journals/${encodeURIComponent(issn)}/works` +
      `?rows=${rows}&sort=published&order=desc` +
      `&select=DOI,title,author,abstract,issued,URL,type` +
      `&mailto=${encodeURIComponent(this.mailto)}`;

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
