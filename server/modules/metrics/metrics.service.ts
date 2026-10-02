import { Injectable, Inject } from '@nestjs/common';
import { and, eq, gte, sql, count } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { behaviorEvents, userLibrary } from '../../database/schema';
import { RadarService } from '../radar/radar.service';
import { isoWeekStart, weekStartKey } from '../radar/radar.service';
import { safeRate } from '../../common/utils/rate';
import type {
  InternalMetrics,
  RatioPoint,
  Top10CtrItem,
} from '@shared/api.interface';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class MetricsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly radar: RadarService,
  ) {}

  private async countEventsSince(type: string, since: Date): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(behaviorEvents)
      .where(and(eq(behaviorEvents.eventType, type), gte(behaviorEvents.createdAt, since)));
    return r?.n ?? 0;
  }

  /**
   * Admin-only internal metrics, derived purely from behavior_events (+ reading state for the
   * reading-conversion numerator). NEVER selects note content. Every conversion carries its
   * explicit numerator/denominator and a `null` rate when the denominator is 0.
   */
  async internalMetrics(): Promise<InternalMetrics> {
    const since7d = new Date(Date.now() - 7 * DAY);

    // ── Top10 CTR (detail / impression) over the current frozen Top10 ──
    const snap = await this.radar.readSnapshotByKey(weekStartKey(isoWeekStart()));
    const topIds = (snap?.items ?? []).map((it) => ({ id: it.paper.id, title: it.paper.title }));

    let overallImpressions = 0;
    let overallDetails = 0;
    const items: Top10CtrItem[] = [];
    for (const t of topIds) {
      const [imp] = await this.db
        .select({ n: count() })
        .from(behaviorEvents)
        .where(and(eq(behaviorEvents.paperId, t.id), eq(behaviorEvents.eventType, 'impression')));
      const [det] = await this.db
        .select({ n: count() })
        .from(behaviorEvents)
        .where(and(eq(behaviorEvents.paperId, t.id), eq(behaviorEvents.eventType, 'detail')));
      const impressions = imp?.n ?? 0;
      const details = det?.n ?? 0;
      overallImpressions += impressions;
      overallDetails += details;
      items.push({ paperId: t.id, title: t.title, impressions, details, ctr: safeRate(details, impressions) });
    }

    // ── Rolling-7d conversion funnel ──
    const impressions7d = await this.countEventsSince('impression', since7d);
    const library7d = await this.countEventsSince('library', since7d);
    const todo7d = await this.countEventsSince('todo', since7d);
    const uninterested7d = await this.countEventsSince('uninterested', since7d);
    const noteCount = await this.countEventsSince('note', since7d);

    // ── 7-day reading conversion ──
    // numerator: papers whose reading state advanced to 'read' within the last 7 days.
    // denominator: impression events in the last 7 days (exposure base).
    const [readRow] = await this.db
      .select({ n: count() })
      .from(userLibrary)
      .where(and(eq(userLibrary.readingState, 'read'), gte(userLibrary.updatedAt, since7d)));
    const reads7d = readRow?.n ?? 0;

    const point = (numerator: number, denominator: number): RatioPoint => ({
      numerator,
      denominator,
      rate: safeRate(numerator, denominator),
    });

    return {
      top10Ctr: {
        overall: point(overallDetails, overallImpressions),
        items,
      },
      conversions: {
        library: point(library7d, impressions7d),
        todo: point(todo7d, library7d),
        uninterested: point(uninterested7d, impressions7d),
      },
      noteCount,
      readingConversion7d: point(reads7d, impressions7d),
    };
  }
}
