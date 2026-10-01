import { Controller, Get, Inject } from '@nestjs/common';
import { DATABASE } from '../../database/database.module';
import { sql } from 'drizzle-orm';

// Mounted OUTSIDE the global /api prefix (see main.ts setGlobalPrefix exclude).
// Deliberately returns no env/DB credentials or stack.
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();
  constructor(@Inject(DATABASE) private readonly db: any) {}

  @Get()
  async check() {
    let db: 'up' | 'down' = 'down';
    try {
      await this.db.execute(sql`SELECT 1`);
      db = 'up';
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
