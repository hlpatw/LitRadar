import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, eq, ilike, or, desc, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import {
  userLibrary,
  userRecommendationFeedback,
  userSettings,
  userNotes,
  papers,
  journals,
} from '../../database/schema';
import {
  DEFAULT_REC_WEIGHTS,
  type LibraryItem,
  type LibraryListResponse,
  type UpsertLibraryRequest,
  type RecommendationItem,
  type RecommendationResponse,
  type RecWeights,
  type ReadingState,
  type PaperDetail,
} from '@shared/api.interface';

export interface LibraryFilters {
  status?: string; // favorite | todo | reading | read
  priority?: string; // P0..P3
  tag?: string;
  q?: string;
  hasNotes?: boolean;
}

function mapPaperDetail(p: any, journalName: string | null, fetchedAt: Date | null): PaperDetail {
  return {
    id: p.id,
    journalId: p.journal_id ?? p.journalId ?? null,
    title: p.title,
    authors: p.authors,
    doi: p.doi,
    keywords: p.keywords,
    abstractText: p.abstract_text ?? p.abstractText ?? null,
    methods: p.methods,
    conclusions: p.conclusions,
    publishedDate: p.published_date
      ? (p.published_date instanceof Date ? p.published_date.toISOString().slice(0, 10) : String(p.published_date).slice(0, 10))
      : (p.publishedDate ?? null),
    url: p.url,
    createdAt: p._created_at
      ? (p._created_at instanceof Date ? p._created_at.toISOString() : String(p._created_at))
      : (p.createdAt ?? ''),
    journalName,
    fetchedAt: fetchedAt ? fetchedAt.toISOString() : null,
  };
}

