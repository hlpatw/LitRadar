// Client-side auth error parser + form validation + bootstrap 401 decision.
// Runs in node:test (no browser). The parser/validation modules are intentionally pure
// so they can be exercised directly; the bootstrap decision is the pure function the
// axios interceptor uses to avoid hard-redirecting on stale-token /auth/me 401s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getApiErrorMessage } from '../client/src/utils/api-error.ts';
import {
  validateRegisterInput,
  validateLoginInput,
  MIN_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../client/src/utils/auth-validation.ts';
import { decideAuth401Action } from '../client/src/utils/axios.ts';

// Build an Axios-like rejection error.
function httpError(status: number, data: unknown): { response: { status: number; data: unknown } } {
  return { response: { status, data } };
}

test('parser: flat {message} Chinese conflict message surfaces verbatim', () => {
  const msg = getApiErrorMessage(httpError(409, { message: '用户名已存在' }));
  assert.equal(msg, '用户名已存在');
  assert.ok(!/\b409\b/.test(msg));
});

test('parser: nested {error:{message,details}} envelope surfaces the Chinese message', () => {
  const msg = getApiErrorMessage(
    httpError(409, {
      error: {
        code: 'CONFLICT',
        message: '邮箱已被注册',
        details: JSON.stringify({ statusCode: 409, message: '邮箱已被注册', error: 'Conflict' }),
        timestamp: 0,
      },
    }),
  );
  assert.equal(msg, '邮箱已被注册');
});

test('parser: validation details JSON string is unwrapped and English rules translated to Chinese', () => {
  const msg = getApiErrorMessage(
    httpError(400, {
      error: {
        code: 'BAD_REQUEST',
        message: 'Bad Request', // generic — must be dropped
        details: JSON.stringify({
          statusCode: 400,
          message: [
            'username must be longer than or equal to 3 characters',
            'email must be an email',
            'password must be longer than or equal to 8 characters',
          ],
          error: 'Bad Request',
        }),
        timestamp: 0,
      },
    }),
  );
  assert.ok(msg.includes('用户名至少 3 个字符'), msg);
  assert.ok(msg.includes('邮箱格式不正确'), msg);
  assert.ok(msg.includes('密码至少 8 个字符'), msg);
  assert.ok(!msg.includes('Bad Request'), 'generic English phrase must not leak');
  assert.ok(!msg.includes('must be'), 'English class-validator text must be translated');
  assert.ok(!/\b400\b/.test(msg), 'raw status must not leak');
});

test('parser: 401 with no useful body maps to 用户名或密码错误 (never raw 401)', () => {
  const msg = getApiErrorMessage(httpError(401, { error: { message: 'Unauthorized' } }));
  assert.equal(msg, '用户名或密码错误');
  assert.ok(!/\b401\b/.test(msg));
});

test('parser: server 401 message takes precedence over status fallback', () => {
  const msg = getApiErrorMessage(
    httpError(401, { error: { message: '用户名或密码错误' } }),
  );
  assert.equal(msg, '用户名或密码错误');
});

test('parser: axios default "Request failed with status code 400" never leaks', () => {
  const err = new Error('Request failed with status code 400') as Error & { response?: unknown };
  (err as any).response = { status: 400, data: { error: { message: 'Bad Request', details: undefined } } };
  const msg = getApiErrorMessage(err);
  assert.ok(!msg.includes('Request failed'), 'axios default text must be dropped');
  assert.ok(!/\b400\b/.test(msg));
});

test('parser: live "Bad Request Exception" top-level message dropped; details Chinese wins', () => {
  const msg = getApiErrorMessage(
    httpError(400, {
      error: {
        code: 'BAD_REQUEST',
        message: 'Bad Request Exception', // observed live staging envelope
        details: JSON.stringify({
          statusCode: 400,
          message: ['username must be shorter than or equal to 100 characters'],
          error: 'Bad Request',
        }),
        timestamp: 0,
      },
    }),
  );
  assert.equal(msg, '用户名至多 100 个字符', msg);
  assert.ok(!/bad request/i.test(msg), 'English reason must not leak');
  assert.ok(!/must be/.test(msg), 'English rule text must not leak');
  assert.ok(!/\b400\b/.test(msg));
});

test('parser: bare "Unauthorized Exception" on login falls back to Chinese, never raw', () => {
  const msg = getApiErrorMessage(httpError(401, { error: { message: 'Unauthorized Exception' } }));
  assert.equal(msg, '用户名或密码错误');
  assert.ok(!msg.includes('Unauthorized'), 'English reason must not leak');
  assert.ok(!/\b401\b/.test(msg));
});

test('parser: network error (no response) returns Chinese network message', () => {
  const msg = getApiErrorMessage(new Error('Network Error'));
  assert.equal(msg, '网络异常，请检查网络后重试');
});

test('parser: empty body on 500 falls back to Chinese server message', () => {
  const msg = getApiErrorMessage(httpError(500, { error: { message: '服务器内部错误' } }));
  assert.equal(msg, '服务器内部错误');
});

test('validation: username shorter than 3 is rejected', () => {
  const err = validateRegisterInput({ username: 'ab', email: 'a@b.com', password: 'password123', confirmPassword: 'password123' });
  assert.equal(err, `用户名至少 ${MIN_USERNAME_LENGTH} 个字符`);
});

test('validation: invalid email rejected before password rule', () => {
  const err = validateRegisterInput({ username: 'alice', email: 'not-an-email', password: 'password123', confirmPassword: 'password123' });
  assert.equal(err, '请输入有效的邮箱地址');
});

test('validation: 7-char password rejected (the staging 6/8 mismatch)', () => {
  const err = validateRegisterInput({ username: 'alice', email: 'a@b.com', password: 'abc1234', confirmPassword: 'abc1234' });
  assert.equal(err, `密码至少 ${MIN_PASSWORD_LENGTH} 位`);
});

test('validation: 8-char matching password passes; mismatch caught', () => {
  assert.equal(
    validateRegisterInput({ username: 'alice', email: 'a@b.com', password: 'password12', confirmPassword: 'password12' }),
    null,
  );
  const err = validateRegisterInput({ username: 'alice', email: 'a@b.com', password: 'password12', confirmPassword: 'different1' });
  assert.equal(err, '两次输入的密码不一致');
});

test('validation: login requires both fields', () => {
  assert.equal(validateLoginInput({ username: '', password: '' }), '请输入用户名');
  assert.equal(validateLoginInput({ username: '  ', password: '' }), '请输入用户名');
  assert.equal(validateLoginInput({ username: 'alice', password: '' }), '请输入密码');
  assert.equal(validateLoginInput({ username: 'alice', password: 'secret' }), null);
});

test('bootstrap: stale-token /auth/me 401 clears token only (no redirect, silent)', () => {
  assert.equal(decideAuth401Action('/auth/me', '/'), 'clear-only');
});

test('bootstrap: failed login/register 401 must not hard-redirect (error must stay on screen)', () => {
  assert.equal(decideAuth401Action('/auth/login', '/login'), 'clear-only');
  assert.equal(decideAuth401Action('/auth/register', '/register'), 'clear-only');
});

test('bootstrap: mid-session expiry on a protected API redirects to login, unless already there', () => {
  assert.equal(decideAuth401Action('/workspace/dashboard', '/settings'), 'redirect');
  assert.equal(decideAuth401Action('/workspace/dashboard', '/login'), 'clear-only');
});
