import { Injectable, Inject } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { journals, sourceSyncRuns } from '../../database/schema';

export interface SourceRow {
  id: string;
  parentId: string | null;
  name: string;
  abbreviation: string | null;
  sourceType: string;
  priority: string;
  category: string | null;
  url: string | null;
  issn: string | null;
  status: string;
  connectorType: string | null;
  pollPolicy: string | null;
  lastSyncedAt: string | null;
  lastRunStatus: string | null;
  lastRunInserted: number | null;
}

@Injectable()
export class SourcesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Flat list of sources enriched for the UI: hierarchy (parentId), research priority,
   * polling policy, connector type/status, and the latest sync run. Archived sources are
   * returned (kept adjacent) but flagged, never deleted.
   */
  async list(): Promise<SourceRow[]> {
    const rows = await this.db
      .select({
        id: journals.id,
        parentId: journals.parentId,
        name: journals.name,
        abbreviation: journals.abbreviation,
        sourceType: journals.sourceType,
        priority: journals.priority,
        category: journals.category,
        url: journals.url,
        issn: journals.issn,
        status: journals.status,
        connectorType: journals.connectorType,
        pollPolicy: journals.pollPolicy,
        lastSyncedAt: journals.lastSyncedAt,
        lastRunStatus: sql<string | null>(
          `(SELECT s.status FROM source_sync_runs s WHERE s.source_id = journals.id ORDER BY s.started_at DESC LIMIT 1)`,
        ),
        lastRunInserted: sql<number | null>(
          `(SELECT s.inserted_count FROM source_sync_runs s WHERE s.source_id = journals.id ORDER BY s.started_at DESC LIMIT 1)`,
        ),
      })
      .from(journals)
      .orderBy(asc(journals.priority), asc(journals.name));

    return rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      abbreviation: r.abbreviation,
      sourceType: r.sourceType,
      priority: r.priority,
      category: r.category,
      url: r.url,
      issn: r.issn,
      status: r.status,
      connectorType: r.connectorType,
      pollPolicy: r.pollPolicy,
      lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
      lastRunStatus: r.lastRunStatus,
      lastRunInserted: r.lastRunInserted,
    }));
  }
}
