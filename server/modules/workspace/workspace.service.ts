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
  userLibrary,
  papers,
  journals,
  sourceSyncRuns,
} from '../../database/schema';
import { eq, and, asc, desc, count, gte, sql } from 'drizzle-orm';
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
  PaperDetail,
  Overview,
  OverviewRun,
  ReadingState,
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

// Reading-state <-> legacy checklist status mapping. The authority stores todo|reading|read;
// the legacy checklist API speaks todo|in_progress|done.
const STATE_TO_LEGACY: Record<ReadingState, ChecklistItem['status']> = {
  todo: 'todo',
  reading: 'in_progress',
  read: 'done',
};
const LEGACY_TO_STATE: Record<string, ReadingState> = {
  todo: 'todo',
  in_progress: 'reading',
  done: 'read',
};

function toLegacyStatus(s: ReadingState | null): ChecklistItem['status'] {
  if (!s) return 'todo';
  return STATE_TO_LEGACY[s];
}
function fromLegacyStatus(s: string | null | undefined): ReadingState {
  if (s && LEGACY_TO_STATE[s]) return LEGACY_TO_STATE[s];
  return 'todo';
}

@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  // ── Dashboard (all counts read the single user_library authority) ──

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
        .from(userLibrary)
        .where(and(eq(userLibrary.userId, userId), eq(userLibrary.isFavorite, true))),
      this.db
        .select({ count: count() })
        .from(userLibrary)
        .where(
          and(
            eq(userLibrary.userId, userId),
            eq(userLibrary.readingState, 'todo'),
          ),
        ),
      this.db
        .select({ count: count() })
        .from(userLibrary)
        .where(
          and(
            eq(userLibrary.userId, userId),
            eq(userLibrary.readingState, 'read'),
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

  async getOverview(userId: string): Promise<Overview> {
    const stats = await this.getDashboard(userId);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weekRes] = await this.db
      .select({ n: count() })
      .from(papers)
      .where(gte(papers.createdAt, weekAgo));

    const [failedRes] = await this.db
      .select({ n: count() })
      .from(sourceSyncRuns)
      .where(sql`${sourceSyncRuns.status} = 'error'`);

    const recentRows = await this.db
      .select({ p: papers, jName: journals.name })
      .from(papers)
      .leftJoin(journals, eq(papers.journalId, journals.id))
      .orderBy(desc(papers.createdAt))
      .limit(8);
    const recentPapers: PaperDetail[] = recentRows.map(
      (r): PaperDetail => ({
        ...mapPaper(r.p),
        journalName: r.jName ?? null,
        fetchedAt: r.p.fetchedAt ? r.p.fetchedAt.toISOString() : null,
      }),
    );

    const runRows = await this.db
      .select({ r: sourceSyncRuns, jName: journals.name })
      .from(sourceSyncRuns)
      .leftJoin(journals, eq(sourceSyncRuns.sourceId, journals.id))
      .orderBy(desc(sourceSyncRuns.startedAt))
      .limit(8);
    const recentRuns: OverviewRun[] = runRows.map((r) => ({
      id: r.r.id,
      sourceName: r.jName ?? null,
      status: r.r.status,
      startedAt: r.r.startedAt.toISOString(),
      insertedCount: r.r.insertedCount,
      updatedCount: r.r.updatedCount,
    }));

    return {
      stats,
      newThisWeek: weekRes?.n ?? 0,
      failedRuns: failedRes?.n ?? 0,
      recentPapers,
      recentRuns,
    };
  }

  // ── Favorites (legacy API backed by user_library authority) ──

  async listFavorites(userId: string): Promise<FavoriteItem[]> {
    const rows = await this.db
      .select()
      .from(userLibrary)
      .leftJoin(papers, eq(userLibrary.paperId, papers.id))
      .where(
        and(eq(userLibrary.userId, userId), eq(userLibrary.isFavorite, true)),
      )
      .orderBy(desc(userLibrary.addedAt));

    return rows.map(
      (r: {
        user_library: typeof userLibrary.$inferSelect;
        papers: typeof papers.$inferSelect | null;
      }) => ({
        id: r.user_library.id,
        paperId: r.user_library.paperId,
        paper: r.papers ? mapPaper(r.papers) : (null as unknown as PaperItem),
        createdAt: r.user_library.addedAt.toISOString(),
      }),
    );
  }

  async addFavorite(userId: string, paperId: string): Promise<void> {
    const [paper] = await this.db
      .select({ id: papers.id })
      .from(papers)
      .where(eq(papers.id, paperId))
      .limit(1);
    if (!paper) throw new NotFoundException('论文不存在');

    // Upsert the single (user,paper) row; flipping is_favorite on.
    await this.db
      .insert(userLibrary)
      .values({ userId, paperId, isFavorite: true, createdBy: userId, updatedBy: userId })
      .onConflictDoUpdate({
        target: [userLibrary.userId, userLibrary.paperId],
        set: { isFavorite: true, updatedAt: new Date(), updatedBy: userId },
      });
  }

  async removeFavorite(userId: string, paperId: string): Promise<void> {
    // Clear the favorite flag. If the row now carries no reading state and no tags, it is an
    // empty association -> delete it so the paper can re-enter recommendations.
    const [row] = await this.db
      .select()
      .from(userLibrary)
      .where(
        and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)),
      )
      .limit(1);
    if (!row) return; // already not associated -> idempotent success.

    await this.db
      .update(userLibrary)
      .set({ isFavorite: false, updatedAt: new Date(), updatedBy: userId })
      .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)));

    if (
      row.readingState === null &&
      (row.personalTags === null || row.personalTags.trim() === '')
    ) {
      await this.db
        .delete(userLibrary)
        .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)));
    }
  }

  // ── Checklist (paper-linked rows live in user_library; orphan free-text rows stay in
  //    reading_checklist because they are not paper associations) ──

  async listChecklist(userId: string): Promise<ChecklistItem[]> {
    // paper-linked from the authority
    const libRows = await this.db
      .select()
      .from(userLibrary)
      .leftJoin(papers, eq(userLibrary.paperId, papers.id))
      .where(
        and(
          eq(userLibrary.userId, userId),
          sql`${userLibrary.readingState} IS NOT NULL`,
        ),
      )
      .orderBy(asc(userLibrary.addedAt));

    // orphan free-text entries (paper_id IS NULL) from the legacy table
    const orphanRows = await this.db
      .select()
      .from(readingChecklist)
      .where(
        and(
          eq(readingChecklist.userId, userId),
          sql`${readingChecklist.paperId} IS NULL`,
        ),
      )
      .orderBy(asc(readingChecklist.sortOrder), asc(readingChecklist.createdAt));

    const paperLinked: ChecklistItem[] = libRows.map(
      (r: {
        user_library: typeof userLibrary.$inferSelect;
        papers: typeof papers.$inferSelect | null;
      }) => ({
        id: r.user_library.id,
        paperId: r.user_library.paperId,
        titleOverride: null,
        status: toLegacyStatus(r.user_library.readingState),
        sortOrder: 0,
        paper: r.papers ? mapPaper(r.papers) : null,
        createdAt: r.user_library.addedAt.toISOString(),
        updatedAt: r.user_library.updatedAt.toISOString(),
      }),
    );

    const orphans: ChecklistItem[] = orphanRows.map(
      (r: typeof readingChecklist.$inferSelect): ChecklistItem => ({
        id: r.id,
        paperId: null,
        titleOverride: r.titleOverride,
        status: r.status as ChecklistItem['status'],
        sortOrder: r.sortOrder,
        paper: null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }),
    );

    return [...orphans, ...paperLinked];
  }

  async createChecklistItem(
    userId: string,
    dto: CreateChecklistRequest,
  ): Promise<ChecklistItem> {
    // Linked to a real paper -> upsert the authority row.
    if (dto.paperId) {
      const [paper] = await this.db
        .select({ id: papers.id })
        .from(papers)
        .where(eq(papers.id, dto.paperId))
        .limit(1);
      if (!paper) throw new NotFoundException('论文不存在');

      const state = fromLegacyStatus(dto.status);
      const [row] = await this.db
        .insert(userLibrary)
        .values({
          userId,
          paperId: dto.paperId,
          readingState: state,
          createdBy: userId,
          updatedBy: userId,
        })
        .onConflictDoUpdate({
          target: [userLibrary.userId, userLibrary.paperId],
          set: { readingState: state, updatedAt: new Date(), updatedBy: userId },
        })
        .returning();

      return {
        id: row.id,
        paperId: row.paperId,
        titleOverride: null,
        status: toLegacyStatus(row.readingState),
        sortOrder: 0,
        paper: null,
        createdAt: row.addedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }

    // Free-text orphan entry -> legacy reading_checklist (not a paper association).
    const [inserted] = await this.db
      .insert(readingChecklist)
      .values({
        userId,
        paperId: null,
        titleOverride: dto.titleOverride ?? null,
        status: dto.status ?? 'todo',
      })
      .returning();

    return {
      id: inserted.id,
      paperId: null,
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
    // Route by id: paper-linked rows live in user_library; orphans in reading_checklist.
    const [libRow] = await this.db
      .select()
      .from(userLibrary)
      .where(and(eq(userLibrary.id, id), eq(userLibrary.userId, userId)))
      .limit(1);

    if (libRow) {
      const patch: Record<string, unknown> = {};
      if (dto.status !== undefined) patch.readingState = fromLegacyStatus(dto.status);
      if (Object.keys(patch).length === 0) {
        throw new BadRequestException('未提供可更新字段');
      }
      patch.updatedAt = new Date();
      patch.updatedBy = userId;
      const [updated] = await this.db
        .update(userLibrary)
        .set(patch as typeof userLibrary.$inferInsert)
        .where(eq(userLibrary.id, id))
        .returning();
      return {
        id: updated.id,
        paperId: updated.paperId,
        titleOverride: null,
        status: toLegacyStatus(updated.readingState),
        sortOrder: 0,
        paper: null,
        createdAt: updated.addedAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    }

    const [orphan] = await this.db
      .select()
      .from(readingChecklist)
      .where(and(eq(readingChecklist.id, id), eq(readingChecklist.userId, userId)))
      .limit(1);
    if (!orphan) throw new NotFoundException('阅读清单记录不存在');

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
    const [libRow] = await this.db
      .select()
      .from(userLibrary)
      .where(and(eq(userLibrary.id, id), eq(userLibrary.userId, userId)))
      .limit(1);
    if (libRow) {
      // Removing from the reading list: clear reading state. If the row is otherwise empty
      // (no favorite, no tags), delete it entirely so the paper can re-enter recommendations.
      const emptied =
        libRow.isFavorite === false &&
        (libRow.personalTags === null || libRow.personalTags.trim() === '');
      if (emptied) {
        await this.db.delete(userLibrary).where(eq(userLibrary.id, id));
      } else {
        await this.db
          .update(userLibrary)
          .set({ readingState: null, updatedAt: new Date(), updatedBy: userId })
          .where(eq(userLibrary.id, id));
      }
      return;
    }

    const [orphan] = await this.db
      .select({ id: readingChecklist.id })
      .from(readingChecklist)
      .where(and(eq(readingChecklist.id, id), eq(readingChecklist.userId, userId)))
      .limit(1);
    if (!orphan) throw new NotFoundException('阅读清单记录不存在');
    await this.db.delete(readingChecklist).where(eq(readingChecklist.id, id));
  }

  // ── Notes (single table, linked to paper/user; unaffected by library split) ──

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

  // ── Settings (now also persists per-user recommendation weights) ──

  async getSettings(userId: string): Promise<UserSettings & { recWeights: Record<string, number> | null }> {
    const [row] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    if (!row) {
      return { id: '', fieldOfStudy: null, interestedKeywords: null, recWeights: null };
    }

    return {
      id: row.id,
      fieldOfStudy: row.fieldOfStudy,
      interestedKeywords: row.interestedKeywords,
      recWeights: (row.recWeights as Record<string, number> | null) ?? null,
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsRequest,
  ): Promise<UserSettings & { recWeights: Record<string, number> | null }> {
    const [existing] = await this.db
      .select({ id: userSettings.id })
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (dto.fieldOfStudy !== undefined) patch.fieldOfStudy = dto.fieldOfStudy;
      if (dto.interestedKeywords !== undefined)
        patch.interestedKeywords = dto.interestedKeywords;
      if (dto.recWeights !== undefined) patch.recWeights = dto.recWeights;
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
        recWeights: (updated.recWeights as Record<string, number> | null) ?? null,
      };
    }

    const [inserted] = await this.db
      .insert(userSettings)
      .values({
        userId,
        fieldOfStudy: dto.fieldOfStudy ?? null,
        interestedKeywords: dto.interestedKeywords ?? null,
        recWeights: dto.recWeights ?? null,
      })
      .returning();

    return {
      id: inserted.id,
      fieldOfStudy: inserted.fieldOfStudy,
      interestedKeywords: inserted.interestedKeywords,
      recWeights: (inserted.recWeights as Record<string, number> | null) ?? null,
    };
  }
}
