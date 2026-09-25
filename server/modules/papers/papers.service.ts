import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, ilike, count, sql } from 'drizzle-orm';
import { papers, journals } from '../../database/schema';
import type {
  PaperItem,
  PaperDetail,
  CreatePaperRequest,
  UpdatePaperRequest,
  PaginatedResponse,
} from '@shared/api.interface';

@Injectable()
export class PapersService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(
    journalId: string | undefined,
    search: string | undefined,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<PaginatedResponse<PaperItem>> {
    const safePageSize = Math.min(Math.max(pageSize, 1), 50);
    const safePage = Math.max(page, 1);

    const conditions: ReturnType<typeof eq>[] = [];
    if (journalId) conditions.push(eq(papers.journalId, journalId));
    if (search && search.trim().length > 0) {
      conditions.push(ilike(papers.title, `%${search.trim()}%`));
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
    };
  }

  async create(
    dto: CreatePaperRequest,
    userId: string,
  ): Promise<PaperItem> {
    if (!dto.title || dto.title.trim().length === 0) {
      throw new BadRequestException('标题不能为空');
    }

    const [row] = await this.db
      .insert(papers)
      .values({
        journalId: dto.journalId ?? null,
        title: dto.title.trim(),
        authors: dto.authors ?? null,
        doi: dto.doi ?? null,
        keywords: dto.keywords ?? null,
        abstractText: dto.abstractText ?? null,
        methods: dto.methods ?? null,
        conclusions: dto.conclusions ?? null,
        publishedDate: dto.publishedDate ?? null,
        url: dto.url ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return this.mapToPaperItem(row);
  }

  async update(
    id: string,
    dto: UpdatePaperRequest,
    userId: string,
  ): Promise<PaperItem> {
    const patch: Partial<typeof papers.$inferInsert> = {};

    if (dto.title !== undefined) {
      if (!dto.title || dto.title.trim().length === 0) {
        throw new BadRequestException('标题不能为空');
      }
      patch.title = dto.title.trim();
    }
    if (dto.authors !== undefined) patch.authors = dto.authors;
    if (dto.doi !== undefined) patch.doi = dto.doi;
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
    const [deleted] = await this.db
      .delete(papers)
      .where(eq(papers.id, id))
      .returning({ id: papers.id });

    if (!deleted) {
      throw new NotFoundException('论文不存在');
    }
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