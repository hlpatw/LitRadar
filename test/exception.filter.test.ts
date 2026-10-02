// Verifies the GlobalExceptionFilter NEVER leaks stack/cause/path/SQL for an unknown 500,
// regardless of environment. Staging runs production-like env; the leak previously happened
// because stack was gated on NODE_ENV==='production' only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GlobalExceptionFilter } from '../dist/server/common/filters/exception.filter.js';
import { BadRequestException } from '@nestjs/common';

function fakeRes() {
  const body: any = {};
  return {
    body,
    statusCode: 0,
    headersSent: false,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { Object.assign(body, payload); return this; },
  };
}

function run(exception: unknown) {
  const filter = new GlobalExceptionFilter();
  const res = fakeRes();
  let captured = '';
  const realErr = console.error;
  console.error = (...a: any[]) => { captured = a.map(String).join(' '); };
  try {
    filter.catch(exception, {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({}) }),
    } as any);
  } finally {
    console.error = realErr;
  }
  return { res, captured };
}

test('unknown 500 never returns stack/cause/path in the response body', () => {
  const boom = new TypeError('fetchedAt.toISOString is not a function');
  boom.stack = `TypeError: fetchedAt.toISOString is not a function\n    at mapPaperDetail (C:\\app\\server\\modules\\library\\library.service.ts:53:30)\n    at process`;
  (boom as any).cause = { query: 'SELECT * FROM papers WHERE ...' };
  const { res } = run(boom);
  assert.equal(res.statusCode, 500);
  const serialized = JSON.stringify(res.body);
  assert.ok(!serialized.includes('stack'), 'body must not contain stack');
  assert.ok(!serialized.includes('cause'), 'body must not contain cause');
  assert.ok(!serialized.includes('mapPaperDetail'), 'body must not contain frame path');
  assert.ok(!serialized.includes('C:\\app'), 'body must not contain absolute path');
  assert.ok(!serialized.includes('SELECT'), 'body must not contain SQL');
  assert.equal(res.body.error.message, '服务器内部错误');
});

test('HttpException (e.g. 400) still returns status, no stack fields', () => {
  const { res } = run(new BadRequestException('bad input'));
  assert.equal(res.statusCode, 400);
  const serialized = JSON.stringify(res.body);
  assert.ok(!serialized.includes('stack'));
});
