import { Injectable, Inject } from '@nestjs/common';
import { DATABASE, type Database } from '../../database/database.module';
import { RadarService } from '../radar/radar.service';
import { EventsService } from '../events/events.service';
import { isoWeekStart, weekStartKey, addWeeks } from '../radar/radar.service';
import type { WeeklyDigest, BehaviorEventType } from '@shared/api.interface';

const BLANK_ACTIONS: Record<BehaviorEventType, number> = {
  impression: 0, detail: 0, library: 0, todo: 0, favorite: 0, uninterested: 0, note: 0,
};

@Injectable()
export class DigestService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly radar: RadarService,
    private readonly events: EventsService,
  ) {}

  /**
   * Read-only weekly digest for a deterministic week reference.
   *
   *   ref='current'  -> this ISO Shanghai week (Mon 00:00 CST)
   *   ref='previous' -> exactly 7 days earlier
   *
   * The digest only READS the already-frozen snapshot row (radar.readSnapshotByKey). It NEVER
   * calls generateSnapshot / backfill, so a normal user selecting a week cannot mutate the
   * snapshots. When no frozen row exists for the requested week, an EMPTY report is returned
   * (empty Top10, zero counts, generatedAt=null) rather than a fabricated or lazily-built one.
   * User action counts are scoped to that week's [start, start+7d) window.
   */
  async getDigestForWeek(userId: string, ref: 'current' | 'previous'): Promise<WeeklyDigest> {
    const thisMonday = isoWeekStart();
    const winStart = ref === 'current' ? thisMonday : addWeeks(thisMonday, -1);
    const winEnd = addWeeks(winStart, 1);
    const key = weekStartKey(winStart);

    // Pure SELECT — no snapshot write.
    const snap = await this.radar.readSnapshotByKey(key);

    const actionCounts = await this.events.userActionCountsInWindow(userId, winStart, winEnd);

    return {
      weekStart: key,
      weekRef: ref,
      newPaperCount: snap?.newPaperCount ?? 0,
      top10: snap?.items ?? [],
      sourceDistribution: snap?.sourceDistribution ?? [],
      keywordHits: snap?.keywordHits ?? [],
      userActionCounts: { ...BLANK_ACTIONS, ...actionCounts },
      generatedAt: snap?.generatedAt ?? null,
    };
  }
}
