/**
 * Clerk adapter — the TEMPORARY identity provider until SCU SSO (OIDC) details
 * are available. This is the only server file that imports @clerk/express for
 * identity; replacing Clerk means adding a sibling adapter, not editing routes.
 */
import type { Request } from "express";
import { clerkMiddleware, clerkClient, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { getClerkProxyHost } from "../../middlewares/clerkProxyMiddleware";
import type { AuthAdapter } from "./types";

const emailCache = new Map<string, { email: string | null; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getPrimaryEmail(userId: string): Promise<string | null> {
  const cached = emailCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.email;
  try {
    const u = await clerkClient.users.getUser(userId);
    const addr = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
    const email = addr?.emailAddress?.toLowerCase() ?? null;
    emailCache.set(userId, { email, ts: Date.now() });
    return email;
  } catch {
    return null;
  }
}

export const clerkAdapter: AuthAdapter = {
  name: "clerk",

  sessionMiddleware() {
    return [
      clerkMiddleware((req) => ({
        publishableKey: publishableKeyFromHost(getClerkProxyHost(req) ?? "", process.env["CLERK_PUBLISHABLE_KEY"]),
      })),
    ];
  },

  async resolveUser(req: Request) {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) return null;
    // Claims first (cheap), then a Clerk API lookup.
    const claims = (auth?.sessionClaims ?? {}) as Record<string, unknown>;
    const claimed = typeof claims["email"] === "string" ? (claims["email"] as string).toLowerCase() : null;
    return { id: userId, email: claimed ?? (await getPrimaryEmail(userId)) };
  },
};
