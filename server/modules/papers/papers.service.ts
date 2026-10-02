import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DATABASE, type Database } from '../../database/database.module';
import { eq, and, ilike, count, sql, gte, lte } from 'drizzle-orm';
import { papers, journals } from '../../database/schema';
import { isValidUuid, normalizeDoi, isValidDoi } from '../../common/utils/doi.util';
import type {
  PaperItem,
  PaperDetail,
  CreatePaperRequest,
  UpdatePaperRequest,
  PaginatedResponse,
} from '@shared/api.interface';

export interface PaperFilters {
  journalId?: string;
  search?: string;
  from?: string; // inclusive lower bound on published_date
  to?: string; // inclusive upper bound on published_date
  priority?: string; // P0..P3 on the source
  hasAbstract?: boolean; // true = only with abstract, false = only without
  favorite?: boolean; // scoped to current user
  todo?: boolean; // in current user's reading checklist
}

@Injectable()
export class PapersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async list(
    filters: PaperFilters,
    userId: string | undefined,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedResponse<PaperItem>> {
    const safePageSize = Math.min(Math.max(pageSize, 1), 50);
    const safePage = Math.max(page, 1);

    const conditions: any[] = [];
    if (filters.journalId) conditions.push(eq(papers.journalId, filters.journalId));
    if (filters.search && filters.search.trim().length > 0) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        sql`(${papers.title} ilike ${term} OR ${papers.abstractText} ilike ${term})`,
      );
    }
    if (filters.from) conditions.push(gte(papers.publishedDate, filters.from));
    if (filters.to) conditions.push(lte(papers.publishedDate, filters.to));
    if (filters.priority) {
      conditions.push(sql`EXISTS (SELECT 1 FROM journals j WHERE j.id = ${papers.journalId} AND j.priority = ${filters.priority})`);
    }
    if (filters.hasAbstract === true) conditions.push(sql`${papers.abstractText} IS NOT NULL`);
    if (filters.hasAbstract === false) conditions.push(sql`${papers.abstractText} IS NULL`);
    if (filters.favorite && userId) {
      conditions.push(sql`EXISTS (SELECT 1 FROM user_favorites f WHERE f.paper_id = ${papers.id} AND f.user_id = ${userId})`);
    }
    if (filters.todo && userId) {
      conditions.push(sql`EXISTS (SELECT 1 FROM reading_checklist c WHERE c.paper_id = ${papers.id} AND c.user_id = ${userId})`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ total: count() })
      .from(papers)
      .where(where);
    const total: number = countResult?.total ?? 0;

    const offset = (safePage - 1) * safePageSize;
    const rows = await this.db
      .select()
      .from(papers)
      .where(where)
      .orderBy(sql`${papers.createdAt} DESC`)
      .limit(safePageSize)
      .offset(offset);

    return {
      items: rows.map((row: typeof papers.$inferSelect) =>
        this.mapToPaperItem(row),
      ),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async detail(id: string): Promise<PaperDetail> {
    // Explicit identifier validation: non-UUID input is a 400, never a SQL error/500.
    this.assertUuid(id);

    const rows = await this.db
      .select()
      .from(papers)
      .leftJoin(journals, eq(papers.journalId, journals.id))
      .where(eq(papers.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('论文不存在');
    }

    const [row] = rows;
    return {
      ...this.mapToPaperItem(row.papers),
      journalName: row.journals?.name ?? null,
      fetchedAt: row.papers.fetchedAt ? row.papers.fetchedAt.toISOString() : null,
    };
  }

  async create(
    dto: CreatePaperRequest,
    userId: string,
  ): Promise<PaperItem> {
    if (!dto.title || dto.title.trim().length === 0) {
      throw new BadRequestException('标题不能为空');
    }
    const doi = this.prepareDoi(dto.doi);

    // Idempotent upsert on DOI: inserting a paper whose DOI already exists updates it
    // instead of violating the partial unique index.
    const [row] = await this.db
      .insert(papers)
      .values({
        journalId: dto.journalId ?? null,
        title: dto.title.trim(),
        authors: dto.authors ?? null,
        doi,
        keywords: dto.keywords ?? null,
        abstractText: dto.abstractText ?? null,
        methods: dto.methods ?? null,
        conclusions: dto.conclusions ?? null,
        publishedDate: dto.publishedDate ?? null,
        url: dto.url ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .onConflictDoUpdate({
        target: papers.doi,
        // Must EXACTLY match the partial-unique index papers_doi_unique predicate
        // (0001_sources.up.sql / schema.ts): ON CONFLICT inference requires the WHERE
        // clause to equal the index predicate, otherwise Postgres raises 42P10.
        targetWhere: sql`doi IS NOT NULL AND doi <> ''`,
        set: {
          title: dto.title.trim(),
          authors: dto.authors ?? null,
          abstractText: dto.abstractText ?? null,
          publishedDate: dto.publishedDate ?? null,
          url: dto.url ?? null,
          updatedBy: userId,
        },
      })
      .returning();

    return this.mapToPaperItem(row);
  }

  async update(
    id: string,
    dto: UpdatePaperRequest,
    userId: string,
  ): Promise<PaperItem> {
    this.assertUuid(id);
    const patch: Partial<typeof papers.$inferInsert> = {};

    if (dto.title !== undefined) {
      if (!dto.title || dto.title.trim().length === 0) {
        throw new BadRequestException('标题不能为空');
      }
      patch.title = dto.title.trim();
    }
    if (dto.authors !== undefined) patch.authors = dto.authors;
    if (dto.doi !== undefined) patch.doi = this.prepareDoi(dto.doi);
    if (dto.keywords !== undefined) patch.keywords = dto.keywords;
    if (dto.abstractText !== undefined)
      patch.abstractText = dto.abstractText;
    if (dto.methods !== undefined) patch.methods = dto.methods;
    if (dto.conclusions !== undefined)
      patch.conclusions = dto.conclusions;
    if (dto.publishedDate !== undefined)
      patch.publishedDate = dto.publishedDate;
    if (dto.url !== undefined) patch.url = dto.url;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();
    patch.updatedBy = userId;

    const [updated] = await this.db
      .update(papers)
      .set(patch)
      .where(eq(papers.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException('论文不存在');
    }

    return this.mapToPaperItem(updated);
  }

  async delete(id: string): Promise<void> {
    this.assertUuid(id);
    const [deleted] = await this.db
      .delete(papers)
      .where(eq(papers.id, id))
      .returning({ id: papers.id });

    if (!deleted) {
      throw new NotFoundException('论文不存在');
    }
  }

  private assertUuid(id: string): void {
    if (!isValidUuid(id)) {
      throw new BadRequestException('非法的论文 ID（应为 UUID）');
    }
  }

  private prepareDoi(raw: string | undefined): string | null {
    if (raw === undefined || raw === null) return null;
    const normalized = normalizeDoi(raw);
    if (normalized === null) return null; // empty -> null (allowed)
    if (!isValidDoi(normalized)) {
      throw new BadRequestException('非法的 DOI');
    }
    return normalized;
  }

  private mapToPaperItem(
    row: typeof papers.$inferSelect,
  ): PaperItem {
    return {
      id: row.id,
      journalId: row.journalId,
      title: row.title,
      authors: row.authors,
      doi: row.doi,
      keywords: row.keywords,
      abstractText: row.abstractText,
      methods: row.methods,
      conclusions: row.conclusions,
      publishedDate: row.publishedDate,
      url: row.url,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    };
  }
}
