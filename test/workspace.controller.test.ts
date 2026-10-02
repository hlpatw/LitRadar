import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAuthenticatedUserId } from '../server/modules/workspace/workspace-user.ts';

test('getAuthenticatedUserId returns the authenticated JWT user id', () => {
  const expectedUserId = '7f7130ad-76df-47ad-b0fd-b4f93b270302';

  assert.equal(getAuthenticatedUserId({ user: { userId: expectedUserId } }), expectedUserId);
});

test('workspace controller uses the shared authenticated user helper for every handler', () => {
  const controllerPath = join(import.meta.dirname, '..', 'server', 'modules', 'workspace', 'workspace.controller.ts');
  const source = readFileSync(controllerPath, 'utf8');

  assert.equal(source.includes('const { userId } = (req as any).user.userId'), false);
  assert.equal((source.match(/const userId = getAuthenticatedUserId\(req\);/g) ?? []).length, 15);
});
