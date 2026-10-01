import { Injectable, Inject } from '@nestjs/common';
import { DATABASE, type Database } from '../../database/database.module';
import { journals } from '../../database/schema';
import { asc } from 'drizzle-orm';

@Injectable()
export class JournalsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(priority?: string, type?: string) {
    const conditions = [];
    if (priority) {
      const priorities = priority.split(',');
      // filter in JS for simplicity
    }
    const rows = await this.db.select().from(journals).orderBy(asc(journals.priority), asc(journals.name));
    return rows.map((r: typeof journals.$inferSelect) => ({
      id: r.id,
      name: r.name,
      abbreviation: r.abbreviation,
      sourceType: r.sourceType,
      priority: r.priority,
      category: r.category,
      description: r.description,
      url: r.url,
      updateFrequency: r.updateFrequency,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}