/**
 * The provider-independent auth interface (lib/auth) and the startup rules
 * for AUTH_PROVIDER / AI_PROVIDER. Clerk is mocked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

let mockAuth: { userId: string | null; sessionClaims?: Record<string, unknown> } = { userId: null };
vi.mock("@clerk/express", () => ({
  getAuth: () => mockAuth,
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddressId: null, emailAddresses: [] }) } },
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { getAuthAdapter, getCurrentUser, requireRole, requireUser, resolveAuthProviderName } = await import("./index");
const { collectConfigProblems } = await import("../config");

const ORIGINAL_ADMINS = process.env.ADMIN_EMAILS;
afterEach(() => {
  mockAuth = { userId: null };
  if (ORIGINAL_ADMINS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMINS;
});

function app() {
  const a = express();
  a.get("/me", async (req, res) => {
    res.json(await getCurrentUser(req));
  });
  a.get("/admin", requireUser, requireRole("admin"), (req, res) => {
    res.json({ ok: true, userId: req.userId });
  });
  return a;
}

describe("getCurrentUser", () => {
  it("is null when signed out", async () => {
    const res = await request(app()).get("/me").expect(200);
    expect(res.body).toBeNull();
  });

  it("reports the user and which provider issued the session", async () => {
    mockAuth = { userId: "user_1", sessionClaims: { email: "Student@SCU.edu" } };
    const res = await request(app()).get("/me").expect(200);
    expect(res.body).toEqual({ id: "user_1", email: "student@scu.edu", provider: "clerk" });
  });
});

describe("requireRole('admin')", () => {
  it("401s signed out, 403s a non-admin, allows an allowlisted admin", async () => {
    process.env.ADMIN_EMAILS = "boss@scu.edu";
    await request(app()).get("/admin").expect(401);
    mockAuth = { userId: "user_2", sessionClaims: { email: "student@scu.edu" } };
    await request(app()).get("/admin").expect(403);
    mockAuth = { userId: "user_3", sessionClaims: { email: "boss@scu.edu" } };
    const res = await request(app()).get("/admin").expect(200);
    expect(res.body.userId).toBe("user_3");
  });

  it("has no admin when ADMIN_EMAILS is empty — no account is privileged by default", async () => {
    process.env.ADMIN_EMAILS = "";
    mockAuth = { userId: "user_4", sessionClaims: { email: "anyone@scu.edu" } };
    await request(app()).get("/admin").expect(403);
  });
});

describe("AUTH_PROVIDER", () => {
  it("defaults to clerk", () => {
    expect(resolveAuthProviderName({})).toBe("clerk");
    expect(getAuthAdapter({}).name).toBe("clerk");
  });

  it("refuses oidc until SCU's IdP details exist, and refuses unknown values", () => {
    expect(() => getAuthAdapter({ AUTH_PROVIDER: "oidc" })).toThrow(/SCU OIDC adapter/);
    expect(() => getAuthAdapter({ AUTH_PROVIDER: "none" })).toThrow(/must be/);
  });
});

describe("startup configuration", () => {
  const base = { PORT: "8080", DATABASE_URL: "postgresql://u:p@localhost:5432/db" };
  const errors = (env: Record<string, string>) =>
    collectConfigProblems(env)
      .filter((p) => p.severity === "error")
      .map((p) => p.variable);

  it("blocks AUTH_PROVIDER=oidc and unknown providers", () => {
    expect(errors({ ...base, AUTH_PROVIDER: "oidc" })).toContain("AUTH_PROVIDER");
    expect(errors({ ...base, AUTH_PROVIDER: "magic" })).toContain("AUTH_PROVIDER");
  });

  it("rejects AI_PROVIDER=openai and names a missing provider key", () => {
    expect(errors({ ...base, AI_PROVIDER: "openai" })).toContain("AI_PROVIDER");
    expect(errors({ ...base, AI_PROVIDER: "gemini" })).toContain("GEMINI_API_KEY");
    expect(errors({ ...base, AI_PROVIDER: "vertex" })).toContain("GOOGLE_CLOUD_PROJECT");
    expect(errors({ ...base, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })).not.toContain("ANTHROPIC_API_KEY");
  });

  it("only warns when AI is simply off", () => {
    const p = collectConfigProblems(base).find((x) => x.variable === "AI_PROVIDER");
    expect(p?.severity).toBe("warning");
  });
});
