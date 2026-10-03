// Shared client-side API error → readable Chinese message.
//
// The backend's GlobalExceptionFilter emits a nested envelope:
//   { error: { code, message, details?, timestamp } }
// where `details` is often a JSON *string* of the raw HttpException response, e.g.
//   {"statusCode":400,"message":["username must be longer than or equal to 3 characters"],"error":"Bad Request"}
// Some older/other call sites return a flat envelope: { message: '...' }.
//
// This parser tolerates BOTH shapes, unwraps JSON-string details, translates the
// English class-validator messages into Chinese, and NEVER leaks a raw HTTP status
// code (400/401/...) or axios's "Request failed with status code 400" to the user.

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// English HTTP reason phrases (and NestJS's "<Reason> Exception" variant) that carry no
// user-facing meaning on their own. The live staging envelope has been observed to set the
// top-level error.message to the bare English "Bad Request Exception" while the real,
// field-level validation lives in `details` — both must be dropped so the translated
// Chinese details win.
const GENERIC_HTTP_MESSAGE_RE =
  /^(bad request|unauthorized|forbidden|not found|conflict|internal server error|bad gateway|service unavailable|gateway timeout|payload too large|unprocessable entity|method not allowed)( exception)?$/i;

// class-validator field names → Chinese labels.
const FIELD_LABELS: Record<string, string> = {
  username: '用户名',
  email: '邮箱',
  password: '密码',
  displayName: '显示名称',
};

/**
 * Translate one English class-validator message into Chinese. Already-Chinese
 * messages (e.g. the Conflict/Unauthorized strings the server throws) pass through.
 */
export function translateValidationMessage(raw: string): string {
  let m = raw.match(/^(\w+)\s+must be longer than or equal to (\d+) characters?$/);
  if (m) return `${FIELD_LABELS[m[1]] ?? m[1]}至少 ${m[2]} 个字符`;

  m = raw.match(/^(\w+)\s+must be shorter than or equal to (\d+) characters?$/);
  if (m) return `${FIELD_LABELS[m[1]] ?? m[1]}至多 ${m[2]} 个字符`;

  m = raw.match(/^(\w+)\s+must be an email$/);
  if (m) return `${FIELD_LABELS[m[1]] ?? m[1]}格式不正确`;

  m = raw.match(/^(\w+)\s+must be not empty$/);
  if (m) return `${FIELD_LABELS[m[1]] ?? m[1]}不能为空`;

  m = raw.match(/^(\w+)\s+must be a string$/);
  if (m) return `${FIELD_LABELS[m[1]] ?? m[1]}格式不正确`;

  return raw;
}

/** Collect every candidate message string from either envelope shape. */
function collectCandidates(data: unknown): string[] {
  const out: string[] = [];
  if (!isRecord(data)) return out;

  const push = (v: unknown): void => {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) out.push(t);
    } else if (Array.isArray(v)) {
      for (const item of v) push(item);
    } else if (isRecord(v)) {
      push(v.message);
    }
  };

  // Nested envelope: { error: { message, details } }
  if (isRecord(data.error)) {
    push(data.error.message);
    const details = data.error.details;
    if (typeof details === 'string' && details.trim()) {
      try {
        const parsed: unknown = JSON.parse(details);
        // details itself is the raw HttpException response, e.g.
        // { statusCode, message: string | string[], error }
        push((parsed as UnknownRecord).message);
        if (isRecord(parsed.error)) push(parsed.error.message);
      } catch {
        // Not JSON — use the raw details string as a last-resort candidate.
        out.push(details.trim());
      }
    } else if (isRecord(details)) {
      push(details.message);
    }
  }

  // Flat envelope: { message }
  push(data.message);

  return out;
}

/** Drop generic English phrases, bare status codes, and axios defaults; dedupe; translate. */
function cleanCandidates(cands: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of cands) {
    if (!c) continue;
    if (GENERIC_HTTP_MESSAGE_RE.test(c)) continue;
    if (/^\d{3}$/.test(c)) continue; // never surface "400" / "401"
    if (/^request failed with status code\s*\d+$/i.test(c)) continue; // axios default text
    const translated = translateValidationMessage(c);
    if (!translated || seen.has(translated)) continue;
    seen.add(translated);
    result.push(translated);
  }
  return result;
}

/** Status-based fallback, fully in Chinese; never embeds the raw status number. */
function fallbackForStatus(status: number): string {
  switch (status) {
    case 400:
      return '提交信息有误，请检查后重试';
    case 401:
      return '用户名或密码错误';
    case 403:
      return '没有权限执行此操作';
    case 404:
      return '请求的资源不存在';
    case 409:
      return '该用户名或邮箱已被注册';
    case 429:
      return '操作过于频繁，请稍后再试';
    case 500:
    case 502:
    case 503:
    case 504:
      return '服务器繁忙，请稍后重试';
    default:
      return '操作失败，请稍后重试';
  }
}

/**
 * Derive a single, user-readable Chinese message from any thrown API error.
 * Tolerates AxiosError (`err.response.status` / `err.response.data`) as well as a
 * bare response-data object. Never throws; always returns a non-empty Chinese string.
 */
export function getApiErrorMessage(err: unknown, fallback?: string): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  const data = (err as { response?: { data?: unknown } })?.response?.data;

  const candidates = cleanCandidates(collectCandidates(data));
  if (candidates.length > 0) return candidates.join('；');

  if (typeof status === 'number' && status > 0) return fallbackForStatus(status);

  // No HTTP response at all (DNS failure, connection refused, timeout, offline).
  return fallback ?? '网络异常，请检查网络后重试';
}
