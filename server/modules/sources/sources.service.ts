import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { asc, eq, and, count, gte, lte, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { journals, papers, sourceAliases, userLibrary } from '../../database/schema';
import { toIsoDate, toIsoDateTime } from '../../common/utils/safe-date';
import type {
  SourceDetail,
  SourcePaperItem,
  SourcePaperListResponse,
  PaginatedResponse,
  ReadingState,
} from '@shared/api.interface';

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
  connectorStatus: string;
  pollPolicy: string | null;
  lastSyncedAt: string | null;
  lastRunStatus: string | null;
  lastRunInserted: number | null;
  aliases: string[];
}

export interface SourcePaperFilters {
  search?: string;
  from?: string; // inclusive lower bound on published_date
  to?: string; // inclusive upper bound on published_date
  hasAbstract?: boolean; // true = only with abstract, false = only without
  notInLibrary?: boolean; // only papers not yet associated with this user
  order?: 'latest' | 'recommend';
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
        connectorStatus: journals.connectorStatus,
        pollPolicy: journals.pollPolicy,
        lastSyncedAt: journals.lastSyncedAt,
        aliases: sql<string[]>`COALESCE((SELECT json_agg(a.alias_name) FROM source_aliases a WHERE a.source_id = journals.id), '[]')`,
        lastRunStatus: sql<string | null>`(SELECT s.status FROM source_sync_runs s WHERE s.source_id = journals.id ORDER BY s.started_at DESC LIMIT 1)`,
        lastRunInserted: sql<number | null>`(SELECT s.inserted_count FROM source_sync_runs s WHERE s.source_id = journals.id ORDER BY s.started_at DESC LIMIT 1)`,
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
      connectorStatus: r.connectorStatus,
      pollPolicy: r.pollPolicy,
      lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
      aliases: r.aliases || [],
      lastRunStatus: r.lastRunStatus,
      lastRunInserted: r.lastRunInserted,
    }));
  }

  /** Full header metadata + counts for the user-facing source detail page. */
  async getById(id: string): Promise<SourceDetail> {
    const rows = await this.db
      .select({
        j: journals,
        paperCount: sql<number>`(SELECT count(*)::int FROM papers p WHERE p.journal_id = journals.id)`,
        childCount: sql<number>`(SELECT count(*)::int FROM journals c WHERE c.parent_id = journals.id)`,
        aliasCount: sql<number>`(SELECT count(*)::int FROM source_aliases a WHERE a.source_id = journals.id)`,
        aliases: sql<string[]>`COALESCE((SELECT json_agg(a.alias_name) FROM source_aliases a WHERE a.source_id = journals.id), '[]')`,
        // Latest TERMINAL run (ok/error) for header bookkeeping. A still-running run is NOT
        // folded in here; it is surfaced separately via runningRun.
        lastRun: sql<any>`(SELECT json_build_object(
          'status', s.status,
          'inserted', s.inserted_count,
          'updated', s.updated_count,
          'startedAt', s.started_at
        ) FROM source_sync_runs s
          WHERE s.source_id = journals.id AND s.status IN ('ok','error')
          ORDER BY s.started_at DESC LIMIT 1)`,
        runningRun: sql<any>`(SELECT json_build_object(
          'id', s.id,
          'startedAt', s.started_at
        ) FROM source_sync_runs s
          WHERE s.source_id = journals.id AND s.status = 'running'
          ORDER BY s.started_at DESC LIMIT 1)`,
      })
      .from(journals)
      .where(eq(journals.id, id))
      .limit(1);

    if (rows.length === 0) throw new NotFoundException('来源不存在');
    const r = rows[0];
    // json_build_object scalar subquery already deserializes to a plain object (or null).
    const lastRun = r.lastRun || null;
    const running = r.runningRun || null;

    return {
      id: r.j.id,
      parentId: r.j.parentId,
      name: r.j.name,
      abbreviation: r.j.abbreviation,
      sourceType: r.j.sourceType,
      priority: r.j.priority,
      category: r.j.category,
      description: r.j.description,
      url: r.j.url,
      issn: r.j.issn,
      externalId: r.j.externalId,
      status: r.j.status,
      connectorType: r.j.connectorType,
      connectorStatus: r.j.connectorStatus,
      pollPolicy: r.j.pollPolicy,
      updateFrequency: r.j.updateFrequency,
      lastSyncedAt: r.j.lastSyncedAt ? r.j.lastSyncedAt.toISOString() : null,
      lastRunStatus: lastRun?.status ?? null,
      lastRunInserted: lastRun?.inserted ?? null,
      lastRunUpdated: lastRun?.updated ?? null,
      lastRunStartedAt: lastRun?.startedAt ? toIsoDateTime(lastRun.startedAt) : null,
      runningRun: running
        ? { id: running.id, startedAt: toIsoDateTime(running.startedAt) ?? '' }
        : null,
      paperCount: r.paperCount,
      childCount: r.childCount,
      aliasCount: r.aliasCount,
      aliases: r.aliases || [],
    };
  }

  /**
   * Strict paper list for one source: scoped by journal_id, paginated, with the
   * user-facing filters (search / date window / has-abstract / not-in-library) and two
   * orderings: latest (published recency) and recommend (freshness + abstract + interest
   * overlap, all within this already-fixed source). Per-paper library state is joined so the
   * row can render favorite / reading-state actions directly.
   */
  async listPapers(
    sourceId: string,
    filters: SourcePaperFilters,
    userId: string | undefined,
    page = 1,
    pageSize = 20,
  ): Promise<SourcePaperListResponse> {
    // Validate the source exists up front (404, not an empty page).
    await this.getById(sourceId);

    const safePage = Math.max(page, 1);
    const safePageSize = Math.min(Math.max(pageSize, 1), 50);

    const conditions: any[] = [eq(papers.journalId, sourceId)];
    if (filters.search && filters.search.trim().length > 0) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(sql`(${papers.title} ilike ${term} OR ${papers.abstractText} ilike ${term})`);
    }
    if (filters.from) conditions.push(gte(papers.publishedDate, filters.from));
    if (filters.to) conditions.push(lte(papers.publishedDate, filters.to));
    if (filters.hasAbstract === true) conditions.push(sql`${papers.abstractText} IS NOT NULL AND ${papers.abstractText} <> ''`);
    if (filters.hasAbstract === false) conditions.push(sql`${papers.abstractText} IS NULL OR ${papers.abstractText} = ''`);
    if (filters.notInLibrary && userId) {
      conditions.push(sql`NOT EXISTS (SELECT 1 FROM user_library ul WHERE ul.paper_id = ${papers.id} AND ul.user_id = ${userId})`);
    }

    const where = and(...conditions);

    const [countRes] = await this.db.select({ total: count() }).from(papers).where(where);
    const total = countRes?.total ?? 0;

    // Ordering. 'latest' = most recently published (then fetched) first.
    // 'recommend' = reuse the user-facing recommendation rules but scoped to THIS source:
    // interest overlap with the user's configured keywords, then freshness, then has-abstract.
    // (The source-priority component is constant here because all rows share one sourceId.)
    let orderBy;
    if (filters.order === 'recommend') {
      orderBy = sql`
        (SELECT COALESCE(count(*),0)::numeric FROM user_settings us,
          unnest(string_to_array(COALESCE(us.interested_keywords,''), ',')) AS kw
         WHERE us.user_id = ${userId ?? ''}
           AND length(trim(kw)) > 0
           AND (lower(COALESCE(${papers.title},'') || ' ' || COALESCE(${papers.keywords},''))
                LIKE '%' || lower(trim(kw)) || '%')) DESC,
        GREATEST(0, 1 - ((CURRENT_DATE - COALESCE(${papers.publishedDate}, ${papers.fetchedAt}::date))::numeric / 730.0)) DESC,
        CASE WHEN ${papers.abstractText} IS NOT NULL AND ${papers.abstractText} <> '' THEN 1 ELSE 0 END DESC,
        ${papers.publishedDate} DESC NULLS LAST,
        ${papers.title} ASC
      `;
    } else {
      orderBy = sql`${papers.publishedDate} DESC NULLS LAST, ${papers.fetchedAt} DESC NULLS LAST, ${papers.createdAt} DESC`;
    }

    const offset = (safePage - 1) * safePageSize;
    const rows = await this.db
      .select({
        p: papers,
        jName: journals.name,
        lib: userId
          ? sql<any>`(SELECT row_to_json(t) FROM (SELECT ul.is_favorite AS "isFavorite", ul.reading_state AS "readingState" FROM user_library ul WHERE ul.paper_id = ${papers.id} AND ul.user_id = ${userId}) t)`
          : sql<null>`NULL`,
      })
      .from(papers)
      .leftJoin(journals, eq(papers.journalId, journals.id))
      .where(where)
      .orderBy(orderBy)
      .limit(safePageSize)
      .offset(offset);

    const items: SourcePaperItem[] = rows.map((r) => {
      const lib = (r.lib as any) || null;
      return {
        id: r.p.id,
        journalId: r.p.journalId,
        title: r.p.title,
        authors: r.p.authors,
        doi: r.p.doi,
        keywords: r.p.keywords,
        abstractText: r.p.abstractText,
        methods: r.p.methods,
        conclusions: r.p.conclusions,
        publishedDate: toIsoDate(r.p.publishedDate),
        url: r.p.url,
        createdAt: r.p.createdAt instanceof Date ? r.p.createdAt.toISOString() : String(r.p.createdAt),
        journalName: r.jName,
        inLibrary: Boolean(lib),
        isFavorite: Boolean(lib?.isFavorite),
        readingState: (lib?.readingState as ReadingState | null) ?? null,
      };
    });

    const source = await this.getById(sourceId);
    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
      source,
    };
  }
}
