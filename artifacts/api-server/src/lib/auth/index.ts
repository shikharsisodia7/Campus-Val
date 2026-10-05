/**
 * CampusVal's internal authentication interface.
 *
 *            routes
 *              |
 *   getCurrentUser / requireUser / getUserId / requireRole   (this file)
 *              |
 *        +-----+--------------+
 *        |                    |
 *      Clerk               SCU OIDC
 *   (temporary)       (production; not yet built —
 *                      needs SCU IdP details)
 *
 * AUTH_PROVIDER selects the adapter (default "clerk"). See
 * docs/migration/SCU_SSO_MIGRATION.md.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { clerkAdapter } from "./clerk";
import { hasRole, isApprovedCampusValUser, type AppRole } from "./policy";
import type { AuthAdapter, AuthProviderName, AuthUser } from "./types";

export type { AuthAdapter, AuthProviderName, AuthUser } from "./types";
export { campusValUserType, hasRole, isApprovedCampusValUser, type AppRole } from "./policy";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      /** Memoised result of getCurrentUser for this request. */
      authUser?: AuthUser | null;
    }
  }
}

type Env = Record<string, string | undefined>;

/** The configured provider name, or null for an unrecognised value. */
export function resolveAuthProviderName(env: Env = process.env): AuthProviderName | null {
  const raw = env["AUTH_PROVIDER"]?.trim().toLowerCase();
  if (!raw || raw === "clerk") return "clerk";
  if (raw === "oidc") return "oidc";
  return null;
}

export const OIDC_NOT_READY_MESSAGE =
  "AUTH_PROVIDER=oidc is not available yet: the SCU OIDC adapter needs SCU's issuer, client registration and claim mapping (docs/migration/SSO_INFORMATION_NEEDED.md). Use AUTH_PROVIDER=clerk until then.";

/**
 * The active adapter. Throws for "oidc" (not built — deliberately, rather than
 * guessing SCU's claims) and for unknown values, so a misconfigured server
 * refuses to start instead of running with authentication silently off.
 */
export function getAuthAdapter(env: Env = process.env): AuthAdapter {
  const name = resolveAuthProviderName(env);
  if (name === "clerk") return clerkAdapter;
  if (name === "oidc") throw new Error(OIDC_NOT_READY_MESSAGE);
  throw new Error(`AUTH_PROVIDER must be "clerk" or "oidc".`);
}

/** Request-wide session middleware for the active provider (mounted once in app.ts). */
export function authSessionMiddleware(): RequestHandler[] {
  return getAuthAdapter().sessionMiddleware();
}

/** The signed-in user, or null. Does not apply the SCU/reviewer gate. */
export async function getCurrentUser(req: Request): Promise<AuthUser | null> {
  if (req.authUser !== undefined) return req.authUser;
  const adapter = getAuthAdapter();
  const user = await adapter.resolveUser(req);
  req.authUser = user ? { ...user, provider: adapter.name } : null;
  return req.authUser;
}

/** The id set by requireUser. Only valid on routes behind requireUser. */
export function getUserId(req: Request): string {
  if (!req.userId) throw new Error("getUserId() called on a route without requireUser");
  return req.userId;
}

/**
 * Gate for every user-data route: 401 when signed out, 403 when the account
 * has no readable email or is neither @scu.edu nor an invited reviewer.
 * Sets req.userId / req.userEmail.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Sign in required" });
  }
  if (!user.email) {
    return res.status(403).json({
      error: "We couldn't read your email address from your account. Sign out and sign back in.",
    });
  }
  if (!isApprovedCampusValUser(user.email)) {
    return res.status(403).json({
      error: "This CampusVal prototype is currently limited to SCU users and invited reviewers.",
    });
  }
  req.userId = user.id;
  req.userEmail = user.email;
  next();
}

/** Role gate; mount AFTER requireUser so a signed-out request still gets 401. */
export function requireRole(role: AppRole): RequestHandler {
  return (req, res, next) => {
    if (!hasRole(req.userEmail, role)) {
      res.status(403).json({ error: role === "admin" ? "Admin access required" : "Forbidden" });
      return;
    }
    next();
  };
}
