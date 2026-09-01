/**
 * Server-side admin allowlist for the usage-analytics dashboard
 * (see docs/USAGE_ANALYTICS.md). Mirrors the GUEST_REVIEWER_EMAILS pattern in
 * middlewares/requireAuth.ts: comma-separated env var, never exposed to the
 * frontend, matched case/whitespace-insensitively.
 */
export function parseAdminAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export function isAdminUser(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return parseAdminAllowlist(process.env.ADMIN_EMAILS).has(normalized);
}
