import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, inArray, sql, desc } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { journals, papers, sourceSyncRuns } from '../../database/schema';
import { CrossrefConnector } from './crossref.connector';
import { normalizeDoi } from '../../common/utils/doi.util';
import { CROSSREF_READY_ISSNS } from '../sources/mvp.sources';

export interface SyncOutcome {
  sourceId: string;
  sourceName: string;
  runId: string;
  fetched: number;
  inserted: number;
  updated: number;
  status: 'ok' | 'error';
}

export interface SyncRunRow {
  id: string;
  sourceId: string;
  sourceName: string | null;
  connectorType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  message: string | null;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger('IngestionService');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly crossref: CrossrefConnector,
  ) {}

  /**
   * Run one incremental ingestion for a single source (looked up by ISSN).
   * Real network fetch; papers are upserted idempotently on DOI. A source_sync_runs
   * row records provenance (source, start/finish, counts). No fixtures.
   */
  async syncSourceByIssn(issn: string, rows = 25): Promise<SyncOutcome> {
    const source = await this.db.select().from(journals).where(eq(journals.issn, issn)).limit(1);
    if (source.length === 0) {
      throw new Error(`No journal row for ISSN ${issn}`);
    }
    const src = source[0];

    const [run] = await this.db
      .insert(sourceSyncRuns)
      .values({ sourceId: src.id, connectorType: 'crossref', status: 'running' })
      .returning({ id: sourceSyncRuns.id });

    try {
      const { items } = await this.crossref.fetchRecent(
        issn,
        rows,
        src.lastSyncedAt ? src.lastSyncedAt.toISOString().slice(0, 10) : undefined,
      );
      const dois = items.map((i) => normalizeDoi(i.doi)!).filter(Boolean);

      // Determine which DOIs already exist (idempotency / inserted-vs-updated accounting).
      const existing = dois.length
        ? await this.db.select({ doi: papers.doi }).from(papers).where(inArray(papers.doi, dois))
        : [];
      const existingDois = new Set(existing.map((e) => (e.doi || '').toLowerCase()));

      let inserted = 0;
      let updated = 0;
      for (const item of items) {
        const doi = normalizeDoi(item.doi)!;
        const wasNew = !existingDois.has(doi);
        await this.db
          .insert(papers)
          .values({
            journalId: src.id,
            title: item.title,
            authors: item.authors,
            doi,
            abstractText: item.abstractText,
            publishedDate: item.publishedDate,
            url: item.url,
            fetchedAt: new Date(),
            sourceRunId: run.id,
          })
          .onConflictDoUpdate({
            target: papers.doi,
            // Must EXACTLY match the partial unique index papers_doi_unique
            // (schema.ts: WHERE doi IS NOT NULL AND doi <> '').
            targetWhere: sql`doi IS NOT NULL AND doi <> ''`,
            set: {
              title: item.title,
              authors: item.authors,
              abstractText: item.abstractText,
              publishedDate: item.publishedDate,
              url: item.url,
              fetchedAt: new Date(),
              sourceRunId: run.id,
            },
          });
        if (wasNew) inserted += 1;
        else updated += 1;
      }

      await this.db
        .update(sourceSyncRuns)
        .set({
          status: 'ok',
          finishedAt: new Date(),
          fetchedCount: items.length,
          insertedCount: inserted,
          updatedCount: updated,
        })
        .where(eq(sourceSyncRuns.id, run.id));

      await this.db.update(journals).set({ lastSyncedAt: new Date() }).where(eq(journals.id, src.id));

      this.logger.log(`synced ${src.name}: fetched=${items.length} inserted=${inserted} updated=${updated}`);
      return {
        sourceId: src.id,
        sourceName: src.name,
        runId: run.id,
        fetched: items.length,
        inserted,
        updated,
        status: 'ok',
      };
    } catch (err) {
      await this.db
        .update(sourceSyncRuns)
        .set({ status: 'error', finishedAt: new Date(), message: String((err as Error).message) })
        .where(eq(sourceSyncRuns.id, run.id));
      throw err;
    }
  }

  /**
   * Manual, admin-gated, on-demand pull of every Crossref-ready MVP journal.
   * There is NO scheduler: this only runs when an operator calls it. Per-source
   * errors are isolated so one failing venue does not abort the rest.
   */
  async syncAllReady(): Promise<SyncOutcome[]> {
    const outcomes: SyncOutcome[] = [];
    for (const issn of CROSSREF_READY_ISSNS) {
      try {
        outcomes.push(await this.syncSourceByIssn(issn));
      } catch (err) {
        this.logger.error(`sync-all failed for ISSN ${issn}: ${(err as Error).message}`);
      }
    }
    return outcomes;
  }

  /** Recent sync runs joined with the source name, newest first (for the UI status panel). */
  async listRuns(limit = 50): Promise<SyncRunRow[]> {
    const rows = await this.db
      .select({
        id: sourceSyncRuns.id,
        sourceId: sourceSyncRuns.sourceId,
        sourceName: journals.name,
        connectorType: sourceSyncRuns.connectorType,
        status: sourceSyncRuns.status,
        startedAt: sourceSyncRuns.startedAt,
        finishedAt: sourceSyncRuns.finishedAt,
        fetchedCount: sourceSyncRuns.fetchedCount,
        insertedCount: sourceSyncRuns.insertedCount,
        updatedCount: sourceSyncRuns.updatedCount,
        message: sourceSyncRuns.message,
      })
      .from(sourceSyncRuns)
      .leftJoin(journals, eq(sourceSyncRuns.sourceId, journals.id))
      .orderBy(desc(sourceSyncRuns.startedAt))
      .limit(Math.min(Math.max(limit, 1), 200));

    return rows.map((r) => ({
      id: r.id,
      sourceId: r.sourceId,
      sourceName: r.sourceName,
      connectorType: r.connectorType,
      status: r.status,
      startedAt: (r.startedAt as Date).toISOString(),
      finishedAt: r.finishedAt ? (r.finishedAt as Date).toISOString() : null,
      fetchedCount: r.fetchedCount,
      insertedCount: r.insertedCount,
      updatedCount: r.updatedCount,
      message: r.message,
    }));
  }
}
