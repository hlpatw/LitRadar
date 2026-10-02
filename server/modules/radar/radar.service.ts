import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { weeklyRadarSnapshots, papers, journals } from '../../database/schema';
import type {
  RadarHistoryResponse,
  RadarTopItem,
  WeeklyRadarSnapshot,
} from '@shared/api.interface';

// Asia/Shanghai fixed offset (UTC+8, no DST). The product default timezone.
const SHANGHAI_OFFSET_MIN = 8 * 60;

/**
 * ISO Monday 00:00 *local* (Asia/Shanghai) as a real UTC instant.
 * Local Monday 00:00 in CST == Sunday 16:00 UTC. Used consistently by radar, digest and
 * the dashboard so "this week" never drifts between a rolling-7d window and a UTC week.
 */
export function isoWeekStart(d: Date = new Date()): Date {
  const shNow = new Date(d.getTime() + SHANGHAI_OFFSET_MIN * 60 * 1000);
  const dow = (shNow.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const mondayWall = new Date(Date.UTC(shNow.getUTCFullYear(), shNow.getUTCMonth(), shNow.getUTCDate() - dow));
  return new Date(mondayWall.getTime() - SHANGHAI_OFFSET_MIN * 60 * 1000);
}

/** The stored week key: the Asia/Shanghai wall date of that Monday (yyyy-mm-dd). */
export function weekStartKey(d: Date = new Date()): string {
  const wall = new Date(d.getTime() + SHANGHAI_OFFSET_MIN * 60 * 1000);
  return wall.toISOString().slice(0, 10);
}

export function addWeeks(d: Date, weeks: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + weeks * 7);
  return x;
}

interface RawRow {
  id: string;
  title: string;
  abstract_text: string | null;
  keywords: string | null;
  published_date: string | null;
  fetched_at: Date | null;
  journal_name: string | null;
  source_priority: string | null;
  source_score: number;
  abstract_score: number;
  new_score: number;
  matched: string[];
  recency: Date | null;
}

