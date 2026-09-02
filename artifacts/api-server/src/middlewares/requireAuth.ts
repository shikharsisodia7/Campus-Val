import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

const ALLOWED_DOMAIN = "scu.edu";
const emailCache = new Map<string, { email: string | null; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Server-side allowlist for external prototype reviewers (e.g. Jake, Tom
 * Hines, Yale contacts) who need access but don't have an @scu.edu address.
 * Configured via GUEST_REVIEWER_EMAILS, a comma-separated list. Never
 * exposed to the frontend — this module only runs server-side.
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

/**
 * CampusVal access is restricted to SCU users and invited external
 * reviewers (e.g. Dr. Thom Hines at Portland State). The brief 2026-09-01
 * open-to-any-email window (PR #27) is reverted: it conflicts with the
 * requirement that CampusVal not be usable by any random signed-up email.
 */
export function isApprovedCampusValUser(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith(`@${ALLOWED_DOMAIN}`)) return true;
  const allowlist = parseReviewerAllowlist(process.env.GUEST_REVIEWER_EMAILS);
  return allowlist.has(normalized);
}

/** "scu" for an @scu.edu account, "external_reviewer" for an allowlisted guest. */
export function campusValUserType(email: string): "scu" | "external_reviewer" {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)
    ? "scu"
    : "external_reviewer";
}

async function getPrimaryEmail(userId: string): Promise<string | null> {
  const cached = emailCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.email;
  try {
    const u = await clerkClient.users.getUser(userId);
    const primaryId = u.primaryEmailAddressId;
    const addr = u.emailAddresses.find((e) => e.id === primaryId);
    const email = addr?.emailAddress?.toLowerCase() ?? null;
    emailCache.set(userId, { email, ts: Date.now() });
    return email;
  } catch {
    return null;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Sign in required" });
  }

  // Try claims first (cheap), fall back to a Clerk API lookup.
  const claims = (auth?.sessionClaims ?? {}) as Record<string, unknown>;
  let email =
    typeof claims["email"] === "string"
      ? (claims["email"] as string).toLowerCase()
      : null;
  if (!email) email = await getPrimaryEmail(userId);

  if (!email) {
    return res.status(403).json({
      error:
        "We couldn't read your email address from your account. Sign out and sign back in.",
    });
  }
  if (!isApprovedCampusValUser(email)) {
    return res.status(403).json({
      error:
        "This CampusVal prototype is currently limited to SCU users and invited reviewers.",
    });
  }

  req.userId = userId;
  req.userEmail = email;
  next();
}
