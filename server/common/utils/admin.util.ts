// Shared admin-email capability check. Single source of truth used by both the
// HTTP AdminOrCliGuard and the auth responses (so the UI can hide admin-only actions
// up front instead of relying on a click -> 403).
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}
