import { Controller, Get, Inject } from '@nestjs/common';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { DATABASE } from '../../database/database.module';

/**
 * Operational build/version surface. Deliberately exposes NO secrets:
 *  - environment (NODE_ENV)
 *  - commit (build-time git SHA, overridden by platform envs at runtime)
 *  - buildTime (build timestamp)
 *  - migrationVersion (latest applied migration file) + count
 *  - frontend (hashed client bundle)
 * Public (no auth) so the login screen can show "which build is this".
 */
@Controller('api/version')
export class VersionController {
  constructor(@Inject(DATABASE) private readonly db: any) {}

  @Get()
  async get() {
    const build = readBuildInfo();
    let migrationVersion = 'none';
    let migrationsApplied = 0;
    try {
      const res = await this.db.execute(
        sql`SELECT name FROM _migrations ORDER BY applied_at DESC, name DESC`,
      );
      const rows = (res as any).rows ?? res ?? [];
      if (rows.length) {
        migrationVersion = rows[0].name as string;
        migrationsApplied = rows.length;
      }
    } catch {
      // DB unreachable (e.g. health probe before migrations): report dev values.
    }

    return {
      // APP_ENV labels the deploy target (staging/prod); NODE_ENV drives behavior.
      // Prefer APP_ENV so staging (NODE_ENV=production) still reads as "staging".
      environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
      commit:
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        process.env.RENDER_GIT_COMMIT ||
        process.env.COMMIT_SHA ||
        build.commit,
      buildTime: process.env.BUILD_TIME || build.buildTime,
      migrationVersion,
      migrationsApplied,
      frontend: { bundle: readFrontendBundleHash() },
    };
  }
}

function readBuildInfo(): { commit: string; buildTime: string | null } {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/server/modules/version -> dist/server/version.build.json
    const candidates = [
      join(here, '..', 'version.build.json'),
      join(here, '..', '..', '..', 'server', 'version.build.json'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        return JSON.parse(readFileSync(c, 'utf8'));
      }
    }
  } catch {
    /* ignore */
  }
  return { commit: 'local', buildTime: null };
}

/** Extract the hashed client asset name from the built index.html, if present. */
function readFrontendBundleHash(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, '..', '..', 'client', 'index.html'), // dist/client/index.html
      join(here, '..', '..', '..', 'client', 'index.html'), // dev
    ];
    for (const c of candidates) {
      if (existsSync(c)) {
        const html = readFileSync(c, 'utf8');
        const m = html.match(/\/assets\/index-([\w-]+)\.js/);
        if (m) return m[1];
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}
