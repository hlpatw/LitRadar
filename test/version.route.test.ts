import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Static wiring guards for the operational /api/version surface (Phase 0).
test('VersionModule is registered in AppModule', () => {
  const app = readFileSync(join(import.meta.dirname, '..', 'server', 'app.module.ts'), 'utf8');
  assert.ok(app.includes('VersionModule'), 'AppModule must import VersionModule');
});

test('VersionController exposes commit/buildTime/environment/migration and no secrets', () => {
  const src = readFileSync(
    join(import.meta.dirname, '..', 'server', 'modules', 'version', 'version.controller.ts'),
    'utf8',
  );
  for (const key of ['environment', 'commit', 'buildTime', 'migrationVersion', 'migrationsApplied']) {
    assert.ok(src.includes(key), `version response missing ${key}`);
  }
  // Must not leak connection strings or secrets.
  for (const forbidden of ['DATABASE_URL', 'password', 'JWT_SECRET']) {
    assert.ok(!src.includes(forbidden), `version controller must not reference ${forbidden}`);
  }
});

test('connectors manual sync is admin-gated and runs endpoint is authed', () => {
  const src = readFileSync(
    join(import.meta.dirname, '..', 'server', 'modules', 'connectors', 'connectors.module.ts'),
    'utf8',
  );
  // admin guard on sync routes
  assert.match(src, /@UseGuards\(AdminOrCliGuard\)[\s\S]*sync\(/, 'per-source sync must be admin-gated');
  assert.match(src, /@UseGuards\(AdminOrCliGuard\)[\s\S]*syncAll\(/, 'sync-all must be admin-gated');
  // runs listing is authed (JwtAuthGuard), public not open
  assert.ok(src.includes("Get('runs')"), 'runs endpoint must exist');
  assert.ok(src.includes('JwtAuthGuard'), 'runs endpoint must require auth');
});
