/**
 * Explicit conversion-rate helper.
 *
 * A conversion rate is `null` when there was no exposure (denominator === 0) rather than 0,
 * so a dashboard never reads "0% CTR" for a paper nobody has seen. Rounded to 4dp otherwise.
 *
 * Kept dependency-free so it can be unit-tested in isolation.
 */
export function safeRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  const r = numerator / denominator;
  return Math.round(r * 10000) / 10000;
}