@Injectable()
export class LibraryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // ── List my library with filters ──────────────────────────────────────────

  async list(userId: string, filters: LibraryFilters): Promise<LibraryListResponse> {
    const conds: any[] = [eq(userLibrary.userId, userId)];

    if (filters.status === 'favorite') conds.push(eq(userLibrary.isFavorite, true));
    else if (filters.status === 'todo' || filters.status === 'reading' || filters.status === 'read')
      conds.push(eq(userLibrary.readingState, filters.status as ReadingState));

    if (filters.priority) {
      conds.push(
        sql`EXISTS (SELECT 1 FROM journals j WHERE j.id = ${papers.journalId} AND j.priority = ${filters.priority})`,
      );
    }
    if (filters.tag) {
      conds.push(ilike(userLibrary.personalTags, `%${filters.tag}%`));
    }
    if (filters.q && filters.q.trim()) {
      const term = `%${filters.q.trim()}%`;
      conds.push(sql`(${papers.title} ilike ${term} OR ${papers.abstractText} ilike ${term})`);
    }
    if (filters.hasNotes) {
      conds.push(
        sql`EXISTS (SELECT 1 FROM user_notes n WHERE n.paper_id = ${userLibrary.paperId} AND n.user_id = ${userLibrary.userId})`,
      );
    }

    const rows = await this.db
      .select({
        lib: userLibrary,
        p: papers,
        jName: journals.name,
        noteCount: sql<number>`(SELECT count(*)::int FROM user_notes n WHERE n.paper_id = ${userLibrary.paperId} AND n.user_id = ${userLibrary.userId})`,
      })
      .from(userLibrary)
      .leftJoin(papers, eq(userLibrary.paperId, papers.id))
      .leftJoin(journals, eq(papers.journalId, journals.id))
      .where(conds.length > 1 ? and(...conds) : conds[0])
      .orderBy(desc(userLibrary.addedAt));

    const items: LibraryItem[] = rows.map((r) => ({
      id: r.lib.id,
      paperId: r.lib.paperId,
      isFavorite: r.lib.isFavorite,
      readingState: (r.lib.readingState as ReadingState | null) ?? null,
      personalTags: r.lib.personalTags,
      addedAt: r.lib.addedAt.toISOString(),
      paper: r.p
        ? mapPaperDetail(r.p, r.jName, r.p.fetchedAt)
        : null,
      noteCount: r.noteCount,
    }));

    return { items, total: items.length };
  }

  // ── Upsert / update association ───────────────────────────────────────────

  async upsert(userId: string, paperId: string, dto: UpsertLibraryRequest): Promise<LibraryItem> {
    const [paper] = await this.db
      .select({ id: papers.id })
      .from(papers)
      .where(eq(papers.id, paperId))
      .limit(1);
    if (!paper) throw new NotFoundException('论文不存在');

    const values: Record<string, unknown> = {
      userId,
      paperId,
      createdBy: userId,
      updatedBy: userId,
    };
    if (dto.isFavorite !== undefined) values.isFavorite = dto.isFavorite;
    if (dto.readingState !== undefined) values.readingState = dto.readingState;
    if (dto.personalTags !== undefined) values.personalTags = dto.personalTags;

    const [row] = await this.db
      .insert(userLibrary)
      .values(values as typeof userLibrary.$inferInsert)
      .onConflictDoUpdate({
        target: [userLibrary.userId, userLibrary.paperId],
        set: {
          ...(dto.isFavorite !== undefined ? { isFavorite: dto.isFavorite } : {}),
          ...(dto.readingState !== undefined ? { readingState: dto.readingState } : {}),
          ...(dto.personalTags !== undefined ? { personalTags: dto.personalTags } : {}),
          updatedAt: new Date(),
          updatedBy: userId,
        },
      })
      .returning();

    const [joined] = await this.db
      .select({ p: papers, jName: journals.name, noteCount: sql<number>`(SELECT count(*)::int FROM user_notes n WHERE n.paper_id = ${userLibrary.paperId} AND n.user_id = ${userLibrary.userId})` })
      .from(userLibrary)
      .leftJoin(papers, eq(userLibrary.paperId, papers.id))
      .leftJoin(journals, eq(papers.journalId, journals.id))
      .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)))
      .limit(1);

    return {
      id: row.id,
      paperId: row.paperId,
      isFavorite: row.isFavorite,
      readingState: (row.readingState as ReadingState | null) ?? null,
      personalTags: row.personalTags,
      addedAt: row.addedAt.toISOString(),
      paper: joined?.p ? mapPaperDetail(joined.p, joined.jName, joined.p.fetchedAt) : null,
      noteCount: joined?.noteCount ?? 0,
    };
  }

  // ── Remove association (notes preserved; paper becomes recommendable again) ──

  async remove(userId: string, paperId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: userLibrary.id })
      .from(userLibrary)
      .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)))
      .limit(1);
    if (!row) throw new NotFoundException('书架关联不存在');
    // user_notes references papers(id), NOT user_library, so notes are intentionally untouched.
    await this.db
      .delete(userLibrary)
      .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)));
  }

  // ── Feedback (uninterested) — separate table, never a library row ───────────

  async setFeedback(userId: string, paperId: string, feedbackType: 'uninterested', note?: string): Promise<void> {
    await this.db
      .insert(userRecommendationFeedback)
      .values({ userId, paperId, feedbackType, note: note ?? null, createdBy: userId, updatedBy: userId })
      .onConflictDoUpdate({
        target: [userRecommendationFeedback.userId, userRecommendationFeedback.paperId, userRecommendationFeedback.feedbackType],
        set: { note: note ?? null, updatedAt: new Date(), updatedBy: userId },
      });
  }

  async clearFeedback(userId: string, paperId: string, feedbackType: 'uninterested'): Promise<void> {
    await this.db
      .delete(userRecommendationFeedback)
      .where(
        and(
          eq(userRecommendationFeedback.userId, userId),
          eq(userRecommendationFeedback.paperId, paperId),
          eq(userRecommendationFeedback.feedbackType, feedbackType),
        ),
      );
  }

  // ── In-database explainable recommendations ────────────────────────────────

  private resolveWeights(override?: Partial<RecWeights> | null, stored?: Record<string, number> | null): RecWeights {
    return { ...DEFAULT_REC_WEIGHTS, ...(stored ?? {}), ...(override ?? {}) };
  }

  async recommend(
    userId: string,
    limit = 20,
    weightOverride?: Partial<RecWeights> | null,
  ): Promise<RecommendationResponse> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const [settingsRow] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const weights = this.resolveWeights(weightOverride, (settingsRow?.recWeights as Record<string, number> | null) ?? null);

    // Pure-SQL candidate selection + explainable components. No LLM, no external calls.
    // Exclusions: ANY user_library row (favorite/todo/reading/read alike) AND uninterested feedback.
    const result = await this.db.execute(sql`
      WITH settings AS (
        SELECT interested_keywords FROM user_settings WHERE user_id = ${userId}
      ),
      interest_tokens AS (
        SELECT DISTINCT lower(trim(t)) AS tok
        FROM settings, unnest(string_to_array(settings.interested_keywords, ',')) AS t
        WHERE settings.interested_keywords IS NOT NULL AND trim(t) <> ''
      ),
      corpus_tokens AS (
        SELECT DISTINCT lower(trim(t)) AS tok FROM (
          SELECT p.keywords AS kw FROM user_library ul JOIN papers p ON p.id = ul.paper_id WHERE ul.user_id = ${userId}
          UNION
          SELECT p.keywords AS kw FROM user_notes n JOIN papers p ON p.id = n.paper_id
            WHERE n.user_id = ${userId} AND n.paper_id IS NOT NULL
        ) src, unnest(string_to_array(src.kw, ',')) AS t
        WHERE src.kw IS NOT NULL AND trim(t) <> ''
      ),
      excluded_lib AS (
        SELECT paper_id FROM user_library WHERE user_id = ${userId}
      ),
      excluded_neg AS (
        SELECT paper_id FROM user_recommendation_feedback
        WHERE user_id = ${userId} AND feedback_type = 'uninterested'
      ),
      cand AS (
        SELECT
          p.id, p.journal_id, p.title, p.authors, p.doi, p.keywords, p.abstract_text,
          p.methods, p.conclusions, p.published_date, p.url, p.fetched_at, p._created_at,
          j.name AS journal_name, j.priority AS source_priority
        FROM papers p
        LEFT JOIN journals j ON j.id = p.journal_id
        WHERE p.id NOT IN (SELECT paper_id FROM excluded_lib)
          AND p.id NOT IN (SELECT paper_id FROM excluded_neg)
      ),
      scored AS (
        SELECT
          cand.*,
          (SELECT count(*) FROM interest_tokens it WHERE cand.keywords ILIKE '%' || it.tok || '%') AS interest_hits,
          (SELECT count(*) FROM corpus_tokens ct WHERE cand.keywords ILIKE '%' || ct.tok || '%') AS corpus_hits,
          (SELECT count(*) FROM unnest(string_to_array(cand.keywords, ',')) AS t WHERE trim(t) <> '') AS kw_count
        FROM cand
      )
      SELECT
        scored.*,
        (scored.kw_count::numeric) AS kw_count_n,
        (CASE WHEN scored.kw_count > 0 THEN LEAST(1.0, scored.interest_hits::numeric / scored.kw_count) ELSE 0 END) AS interest_score,
        (CASE WHEN scored.kw_count > 0 THEN LEAST(1.0, scored.corpus_hits::numeric / scored.kw_count) ELSE 0 END) AS lexical_score,
        (CASE scored.source_priority
          WHEN 'P0' THEN 1.0 WHEN 'P1' THEN 0.75 WHEN 'P2' THEN 0.5 WHEN 'P3' THEN 0.25 ELSE 0.4 END) AS source_score,
        (GREATEST(0, 1 - ((CURRENT_DATE - COALESCE(scored.published_date, scored.fetched_at::date, CURRENT_DATE))::numeric / 730.0))) AS freshness_score,
        (CASE WHEN scored.abstract_text IS NOT NULL AND scored.abstract_text <> '' THEN 1.0 ELSE 0.0 END) AS abstract_score
      FROM scored
    `);

    const rows = ((result as any).rows ?? result ?? []) as any[];

    const coldStart =
      !(await this.db.select({ n: sql<number>`count(*)::int` }).from(userLibrary).where(eq(userLibrary.userId, userId)))[0]?.n &&
      !(await this.db.select({ n: sql<number>`count(*)::int` }).from(userNotes).where(and(eq(userNotes.userId, userId), sql`${userNotes.paperId} IS NOT NULL`)))[0]?.n;

    const scored = rows.map((r) => {
      const interest = Number(r.interest_score);
      const lexical = Number(r.lexical_score);
      const source = Number(r.source_score);
      const freshness = Number(r.freshness_score);
      const abstract = Number(r.abstract_score);
      const total =
        weights.interest * interest +
        weights.lexical * lexical +
        weights.source * source +
        weights.freshness * freshness +
        weights.abstract * abstract;

      const reasons: string[] = [];
      if (interest > 0) reasons.push(`匹配你的兴趣关键词`);
      if (lexical > 0) reasons.push(`与你已收藏/已读论文关键词重合`);
      if (source >= 0.75) reasons.push(`来自高优先级来源(${r.source_priority ?? '未知'})`);
      if (freshness > 0.7) reasons.push(`近期发表`);
      if (abstract >= 1) reasons.push(`含摘要`);
      if (coldStart) reasons.push(`冷启动：基于兴趣关键词与来源优先级推荐`);

      const paper: PaperDetail = mapPaperDetail(
        { ...r, _created_at: r._created_at },
        r.journal_name,
        r.fetched_at,
      );
      return {
        paper,
        score: Number(total.toFixed(4)),
        breakdown: { interest, lexical, source, freshness, abstract },
        reasons,
      } as RecommendationItem;
    });

    scored.sort((a, b) => b.score - a.score);
    const items = scored.slice(0, safeLimit);

    const [excludedLibCount] = await this.db.select({ n: sql<number>`count(*)::int` }).from(userLibrary).where(eq(userLibrary.userId, userId));
    const [excludedNegCount] = await this.db.select({ n: sql<number>`count(*)::int` }).from(userRecommendationFeedback).where(and(eq(userRecommendationFeedback.userId, userId), eq(userRecommendationFeedback.feedbackType, 'uninterested')));

    return {
      items,
      coldStart: Boolean(coldStart),
      weights,
      excluded: {
        library: excludedLibCount?.n ?? 0,
        uninterested: excludedNegCount?.n ?? 0,
      },
    };
  }
}
