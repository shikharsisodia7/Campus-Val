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
import {
  accessDeniedMessage,
  effectiveAccessMode,
  envAccessBasis,
  hasRole,
  type AccessBasis,
  type AccessMode,
  type AppRole,
} from "./policy";
import type { AuthAdapter, AuthProviderName, AuthUser } from "./types";
import { loadAdminScopes } from "../department/authz";

export type { AuthAdapter, AuthProviderName, AuthUser } from "./types";
export {
  accessDeniedMessage,
  campusValUserType,
  effectiveAccessMode,
  envAccessBasis,
  hasRole,
  isApprovedCampusValUser,
  resolveAccessMode,
  type AccessBasis,
  type AccessMode,
  type AppRole,
} from "./policy";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      /** Memoised result of getCurrentUser for this request. */
      authUser?: AuthUser | null;
      /** Why requireUser admitted this account (set only on admitted requests). */
      accessBasis?: AccessBasis;
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

export interface AccessDecision {
  mode: AccessMode;
  allowed: boolean;
  basis: AccessBasis | null;
}

/**
 * Whether this signed-in address may use CampusVal under the current access
 * mode. Environment allowlists are checked first; only an address they do not
 * admit costs a database read, for a department-administrator program scope
 * (granting one is an explicit admin action, so it counts as an invitation).
 * Nothing here reads anything the browser sends besides the verified session.
 */
export async function decideAccess(email: string): Promise<AccessDecision> {
  const mode = effectiveAccessMode();
  const basis = envAccessBasis(email);
  if (basis) return { mode, allowed: true, basis };
  const scopes = await loadAdminScopes(email);
  if (scopes.programKeys.size > 0) return { mode, allowed: true, basis: "department_admin" };
  return { mode, allowed: false, basis: null };
}

/**
 * Gate for every user-data route: 401 when signed out, 403 when the account
 * has no readable email or is outside the current access population (pilot:
 * named participants only; institution: SCU accounts too). Runs before any
 * route handler, so a denied account reads and writes nothing.
 * Sets req.userId / req.userEmail / req.accessBasis.
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
  const decision = await decideAccess(user.email);
  if (!decision.allowed) {
    return res.status(403).json({
      error: accessDeniedMessage(),
      code: decision.mode === "pilot" ? "pilot_access_required" : "access_not_approved",
    });
  }
  req.userId = user.id;
  req.userEmail = user.email;
  req.accessBasis = decision.basis!;
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
