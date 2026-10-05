/**
 * Who may use CampusVal, and who is an administrator. Provider-independent:
 * these rules apply unchanged when SCU SSO replaces Clerk.
 */
import { isAdminUser } from "../admin";

const ALLOWED_DOMAIN = "scu.edu";

/**
 * Server-side allowlist for invited external reviewers who have no @scu.edu
 * address. Configured via GUEST_REVIEWER_EMAILS (comma-separated). Never
 * exposed to the frontend.
 */
function parseReviewerAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

/** SCU users and invited external reviewers only. */
export function isApprovedCampusValUser(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith(`@${ALLOWED_DOMAIN}`)) return true;
  return parseReviewerAllowlist(process.env.GUEST_REVIEWER_EMAILS).has(normalized);
}

/** "scu" for an @scu.edu account, "external_reviewer" for an allowlisted guest. */
export function campusValUserType(email: string): "scu" | "external_reviewer" {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`) ? "scu" : "external_reviewer";
}

/**
 * Application roles. "student" is every approved user. "admin" is the
 * ADMIN_EMAILS allowlist (usage and feedback dashboards — no access to any
 * student's plans or APRs). Advisor access is not a role: it is granted per
 * student through plan_shares and checked on each request.
 */
export type AppRole = "student" | "admin";

export function hasRole(email: string | null | undefined, role: AppRole): boolean {
  if (!email) return false;
  return role === "student" ? isApprovedCampusValUser(email) : isAdminUser(email);
}
