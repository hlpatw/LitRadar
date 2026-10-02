import { Injectable, Inject } from '@nestjs/common';
import { DATABASE, type Database } from '../../database/database.module';
import { RadarService } from '../radar/radar.service';
import { EventsService } from '../events/events.service';
import { isoWeekStart } from '../radar/radar.service';
import type { WeeklyDigest, BehaviorEventType } from '@shared/api.interface';

@Injectable()
export class DigestService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly radar: RadarService,
    private readonly events: EventsService,
  ) {}

  /**
   * Weekly digest for the current week: frozen Top10 + new count + source/keyword
   * distribution + the current user's action counts this week. Paper links are carried
   * on each Top10 item (paper.id -> /papers/:id).
   */
  async getCurrentDigest(userId: string): Promise<WeeklyDigest> {
    const { current } = await this.radar.getCurrentAndPrevious();
    const weekStart = isoWeekStart();
    const actionCounts = await this.events.userActionCounts(userId, weekStart);

    const blank: Record<BehaviorEventType, number> = {
      impression: 0, detail: 0, library: 0, todo: 0, favorite: 0, uninterested: 0, note: 0,
    };

    return {
      weekStart: current?.weekStart ?? weekStart.toISOString().slice(0, 10),
      newPaperCount: current?.newPaperCount ?? 0,
      top10: current?.items ?? [],
      sourceDistribution: current?.sourceDistribution ?? [],
      keywordHits: current?.keywordHits ?? [],
      userActionCounts: { ...blank, ...actionCounts },
      generatedAt: current?.generatedAt ?? new Date().toISOString(),
    };
  }
}
