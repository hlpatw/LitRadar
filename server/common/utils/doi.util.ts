// Paper identifier + DOI utilities. Kept free of Nest/DB imports so they are trivially unit-testable.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Rough but practical Crossref DOI shape: 10.XXXX/... (case-insensitive, no whitespace).
const DOI_RE = /^10\.\d{4,9}\/[^\s]+$/i;

/** Strict UUID v1-v4 string check. */
export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/**
 * Normalize a DOI for storage / upsert: trim, strip a leading DOI resolver URL, lowercase.
 * Returns null when the input is empty after trimming.
 */
export function normalizeDoi(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let v = raw.trim();
  if (v === '') return null;
  // Strip resolver prefixes: https://doi.org/10.xxxx -> 10.xxxx
  v = v.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  v = v.trim();
  return v === '' ? null : v.toLowerCase();
}

/** Validate a (pre-normalize) DOI string. Empty/null is allowed (DOI is optional on papers). */
export function isValidDoi(raw: unknown): boolean {
  const n = normalizeDoi(raw);
  if (n === null) return false;
  return DOI_RE.test(n);
}
