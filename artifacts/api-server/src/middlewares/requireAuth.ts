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
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return res.status(403).json({
      error: `CampusVal is restricted to Santa Clara University students. Your account (${email}) is not an @${ALLOWED_DOMAIN} address.`,
    });
  }

  req.userId = userId;
  req.userEmail = email;
  next();
}