@Injectable()
export class RadarService {
  private readonly logger = new Logger('RadarService');

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Deterministic Top10 over the SHARED corpus (all papers, scoped to ready sources).
   * Ordering is fully tied: weighted score -> recency -> title -> id, so re-running for
   * the same week on the same corpus yields the identical list. The result is frozen into
   * weekly_radar_snapshots; a second run for the same week_start is a no-op (idempotent).
   */
  async generateSnapshot(weekStart: Date = isoWeekStart()): Promise<WeeklyRadarSnapshot> {
    const ws = weekStartKey(weekStart);

    // Already frozen for this week -> return the immutable snapshot (do not recompute).
    const [existing] = await this.db
      .select()
      .from(weeklyRadarSnapshots)
      .where(eq(weeklyRadarSnapshots.weekStart, ws))
      .limit(1);
    if (existing) return this.toSnapshot(existing, false);

    const wsNext = weekStartKey(addWeeks(weekStart, 1));

    // Scoring CTE. No LLM / network. Tie-breaks fully deterministic.
    const result = await this.db.execute(sql`
      WITH ready AS (
        SELECT id, name, priority FROM journals WHERE connector_status = 'ready'
      ),
      cand AS (
        SELECT
          p.id, p.title, p.abstract_text, p.keywords, p.published_date, p.fetched_at,
          j.name AS journal_name, j.priority AS source_priority,
          lower(coalesce(p.title,'') || ' ' || coalesce(p.abstract_text,'') || ' ' || coalesce(p.keywords,'')) AS ctext
        FROM papers p LEFT JOIN ready j ON j.id = p.journal_id
      ),
      matched AS (
        SELECT cand.*,
          (SELECT coalesce(array_agg(DISTINCT t), '{}')
             FROM unnest(regexp_split_to_array(cand.ctext, '[^a-zA-Z0-9]+')) AS t
             WHERE length(trim(t)) >= 4
             AND t IN (
               SELECT DISTINCT lower(trim(k)) FROM (
                 SELECT lower(trim(x)) AS k
                 FROM cand, unnest(regexp_split_to_array(lower(coalesce(cand.title,'')||' '||coalesce(cand.keywords,'')), '[^a-zA-Z0-9]+')) AS x
                 WHERE length(trim(x)) >= 4
                 GROUP BY lower(trim(x)) HAVING count(*) >= 2
               ) hot
             )
          ) AS hot_terms
        FROM cand
      ),
      scored AS (
        SELECT matched.*,
          CASE source_priority WHEN 'P0' THEN 1.0 WHEN 'P1' THEN 0.75 WHEN 'P2' THEN 0.5 WHEN 'P3' THEN 0.25 ELSE 0.3 END AS source_score,
          CASE WHEN abstract_text IS NOT NULL AND abstract_text <> '' THEN 1.0 ELSE 0.0 END AS abstract_score,
          CASE WHEN fetched_at >= ${ws}::date AND fetched_at < ${wsNext}::date THEN 1.0 ELSE 0.0 END AS new_score,
          LEAST(1.0, coalesce(array_length(matched.hot_terms,1),0)::numeric / 3.0) AS keyword_score,
          COALESCE(published_date, fetched_at::date) AS recency
        FROM matched
      )
      SELECT *,
        (0.35*source_score + 0.20*abstract_score + 0.25*new_score + 0.20*keyword_score) AS total_score
      FROM scored
      ORDER BY total_score DESC, recency DESC NULLS LAST, title ASC, id ASC
      LIMIT 10
    `);

    const rows = ((result as any).rows ?? result ?? []) as RawRow[];

    // Aggregates over the chosen Top10.
    const srcDist = new Map<string, number>();
    const kwCount = new Map<string, number>();
    const items: RadarTopItem[] = rows.map((r, idx) => {
      const source = r.journal_name ?? '未标注来源';
      srcDist.set(source, (srcDist.get(source) ?? 0) + 1);
      const keywords: string[] = (r.matched ?? r.hot_terms ?? []).slice(0, 8);
      for (const k of keywords) kwCount.set(k, (kwCount.get(k) ?? 0) + 1);

      const reasons: string[] = [];
      if (Number(r.new_score) > 0) reasons.push('本周新入库');
      const prio = r.source_priority;
      if (prio === 'P0') reasons.push(`P0 高优先来源`);
      else if (prio === 'P1') reasons.push('P1 重点来源');
      if (Number(r.abstract_score) > 0) reasons.push('含摘要');
      if (keywords.length) reasons.push(`高频主题: ${keywords.slice(0, 3).join(', ')}`);

      return {
        rank: idx + 1,
        paper: {
          id: r.id,
          title: r.title,
          journalName: r.journal_name,
          publishedDate: r.published_date ? String(r.published_date).slice(0, 10) : null,
          url: null,
          hasAbstract: Number(r.abstract_score) > 0,
        },
        score: Number(Number(r.total_score).toFixed(4)),
        matchedKeywords: keywords,
        reasons,
      };
    });

    const [newCountRow] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(papers)
      .where(sql`${papers.fetchedAt} >= ${ws}::date AND ${papers.fetchedAt} < ${wsNext}::date`);

    const sourceDistribution = [...srcDist.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
    const keywordHits = [...kwCount.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
      .slice(0, 10);

    const top10 = items.map((it) => ({
      rank: it.rank,
      paperId: it.paper.id,
      title: it.paper.title,
      source: it.paper.journalName,
      publishedDate: it.paper.publishedDate,
      url: it.paper.url,
      hasAbstract: it.paper.hasAbstract,
      score: it.score,
      matchedKeywords: it.matchedKeywords,
      reasons: it.reasons,
    }));

    // Freeze. ON CONFLICT -> leave the existing immutable row (race: another request won).
    await this.db
      .insert(weeklyRadarSnapshots)
      .values({
        weekStart: ws,
        newPaperCount: newCountRow?.n ?? 0,
        top10: top10 as any,
        sourceDistribution: sourceDistribution as any,
        keywordHits: keywordHits as any,
      })
      .onConflictDoNothing();

    this.logger.log(`radar snapshot frozen for week ${ws}: ${items.length} papers, new=${newCountRow?.n ?? 0}`);
    return this.toSnapshot(
      { weekStart: ws, newPaperCount: newCountRow?.n ?? 0, top10, sourceDistribution, keywordHits, generatedAt: new Date() } as any,
      true,
    );
  }

  private toSnapshot(row: typeof weeklyRadarSnapshots.$inferSelect, isCurrent: boolean): WeeklyRadarSnapshot {
    const top10 = (row.top10 as any[]) ?? [];
    return {
      weekStart: typeof row.weekStart === 'string' ? row.weekStart : String(row.weekStart),
      isCurrent,
      newPaperCount: row.newPaperCount,
      items: top10.map((t) => ({
        rank: t.rank,
        paper: {
          id: t.paperId,
          title: t.title,
          journalName: t.source,
          publishedDate: t.publishedDate,
          url: t.url,
          hasAbstract: t.hasAbstract,
        },
        score: t.score,
        matchedKeywords: t.matchedKeywords ?? [],
        reasons: t.reasons ?? [],
      })),
      sourceDistribution: row.sourceDistribution as any,
      keywordHits: row.keywordHits as any,
      generatedAt: (row.generatedAt as Date).toISOString(),
    };
  }

  /** Current week (lazy-generate if missing) plus the previous frozen week for history. */
  async getCurrentAndPrevious(): Promise<RadarHistoryResponse> {
    const current = await this.generateSnapshot(isoWeekStart());
    const prevStart = weekStartKey(addWeeks(isoWeekStart(), -1));
    const [prevRow] = await this.db
      .select()
      .from(weeklyRadarSnapshots)
      .where(eq(weeklyRadarSnapshots.weekStart, prevStart))
      .limit(1);
    return {
      current,
      previous: prevRow ? this.toSnapshot(prevRow, false) : null,
    };
  }
}
