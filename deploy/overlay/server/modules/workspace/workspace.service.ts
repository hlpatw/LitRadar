import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DATABASE,
  type Database,
} from '../../database/database.module';
import {
  userFavorites,
  userNotes,
  readingChecklist,
  userSettings,
  papers,
  journals,
} from '../../database/schema';
import { eq, and, asc, desc, count } from 'drizzle-orm';
import type {
  DashboardStats,
  FavoriteItem,
  ChecklistItem,
  NoteItem,
  UserSettings,
  CreateChecklistRequest,
  UpdateChecklistRequest,
  CreateNoteRequest,
  UpdateNoteRequest,
  UpdateSettingsRequest,
  PaperItem,
} from '@shared/api.interface';

function mapPaper(p: typeof papers.$inferSelect): PaperItem {
  return {
    id: p.id,
    journalId: p.journalId,
    title: p.title,
    authors: p.authors,
    doi: p.doi,
    keywords: p.keywords,
    abstractText: p.abstractText,
    methods: p.methods,
    conclusions: p.conclusions,
    publishedDate: p.publishedDate,
    url: p.url,
    createdAt: p.createdAt.toISOString(),
  };
}

@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  // ── Dashboard ──

  async getDashboard(userId: string): Promise<DashboardStats> {
    const [
      journalResult,
      paperResult,
      favoriteResult,
      todoResult,
      doneResult,
      noteResult,
    ] = await Promise.all([
      this.db.select({ count: count() }).from(journals),
      this.db.select({ count: count() }).from(papers),
      this.db
        .select({ count: count() })
        .from(userFavorites)
        .where(eq(userFavorites.userId, userId)),
      this.db
        .select({ count: count() })
        .from(readingChecklist)
        .where(
          and(
            eq(readingChecklist.userId, userId),
            eq(readingChecklist.status, 'todo'),
          ),
        ),
      this.db
        .select({ count: count() })
        .from(readingChecklist)
        .where(
          and(
            eq(readingChecklist.userId, userId),
            eq(readingChecklist.status, 'done'),
          ),
        ),
      this.db
        .select({ count: count() })
        .from(userNotes)
        .where(eq(userNotes.userId, userId)),
    ]);

    return {
      journalCount: journalResult[0].count,
      paperCount: paperResult[0].count,
      favoriteCount: favoriteResult[0].count,
      checklistTodoCount: todoResult[0].count,
      checklistDoneCount: doneResult[0].count,
      noteCount: noteResult[0].count,
    };
  }

  // ── Favorites ──

  async listFavorites(userId: string): Promise<FavoriteItem[]> {
    const rows = await this.db
      .select()
      .from(userFavorites)
      .leftJoin(papers, eq(userFavorites.paperId, papers.id))
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.createdAt));

    return rows.map(
      (r: {
        user_favorites: typeof userFavorites.$inferSelect;
        papers: typeof papers.$inferSelect | null;
      }) => ({
        id: r.user_favorites.id,
        paperId: r.user_favorites.paperId,
        paper: r.papers ? mapPaper(r.papers) : (null as unknown as PaperItem),
        createdAt: r.user_favorites.createdAt.toISOString(),
      }),
    );
  }

  async addFavorite(userId: string, paperId: string): Promise<void> {
    await this.db
      .insert(userFavorites)
      .values({ userId, paperId })
      .onConflictDoNothing();
  }

  async removeFavorite(userId: string, paperId: string): Promise<void> {
    const existing = await this.db
      .select({ id: userFavorites.id })
      .from(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.paperId, paperId),
        ),
      );

    if (existing.length === 0) {
      throw new NotFoundException('收藏记录不存在');
    }

    await this.db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.paperId, paperId),
        ),
      );
  }

  // ── Checklist ──

  async listChecklist(userId: string): Promise<ChecklistItem[]> {
    const rows = await this.db
      .select()
      .from(readingChecklist)
      .leftJoin(papers, eq(readingChecklist.paperId, papers.id))
      .where(eq(readingChecklist.userId, userId))
      .orderBy(
        asc(readingChecklist.sortOrder),
        asc(readingChecklist.createdAt),
      );

    return rows.map(
      (r: {
        reading_checklist: typeof readingChecklist.$inferSelect;
        papers: typeof papers.$inferSelect | null;
      }) => ({
        id: r.reading_checklist.id,
        paperId: r.reading_checklist.paperId,
        titleOverride: r.reading_checklist.titleOverride,
        status: r.reading_checklist.status as ChecklistItem['status'],
        sortOrder: r.reading_checklist.sortOrder,
        paper: r.papers ? mapPaper(r.papers) : null,
        createdAt: r.reading_checklist.createdAt.toISOString(),
        updatedAt: r.reading_checklist.updatedAt.toISOString(),
      }),
    );
  }

  async createChecklistItem(
    userId: string,
    dto: CreateChecklistRequest,
  ): Promise<ChecklistItem> {
    const [inserted] = await this.db
      .insert(readingChecklist)
      .values({
        userId,
        paperId: dto.paperId ?? null,
        titleOverride: dto.titleOverride ?? null,
        status: dto.status ?? 'todo',
      })
      .returning();

    return {
      id: inserted.id,
      paperId: inserted.paperId,
      titleOverride: inserted.titleOverride,
      status: inserted.status as ChecklistItem['status'],
      sortOrder: inserted.sortOrder,
      paper: null,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };
  }

  async updateChecklistItem(
    userId: string,
    id: string,
    dto: UpdateChecklistRequest,
  ): Promise<ChecklistItem> {
    const [existing] = await this.db
      .select({ userId: readingChecklist.userId })
      .from(readingChecklist)
      .where(eq(readingChecklist.id, id));

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('阅读清单记录不存在');
    }

    const patch: Record<string, unknown> = {};
    if (dto.paperId !== undefined) patch.paperId = dto.paperId;
    if (dto.titleOverride !== undefined) patch.titleOverride = dto.titleOverride;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();
    patch.updatedBy = userId;

    const [updated] = await this.db
      .update(readingChecklist)
      .set(patch as typeof readingChecklist.$inferInsert)
      .where(eq(readingChecklist.id, id))
      .returning();

    return {
      id: updated.id,
      paperId: updated.paperId,
      titleOverride: updated.titleOverride,
      status: updated.status as ChecklistItem['status'],
      sortOrder: updated.sortOrder,
      paper: null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteChecklistItem(userId: string, id: string): Promise<void> {
    const [existing] = await this.db
      .select({ userId: readingChecklist.userId })
      .from(readingChecklist)
      .where(eq(readingChecklist.id, id));

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('阅读清单记录不存在');
    }

    await this.db.delete(readingChecklist).where(eq(readingChecklist.id, id));
  }

  // ── Notes ──

  async listNotes(userId: string): Promise<NoteItem[]> {
    const rows = await this.db
      .select()
      .from(userNotes)
      .leftJoin(papers, eq(userNotes.paperId, papers.id))
      .where(eq(userNotes.userId, userId))
      .orderBy(desc(userNotes.updatedAt));

    return rows.map(
      (r: {
        user_notes: typeof userNotes.$inferSelect;
        papers: typeof papers.$inferSelect | null;
      }) => ({
        id: r.user_notes.id,
        content: r.user_notes.content,
        paperId: r.user_notes.paperId,
        paper: r.papers ? mapPaper(r.papers) : null,
        createdAt: r.user_notes.createdAt.toISOString(),
        updatedAt: r.user_notes.updatedAt.toISOString(),
      }),
    );
  }

  async createNote(
    userId: string,
    dto: CreateNoteRequest,
  ): Promise<NoteItem> {
    const [inserted] = await this.db
      .insert(userNotes)
      .values({
        userId,
        content: dto.content,
        paperId: dto.paperId ?? null,
      })
      .returning();

    return {
      id: inserted.id,
      content: inserted.content,
      paperId: inserted.paperId,
      paper: null,
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    };
  }

  async updateNote(
    userId: string,
    id: string,
    dto: UpdateNoteRequest,
  ): Promise<NoteItem> {
    const [existing] = await this.db
      .select({ userId: userNotes.userId })
      .from(userNotes)
      .where(eq(userNotes.id, id));

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('笔记记录不存在');
    }

    const patch: Record<string, unknown> = {};
    if (dto.content !== undefined) patch.content = dto.content;
    if (dto.paperId !== undefined) patch.paperId = dto.paperId;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();
    patch.updatedBy = userId;

    const [updated] = await this.db
      .update(userNotes)
      .set(patch as typeof userNotes.$inferInsert)
      .where(eq(userNotes.id, id))
      .returning();

    return {
      id: updated.id,
      content: updated.content,
      paperId: updated.paperId,
      paper: null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteNote(userId: string, id: string): Promise<void> {
    const [existing] = await this.db
      .select({ userId: userNotes.userId })
      .from(userNotes)
      .where(eq(userNotes.id, id));

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('笔记记录不存在');
    }

    await this.db.delete(userNotes).where(eq(userNotes.id, id));
  }

  // ── Settings ──

  async getSettings(userId: string): Promise<UserSettings> {
    const [row] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    if (!row) {
      return { id: '', fieldOfStudy: null, interestedKeywords: null };
    }

    return {
      id: row.id,
      fieldOfStudy: row.fieldOfStudy,
      interestedKeywords: row.interestedKeywords,
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsRequest,
  ): Promise<UserSettings> {
    const [existing] = await this.db
      .select({ id: userSettings.id })
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (dto.fieldOfStudy !== undefined) patch.fieldOfStudy = dto.fieldOfStudy;
      if (dto.interestedKeywords !== undefined)
        patch.interestedKeywords = dto.interestedKeywords;
      patch.updatedAt = new Date();
      patch.updatedBy = userId;

      const [updated] = await this.db
        .update(userSettings)
        .set(patch as typeof userSettings.$inferInsert)
        .where(eq(userSettings.id, existing.id))
        .returning();

      return {
        id: updated.id,
        fieldOfStudy: updated.fieldOfStudy,
        interestedKeywords: updated.interestedKeywords,
      };
    }

    const [inserted] = await this.db
      .insert(userSettings)
      .values({
        userId,
        fieldOfStudy: dto.fieldOfStudy ?? null,
        interestedKeywords: dto.interestedKeywords ?? null,
      })
      .returning();

    return {
      id: inserted.id,
      fieldOfStudy: inserted.fieldOfStudy,
      interestedKeywords: inserted.interestedKeywords,
    };
  }
}