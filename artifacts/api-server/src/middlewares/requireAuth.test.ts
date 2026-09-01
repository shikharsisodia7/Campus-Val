/**
 * Unit tests for the CampusVal auth gate. As of 2026-09-01 the gate is
 * intentionally open to any signed-in email (see requireAuth.ts) — this
 * exercises requireAuth's own decision logic: still 401 signed-out, still
 * requires a readable email, otherwise any authenticated email passes.
 * Clerk itself is mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let mockAuth: { userId: string | null; sessionClaims?: Record<string, unknown> } = {
  userId: null,
};
const mockGetUser = vi.fn();

vi.mock("@clerk/express", () => ({
  getAuth: () => mockAuth,
  clerkClient: { users: { getUser: (id: string) => mockGetUser(id) } },
}));

const { requireAuth, isApprovedCampusValUser } = await import("./requireAuth");

function buildApp() {
  const app = express();
  app.get("/protected", requireAuth, (req, res) => {
    res.json({ userId: req.userId, userEmail: req.userEmail });
  });
  return app;
}

const ORIGINAL_ALLOWLIST = process.env.GUEST_REVIEWER_EMAILS;

beforeEach(() => {
  mockAuth = { userId: null };
  mockGetUser.mockReset();
});

afterEach(() => {
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.GUEST_REVIEWER_EMAILS;
  else process.env.GUEST_REVIEWER_EMAILS = ORIGINAL_ALLOWLIST;
});

describe("requireAuth — SCU and guest access", () => {
  it("denies a signed-out request with 401", async () => {
    mockAuth = { userId: null };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(401);
  });

  it("allows an @scu.edu user", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "";
    mockAuth = {
      userId: "user_scu",
      sessionClaims: { email: "student@scu.edu" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: "user_scu", userEmail: "student@scu.edu" });
  });

  it("allows any other signed-in email (access is intentionally open, not just @scu.edu)", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "";
    mockAuth = {
      userId: "user_jake",
      sessionClaims: { email: "jake@example.com" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.userEmail).toBe("jake@example.com");
  });

  it("normalizes email case for req.userEmail regardless of allowlist state", async () => {
    delete process.env.GUEST_REVIEWER_EMAILS;
    mockAuth = {
      userId: "user_jake_2",
      sessionClaims: { email: "JAKE@EXAMPLE.COM" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.userEmail).toBe("jake@example.com");
  });

  it("falls back to a Clerk API lookup when claims lack an email", async () => {
    delete process.env.GUEST_REVIEWER_EMAILS;
    mockAuth = { userId: "user_jake_3" };
    mockGetUser.mockResolvedValue({
      primaryEmailAddressId: "eid_1",
      emailAddresses: [{ id: "eid_1", emailAddress: "jake@example.com" }],
    });
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith("user_jake_3");
  });
});

describe("isApprovedCampusValUser", () => {
  it("approves any email — access is intentionally open as of 2026-09-01", () => {
    expect(isApprovedCampusValUser("student@scu.edu")).toBe(true);
    expect(isApprovedCampusValUser("anyone@example.com")).toBe(true);
  });
});
