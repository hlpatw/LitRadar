import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { journals, papers, sourceSyncRuns } from '../../database/schema';
import { CrossrefConnector } from './crossref.connector';
import { normalizeDoi } from '../../common/utils/doi.util';

export interface SyncOutcome {
  sourceId: string;
  sourceName: string;
  runId: string;
  fetched: number;
  inserted: number;
  updated: number;
  status: 'ok' | 'error';
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
}
