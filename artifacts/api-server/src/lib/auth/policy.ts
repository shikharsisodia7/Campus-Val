/**
 * Who may use CampusVal, and who is an administrator. Provider-independent:
 * these rules apply unchanged when SCU SSO replaces Clerk.
 *
 * CAMPUSVAL_ACCESS_MODE picks the population (docs/PILOT_STATUS.md):
 *
 *   pilot        (default, and the value for every deployment today)
 *                Only explicitly named people: ADMIN_EMAILS, PILOT_TESTER_EMAILS,
 *                GUEST_REVIEWER_EMAILS, and department administrators granted a
 *                program scope (checked in requireUser, it needs the database).
 *                An @scu.edu address alone is NOT enough.
 *   institution  Every @scu.edu account, plus the same named people. Not to be
 *                set until SCU approves a broader rollout.
 *
 * Unset means pilot, and an unrecognised value also means pilot (the startup
 * check reports it), so a typo can never widen access.
 */
import { isAdminUser } from "../admin";

const ALLOWED_DOMAIN = "scu.edu";

type Env = Record<string, string | undefined>;

export type AccessMode = "pilot" | "institution";

/**
 * Why a signed-in account is allowed in. Exactly one per decision, checked in
 * this order, so the most privileged reason wins.
 */
export type AccessBasis =
  | "admin"
  | "pilot_tester"
  | "external_reviewer"
  | "department_admin"
  | "scu_institution";

export const PILOT_ACCESS_DENIED_MESSAGE =
  "CampusVal is currently available only to invited pilot participants while SCU reviews hosting, security, and rollout.";

export const INSTITUTION_ACCESS_DENIED_MESSAGE =
  "CampusVal is currently limited to SCU accounts and invited reviewers.";

/** The configured mode, or null for a value that is neither pilot nor institution. */
export function resolveAccessMode(env: Env = process.env): AccessMode | null {
  const raw = env["CAMPUSVAL_ACCESS_MODE"]?.trim().toLowerCase();
  if (!raw || raw === "pilot") return "pilot";
  if (raw === "institution") return "institution";
  return null;
}

/** The mode actually enforced: an invalid value fails closed to pilot. */
export function effectiveAccessMode(env: Env = process.env): AccessMode {
  return resolveAccessMode(env) ?? "pilot";
}

/** Comma-separated, case- and whitespace-insensitive email list. Never sent to the browser. */
export function parseEmailList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

const normalize = (email: string): string => email.trim().toLowerCase();

/**
 * Clerk development instances accept any "+clerk_test" address with a fixed
 * verification code, so such an address proves nothing about who signed in.
 * In production it never qualifies by its domain alone; naming it explicitly
 * in an allowlist still works (that is a deliberate operator decision).
 */
function isUnverifiableTestAddress(email: string, env: Env): boolean {
  return env["NODE_ENV"] === "production" && email.split("@")[0]!.includes("+clerk_test");
}

/**
 * The access basis that environment configuration alone grants, or null.
 * Department administrators (a database grant) are added by requireUser.
 */
export function envAccessBasis(email: string, env: Env = process.env): AccessBasis | null {
  const normalized = normalize(email);
  if (!normalized.includes("@")) return null;
  if (isAdminUser(normalized)) return "admin";
  if (parseEmailList(env["PILOT_TESTER_EMAILS"]).has(normalized)) return "pilot_tester";
  if (parseEmailList(env["GUEST_REVIEWER_EMAILS"]).has(normalized)) return "external_reviewer";
  if (
    effectiveAccessMode(env) === "institution" &&
    normalized.endsWith(`@${ALLOWED_DOMAIN}`) &&
    !isUnverifiableTestAddress(normalized, env)
  ) {
    return "scu_institution";
  }
  return null;
}

/**
 * Whether configuration alone admits this address. requireUser additionally
 * admits department administrators, who are granted in the database.
 */
export function isApprovedCampusValUser(email: string): boolean {
  return envAccessBasis(email) !== null;
}

/** The message a signed-in account outside the current population is shown. */
export function accessDeniedMessage(env: Env = process.env): string {
  return effectiveAccessMode(env) === "pilot" ? PILOT_ACCESS_DENIED_MESSAGE : INSTITUTION_ACCESS_DENIED_MESSAGE;
}

/** "scu" for an @scu.edu account, "external_reviewer" otherwise (usage analytics only). */
export function campusValUserType(email: string): "scu" | "external_reviewer" {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`) ? "scu" : "external_reviewer";
}

/**
 * Application roles. "student" is every admitted user. "admin" is the
 * ADMIN_EMAILS allowlist (usage and feedback dashboards — no access to any
 * student's plans or APRs). Advisor access is not a role: it is granted per
 * student through plan_shares and checked on each request.
 */
export type AppRole = "student" | "admin";

export function hasRole(email: string | null | undefined, role: AppRole): boolean {
  if (!email) return false;
  return role === "student" ? isApprovedCampusValUser(email) : isAdminUser(email);
}
