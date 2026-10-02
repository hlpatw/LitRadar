import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import { Client } from 'pg';
import { DATABASE, type Database } from '../../database/database.module';
import { schedulerState, journals } from '../../database/schema';
import { IngestionService } from '../connectors/ingestion.service';
import { CROSSREF_READY_ISSNS } from '../sources/mvp.sources';
import { RadarService } from '../radar/radar.service';

// Low-frequency cadence: one tick every 6h. Staging-only; never armed in production.
const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Advisory lock key for the whole-scheduler tick (distinct from per-source claim locks).
const SCHEDULER_LOCK_KEY = 9001;

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('SchedulerService');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly ingestion: IngestionService,
    private readonly radar: RadarService,
  ) {}

  /**
   * Armed only when explicitly staging AND explicitly enabled.
   * Railway runs NODE_ENV=production even for staging deploys, so we gate on APP_ENV —
   * never on NODE_ENV. Production (APP_ENV=production) never arms regardless of NODE_ENV.
   */
  get enabled(): boolean {
    const appEnv = (process.env.APP_ENV || '').toLowerCase();
    return appEnv === 'staging' && process.env.SCHEDULER_ENABLED === '1';
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(`scheduler disabled (APP_ENV=${process.env.APP_ENV ?? 'unset'}, SCHEDULER_ENABLED=${process.env.SCHEDULER_ENABLED ?? 'unset'}); not arming`);
      return;
    }
    this.logger.log(`staging scheduler armed; tick every ${TICK_INTERVAL_MS / 3600000}h`);
    void this.tickSafe('boot');
    this.timer = setInterval(() => void this.tickSafe('interval'), TICK_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Status for the admin UI: next-run, paused, counts. */
  async status() {
    const [row] = await this.db.select().from(schedulerState).where(eq(schedulerState.id, 1)).limit(1);
    const [ready] = await this.db
      .select({ n: sql<number>`count(*)::int` }).from(journals)
      .where(sql`${journals.connectorStatus} = 'ready'`);
    return {
      enabled: this.enabled,
      paused: row?.paused ?? false,
      lastRunAt: row?.lastRunAt ? (row.lastRunAt as Date).toISOString() : null,
      nextRunAt: row?.nextRunAt ? (row.nextRunAt as Date).toISOString() : null,
      runCount: row?.runCount ?? 0,
      readySourceCount: ready?.n ?? CROSSREF_READY_ISSNS.length,
      lastMessage: row?.lastMessage ?? null,
    };
  }

  async setPaused(paused: boolean) {
    await this.db
      .insert(schedulerState)
      .values({ id: 1, paused, runCount: 0 })
      .onConflictDoUpdate({ target: schedulerState.id, set: { paused } });
    return this.status();
  }

  /**
   * One scheduled tick. Gates, in order:
   *   1) enabled (staging-only)  2) not paused  3) advisory try-lock acquired on a
   *      DEDICATED pg client (session lock held for the whole tick, released in finally).
   * Per-source errors are isolated so one failing venue never aborts the rest.
   * Only the 7 Crossref-ready ISSNs are touched (skeleton/disabled never polled).
   */
  async tickSafe(reason: string): Promise<{ ran: boolean; reason: string }> {
    if (!this.enabled) return { ran: false, reason: 'disabled' };

    const [row] = await this.db.select().from(schedulerState).where(eq(schedulerState.id, 1)).limit(1);
    if (row?.paused) {
      this.logger.log('tick skipped: paused');
      return { ran: false, reason: 'paused' };
    }

    // Dedicated client: pg advisory LOCKS are session-scoped, so lock and unlock MUST run
    // on the same physical connection. A pooled query would risk lock on conn A and
    // unlock on conn B (the unlock would fail / orphan the lock). We own this client.
    const conn = new Client({ connectionString: this.config.get<string>('DATABASE_URL') });
    await conn.connect();
    let got = false;
    try {
      const lockRes = await conn.query('SELECT pg_try_advisory_lock($1) AS got', [SCHEDULER_LOCK_KEY]);
      got = lockRes.rows[0]?.got === true;
      if (!got) {
        this.logger.log('tick skipped: another runner holds the advisory lock');
        return { ran: false, reason: 'locked' };
      }

      this.logger.log(`scheduled tick start (${reason}); sources=${CROSSREF_READY_ISSNS.length}`);
      let ok = 0;
      let failed = 0;
      for (const issn of CROSSREF_READY_ISSNS) {
        try {
          await this.ingestion.syncSourceByIssn(issn, 25);
          ok += 1;
        } catch (err) {
          // Isolated retry: one bad source must not abort the other 6.
          failed += 1;
          this.logger.error(`isolated failure for ISSN ${issn}: ${(err as Error).message}`);
        }
      }
      // Freeze the weekly radar snapshot after ingestion (idempotent for the current week).
      try {
        await this.radar.generateSnapshot();
      } catch (err) {
        this.logger.error(`radar snapshot failed: ${(err as Error).message}`);
      }

      const next = new Date(Date.now() + TICK_INTERVAL_MS);
      await this.db
        .update(schedulerState)
        .set({
          paused: false,
          lastRunAt: new Date(),
          nextRunAt: next,
          runCount: sql`${schedulerState.runCount} + 1`,
          lastMessage: `ok=${ok} failed=${failed}`,
        } as any)
        .where(eq(schedulerState.id, 1));
      this.logger.log(`scheduled tick done: ok=${ok} failed=${failed}`);
      return { ran: true, reason: `ok=${ok} failed=${failed}` };
    } finally {
      if (got) {
        await conn.query('SELECT pg_advisory_unlock($1)', [SCHEDULER_LOCK_KEY]).catch(() => undefined);
      }
      await conn.end();
    }
  }
}
