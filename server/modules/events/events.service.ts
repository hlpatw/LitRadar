import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { and, eq, gte, sql, count } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.module';
import { behaviorEvents } from '../../database/schema';
import type {
  EventAdminSummary,
  BehaviorEventType,
  TrackEventRequest,
} from '@shared/api.interface';

const ALLOWED = new Set<BehaviorEventType>([
  'impression',
  'detail',
  'library',
  'todo',
  'favorite',
  'uninterested',
  'note',
]);

@Injectable()
export class EventsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Record a lightweight behavior event idempotently. The UNIQUE(user_id,event_type,key)
   * index makes a retried/duplicate POST a no-op (onConflictDoNothing).
   *
   * DEDUPE CONTRACT:
   *  - Clients SHOULD pass an explicit `idempotencyKey`. For impressions/detail the key
   *    MUST include the client session + paper + surface so two genuinely distinct
   *    impressions are NOT collapsed. For action events (favorite/todo/...) a stable
   *    per-paper key is correct (repeat clicks should not double-count).
   *  - When the client omits a key we derive a conservative weekly fallback
   *    (type:paper:ISO-week) — adequate for action events, NOT for raw impression volume.
   * No note body / any free text is ever persisted here — only event type + paper.
   */
  async track(userId: string, body: TrackEventRequest): Promise<{ recorded: boolean }> {
    if (!ALLOWED.has(body.eventType)) {
      throw new BadRequestException(`unknown eventType: ${body.eventType}`);
    }
    const key = (body.idempotencyKey && body.idempotencyKey.trim())
      ? body.idempotencyKey.trim().slice(0, 200)
      : this.derivedKey(body);

    const inserted = await this.db
      .insert(behaviorEvents)
      .values({
        userId,
        paperId: body.paperId ?? null,
        eventType: body.eventType,
        idempotencyKey: key,
      })
      .onConflictDoNothing()
      .returning({ id: behaviorEvents.id });

    return { recorded: inserted.length > 0 };
  }

  /** Deterministic dedupe key when the client omits one: type + paper + ISO week. */
  private derivedKey(body: TrackEventRequest): string {
    const week = new Date().toISOString().slice(0, 10).slice(0, 10);
    return `${body.eventType}:${body.paperId ?? 'none'}:${week}`.slice(0, 200);
  }

  /** Internal/admin aggregate metrics (counts by type, last-24h). */
  async adminSummary(): Promise<EventAdminSummary> {
    const [tot] = await this.db.select({ n: count() }).from(behaviorEvents);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [day] = await this.db
      .select({ n: count() }).from(behaviorEvents).where(gte(behaviorEvents.createdAt, since));

    const byTypeRows = await this.db
      .select({ t: behaviorEvents.eventType, n: count() })
      .from(behaviorEvents)
      .groupBy(behaviorEvents.eventType);

    const byType: Record<string, number> = {};
    for (const r of byTypeRows) byType[r.t] = r.n;

    return {
      total: tot?.n ?? 0,
      last24h: day?.n ?? 0,
      byType: byType as EventAdminSummary['byType'],
    };
  }

  /** Per-user action counts for the weekly digest. */
  async userActionCounts(userId: string, since: Date): Promise<Record<BehaviorEventType, number>> {
    const rows = await this.db
      .select({ t: behaviorEvents.eventType, n: count() })
      .from(behaviorEvents)
      .where(and(eq(behaviorEvents.userId, userId), gte(behaviorEvents.createdAt, since)))
      .groupBy(behaviorEvents.eventType);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.t] = r.n;
    return out as Record<BehaviorEventType, number>;
  }
}
