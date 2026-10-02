// Generates server/version.build.json at build time with the git commit and build
// timestamp. Runtime container envs (RAILWAY_GIT_COMMIT_SHA etc.) still override this.
// Safe to run off-git: falls back to "local" / current time.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'server');
const out = { buildTime: new Date().toISOString(), commit: 'local' };

try {
  out.commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  /* not a git checkout / no git */
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'version.build.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('[gen-version]', JSON.stringify(out));
