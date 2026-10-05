import type { Request, RequestHandler } from "express";

/**
 * Identity as CampusVal sees it, independent of who issued it. Routes read
 * only `req.userId` / `req.userEmail` (set by requireUser) — never a vendor SDK.
 */
export interface AuthUser {
  /** Stable, opaque user id. Every user-owned table keys rows by this value. */
  id: string;
  /** Verified primary email, lowercased. Used for the SCU / reviewer gate and admin allowlist. */
  email: string | null;
  /** Which identity provider issued the session. */
  provider: AuthProviderName;
}

export type AuthProviderName = "clerk" | "oidc";

/**
 * What an identity provider must supply. Clerk implements it today
 * (./clerk.ts). An SCU OIDC adapter will implement the same two members once
 * SCU supplies its issuer, client and claim details — see
 * docs/migration/SCU_SSO_MIGRATION.md. No route changes when that happens.
 */
export interface AuthAdapter {
  readonly name: AuthProviderName;
  /** Request-wide middleware that verifies the session (cookies/tokens) and attaches provider state. */
  sessionMiddleware(): RequestHandler[];
  /** The signed-in user for this request, or null. Must not throw for a signed-out request. */
  resolveUser(req: Request): Promise<Omit<AuthUser, "provider"> | null>;
}
