import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, eq, ilike, or, desc, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { toIsoDate, toIsoDateTime } from '../../common/utils/safe-date';
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
  type LibraryState,
} from '@shared/api.interface';

export interface LibraryFilters {
  status?: string; // favorite | todo | reading | read
  priority?: string; // P0..P3
  tag?: string;
  q?: string;
  hasNotes?: boolean;
}

function mapPaperDetail(p: any, journalName: string | null, fetchedAt: unknown): PaperDetail {
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
    publishedDate: toIsoDate(p.published_date ?? p.publishedDate),
    url: p.url,
    createdAt: toIsoDateTime(p._created_at ?? p.createdAt) ?? '',
    journalName,
    fetchedAt: toIsoDateTime(fetchedAt),
  };
}

// Non-downgrade rule for QUICK add-to-list intents: keep the more advanced of existing vs
// incoming reading_state (read > reading > todo). Used by the upsert path; the explicit
// reading-state selector bypasses this and honors the user's choice verbatim.
function preserveMoreAdvancedState(incoming: ReadingState) {
  return sql`CASE
    WHEN ${userLibrary.readingState} = 'read' THEN 'read'
    WHEN ${userLibrary.readingState} = 'reading' THEN (CASE WHEN ${incoming} = 'read' THEN 'read' ELSE 'reading' END)
    WHEN ${userLibrary.readingState} = 'todo' THEN (CASE WHEN ${incoming} IN ('reading','read') THEN ${incoming} ELSE 'todo' END)
    ELSE ${incoming}
  END`;
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
      addedAt: toIsoDateTime(r.lib.addedAt) ?? '',
      paper: r.p
        ? mapPaperDetail(r.p, r.jName, r.p.fetchedAt)
        : null,
      noteCount: r.noteCount,
    }));

    return { items, total: items.length };
  }

  // ── Upsert / update association ───────────────────────────────────────────
  //
  // Non-regression rule (server-enforced): a *quick* intent (e.g. recommendation card
  // "加入书架并设为待读") must never silently downgrade a more-advanced reading state.
  // It preserves max(existing, incoming). Only an EXPLICIT state selector
  // (opts.explicitState) — the user deliberately picking a state — may regress.

  async upsert(
    userId: string,
    paperId: string,
    dto: UpsertLibraryRequest,
    opts: { explicitState?: boolean } = {},
  ): Promise<LibraryItem> {
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

    // Non-explicit quick write supplies a reading state -> keep the more advanced of
    // existing vs incoming on conflict (never downgrade read/reading to todo).
    const preserveReadingState =
      dto.readingState !== undefined && !opts.explicitState
        ? preserveMoreAdvancedState(dto.readingState as ReadingState)
        : undefined;

    const [row] = await this.db
      .insert(userLibrary)
      .values(values as typeof userLibrary.$inferInsert)
      .onConflictDoUpdate({
        target: [userLibrary.userId, userLibrary.paperId],
        set: {
          ...(dto.isFavorite !== undefined ? { isFavorite: dto.isFavorite } : {}),
          ...(dto.readingState !== undefined
            ? preserveReadingState
              ? { readingState: preserveReadingState }
              : { readingState: dto.readingState }
            : {}),
          ...(dto.personalTags !== undefined ? { personalTags: dto.personalTags } : {}),
          updatedAt: new Date(),
          updatedBy: userId,
        },
      })
      .returning();

    // Unified unfavorite rule: if the favorite was just cleared and the row now carries no
    // reading state and no personal tags, it is an empty association -> delete it so the paper
    // can re-enter recommendations. If it still has status/tags, only the flag is cleared.
    if (dto.isFavorite === false) {
      const [current] = await this.db
        .select()
        .from(userLibrary)
        .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)))
        .limit(1);
      const empty =
        current &&
        current.isFavorite === false &&
        current.readingState === null &&
        (current.personalTags === null || current.personalTags.trim() === '');
      if (empty) {
        await this.db
          .delete(userLibrary)
          .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)));
      }
    }

    const [joined] = await this.db
      .select({ lib: userLibrary, p: papers, jName: journals.name, noteCount: sql<number>`(SELECT count(*)::int FROM user_notes n WHERE n.paper_id = ${userLibrary.paperId} AND n.user_id = ${userLibrary.userId})` })
      .from(userLibrary)
      .leftJoin(papers, eq(userLibrary.paperId, papers.id))
      .leftJoin(journals, eq(papers.journalId, journals.id))
      .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)))
      .limit(1);

    if (!joined) {
      // Row was cleaned up as an empty association (unfavorited with no state/tags).
      return {
        id: null as unknown as string,
        paperId,
        isFavorite: false,
        readingState: null,
        personalTags: null,
        addedAt: '',
        paper: null,
        noteCount: 0,
      };
    }

    return {
      id: joined.lib.id,
      paperId: joined.lib.paperId,
      isFavorite: joined.lib.isFavorite,
      readingState: (joined.lib.readingState as ReadingState | null) ?? null,
      personalTags: joined.lib.personalTags,
      addedAt: toIsoDateTime(joined.lib.addedAt) ?? '',
      paper: joined.p ? mapPaperDetail(joined.p, joined.jName, joined.p.fetchedAt) : null,
      noteCount: joined.noteCount,
    };
  }

  // ── Authoritative per-paper snapshot (favorite quick-action response) ──────
  //
  // Reads the live (user,paper) row and represents "no row at all" explicitly
  // (rowExists=false, libraryId=null) instead of the old fake LibraryItem{id:null}.
  private async buildState(userId: string, paperId: string): Promise<LibraryState> {
    const [joined] = await this.db
      .select({
        lib: userLibrary,
        noteCount: sql<number>`(SELECT count(*)::int FROM user_notes n WHERE n.paper_id = ${userLibrary.paperId} AND n.user_id = ${userLibrary.userId})`,
      })
      .from(userLibrary)
      .where(and(eq(userLibrary.userId, userId), eq(userLibrary.paperId, paperId)))
      .limit(1);

    if (!joined) {
      return {
        paperId,
        rowExists: false,
        libraryId: null,
        isFavorite: false,
        readingState: null,
        personalTags: null,
        addedAt: null,
        noteCount: 0,
        changed: false,
        favoriteTransition: 'none',
      };
    }
    return {
      paperId,
      rowExists: true,
      libraryId: joined.lib.id,
      isFavorite: joined.lib.isFavorite,
      readingState: (joined.lib.readingState as ReadingState | null) ?? null,
      personalTags: joined.lib.personalTags,
      addedAt: toIsoDateTime(joined.lib.addedAt),
      noteCount: joined.noteCount,
      changed: false,
      favoriteTransition: 'none',
    };
  }

  // Favorite quick-action. Performs the upsert/empty-row cleanup, then returns the post-state
  // snapshot AND the ACTUAL favorite transition performed, so the client can fire direction-aware
  // behavior events only when state really flipped (favorite vs unfavorite), and so a no-op
  // repeat POST (already in the requested state) records nothing.
  async setFavorite(userId: string, paperId: string, isFavorite: boolean): Promise<LibraryState> {
    const [paper] = await this.db
      .select({ id: papers.id })
      .from(papers)
      .where(eq(papers.id, paperId))
      .limit(1);
    if (!paper) throw new NotFoundException('论文不存在');

    const before = await this.buildState(userId, paperId);
    await this.upsert(userId, paperId, { isFavorite });
    const after = await this.buildState(userId, paperId);

    const favoriteTransition: LibraryState['favoriteTransition'] =
      before.isFavorite === after.isFavorite
        ? 'none'
        : after.isFavorite
          ? 'favorited'
          : 'unfavorited';

    return {
      ...after,
      changed: favoriteTransition !== 'none',
      favoriteTransition,
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
    const [paper] = await this.db
      .select({ id: papers.id })
      .from(papers)
      .where(eq(papers.id, paperId))
      .limit(1);
    if (!paper) throw new NotFoundException('论文不存在');
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

  private resolveWeights(
    override?: Partial<RecWeights> | null,
    stored?: Record<string, number> | null,
  ): RecWeights {
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
    const weights = this.resolveWeights(
      weightOverride,
      (settingsRow?.recWeights as Record<string, number> | null) ?? null,
    );

    // Pure-SQL candidate selection + explainable components. No LLM / external / scheduler.
    // * Lexical profile = word tokens from title+abstract+keywords of ALL library papers AND
    //   all paper-linked notes for this user.
    // * Candidate scoring matches tokens against the candidate's title+abstract+keywords text.
    // * Exclusions: ANY user_library row (favorite/todo/reading/read alike) AND uninterested feedback.
    // * Unknown dates -> freshness 0. Tie-break deterministic: score, recency, title, id.
    const result = await this.db.execute(sql`
      WITH settings AS (
        SELECT interested_keywords FROM user_settings WHERE user_id = ${userId}
      ),
      interest_tokens AS (
        SELECT DISTINCT lower(trim(t)) AS tok
        FROM settings, unnest(string_to_array(settings.interested_keywords, ',')) AS t
        WHERE settings.interested_keywords IS NOT NULL AND trim(t) <> ''
      ),
      profile_text AS (
        SELECT lower(coalesce(p.title,'') || ' ' || coalesce(p.abstract_text,'') || ' ' || coalesce(p.keywords,'')) AS txt
        FROM user_library ul JOIN papers p ON p.id = ul.paper_id WHERE ul.user_id = ${userId}
        UNION ALL
        SELECT lower(coalesce(p.title,'') || ' ' || coalesce(p.abstract_text,'') || ' ' || coalesce(p.keywords,'')) AS txt
        FROM user_notes n JOIN papers p ON p.id = n.paper_id
        WHERE n.user_id = ${userId} AND n.paper_id IS NOT NULL
      ),
      profile_tokens AS (
        SELECT DISTINCT lower(trim(t)) AS tok
        FROM profile_text, unnest(regexp_split_to_array(profile_text.txt, '[^a-zA-Z0-9]+')) AS t
        WHERE length(trim(t)) >= 3
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
          p.methods, p.conclusions, p.published_date, p.fetched_at, p._created_at,
          j.name AS journal_name, j.priority AS source_priority,
          lower(coalesce(p.title,'') || ' ' || coalesce(p.abstract_text,'') || ' ' || coalesce(p.keywords,'')) AS ctext
        FROM papers p
        LEFT JOIN journals j ON j.id = p.journal_id
        WHERE p.id NOT IN (SELECT paper_id FROM excluded_lib)
          AND p.id NOT IN (SELECT paper_id FROM excluded_neg)
      ),
      matched AS (
        SELECT
          cand.id,
          (SELECT coalesce(array_agg(DISTINCT it.tok), '{}') FROM interest_tokens it WHERE cand.ctext LIKE '%' || it.tok || '%') AS interest_arr,
          (SELECT coalesce(array_agg(DISTINCT pt.tok), '{}') FROM profile_tokens pt WHERE cand.ctext LIKE '%' || pt.tok || '%') AS profile_arr
        FROM cand
      ),
      scored AS (
        SELECT
          cand.*,
          matched.interest_arr,
          matched.profile_arr,
          LEAST(1.0, coalesce(array_length(matched.interest_arr,1),0)::numeric / 3.0) AS interest_score,
          LEAST(1.0, coalesce(array_length(matched.profile_arr,1),0)::numeric / 5.0) AS lexical_score,
          CASE cand.source_priority
            WHEN 'P0' THEN 1.0 WHEN 'P1' THEN 0.75 WHEN 'P2' THEN 0.5 WHEN 'P3' THEN 0.25 ELSE 0.4 END AS source_score,
          CASE
            WHEN cand.published_date IS NOT NULL
              THEN GREATEST(0, 1 - ((CURRENT_DATE - cand.published_date)::numeric / 730.0))
            WHEN cand.fetched_at IS NOT NULL
              THEN GREATEST(0, 1 - ((CURRENT_DATE - cand.fetched_at::date)::numeric / 730.0))
            ELSE 0
          END AS freshness_score,
          CASE WHEN cand.abstract_text IS NOT NULL AND cand.abstract_text <> '' THEN 1.0 ELSE 0.0 END AS abstract_score,
          COALESCE(cand.published_date, cand.fetched_at::date) AS recency
        FROM cand JOIN matched ON matched.id = cand.id
      )
      SELECT
        scored.*,
        (${weights.interest}::numeric * scored.interest_score
         + ${weights.lexical}::numeric * scored.lexical_score
         + ${weights.source}::numeric * scored.source_score
         + ${weights.freshness}::numeric * scored.freshness_score
         + ${weights.abstract}::numeric * scored.abstract_score) AS total_score
      FROM scored
      ORDER BY total_score DESC, recency DESC NULLS LAST, scored.title ASC, scored.id ASC
    `);

    const rows = ((result as any).rows ?? result ?? []) as any[];

    const [libCount] = await this.db
      .select({ n: sql<number>`count(*)::int` }).from(userLibrary).where(eq(userLibrary.userId, userId));
    const [noteCount] = await this.db
      .select({ n: sql<number>`count(*)::int` }).from(userNotes)
      .where(and(eq(userNotes.userId, userId), sql`${userNotes.paperId} IS NOT NULL`));
    const coldStart = (libCount?.n ?? 0) === 0 && (noteCount?.n ?? 0) === 0;

    const scoredItems: RecommendationItem[] = rows.map((r) => {
      const interest = Number(r.interest_score);
      const lexical = Number(r.lexical_score);
      const source = Number(r.source_score);
      const freshness = Number(r.freshness_score);
      const abstract = Number(r.abstract_score);
      const total = Number(r.total_score);

      const interestArr: string[] = r.interest_arr ?? [];
      const profileArr: string[] = r.profile_arr ?? [];
      const matchedKeywords: string[] = Array.from(new Set([...interestArr, ...profileArr])).slice(0, 12);

      const reasons: string[] = [];
      if (interestArr.length > 0) reasons.push(`匹配兴趣关键词: ${interestArr.slice(0,4).join(', ')}`);
      if (profileArr.length > 0) reasons.push(`与你已收藏/已读/笔记论文词汇重合: ${profileArr.slice(0,4).join(', ')}`);
      if (source >= 0.75) reasons.push(`高优先级来源(${r.source_priority ?? '未知'}: ${r.journal_name ?? '未知'})`);
      else if (source >= 0.5) reasons.push(`中优先级来源(${r.source_priority ?? '未知'})`);
      if (freshness > 0.7) reasons.push(`近期发表`);
      else if (freshness > 0) reasons.push(`发表于 ${r.published_date ? String(r.published_date).slice(0,10) : '近期抓取'}`);
      if (abstract >= 1) reasons.push(`含摘要`);
      if (coldStart) reasons.push(`冷启动：尚无个人阅读历史，按来源优先级/新鲜度/含摘要排序`);

      const paper: PaperDetail = mapPaperDetail(
        { ...r, _created_at: r._created_at },
        r.journal_name,
        r.fetched_at,
      );
      return {
        paper,
        score: Number(total.toFixed(4)),
        breakdown: { interest, lexical, source, freshness, abstract },
        matchedKeywords,
        reasons,
      };
    });

    const items = scoredItems.slice(0, safeLimit);

    const [excludedLibCount] = await this.db
      .select({ n: sql<number>`count(*)::int` }).from(userLibrary).where(eq(userLibrary.userId, userId));
    const [excludedNegCount] = await this.db
      .select({ n: sql<number>`count(*)::int` }).from(userRecommendationFeedback)
      .where(and(eq(userRecommendationFeedback.userId, userId), eq(userRecommendationFeedback.feedbackType, 'uninterested')));

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
