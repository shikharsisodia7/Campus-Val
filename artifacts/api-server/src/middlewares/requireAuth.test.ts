/**
 * Unit tests for the CampusVal auth gate: SCU students authenticate
 * normally, invited external reviewers (Jake, Tom Hines, Yale contacts,
 * etc.) get in via a server-side allowlist, and everyone else is denied.
 * Clerk itself is mocked — these tests exercise only requireAuth's own
 * decision logic.
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

  it("allows an allowlisted external reviewer", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "jake@example.com,tom.hines@example.org";
    mockAuth = {
      userId: "user_jake",
      sessionClaims: { email: "jake@example.com" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.userEmail).toBe("jake@example.com");
  });

  it("normalizes case and whitespace when matching the allowlist", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "  Jake@Example.com , TOM.HINES@example.org ";
    mockAuth = {
      userId: "user_jake_2",
      sessionClaims: { email: "JAKE@EXAMPLE.COM" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
  });

  it("denies an unapproved external email with 403", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "jake@example.com";
    mockAuth = {
      userId: "user_random",
      sessionClaims: { email: "someone@gmail.com" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/SCU users and invited reviewers/);
  });

  it("denies an unapproved external email when the allowlist is unset", async () => {
    delete process.env.GUEST_REVIEWER_EMAILS;
    mockAuth = {
      userId: "user_random",
      sessionClaims: { email: "someone@gmail.com" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(403);
  });

  it("falls back to a Clerk API lookup when claims lack an email", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "jake@example.com";
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
  it("never leaks the allowlist contents in a way tests can't control server-side", () => {
    process.env.GUEST_REVIEWER_EMAILS = "a@example.com,B@Example.com";
    expect(isApprovedCampusValUser("student@scu.edu")).toBe(true);
    expect(isApprovedCampusValUser("a@example.com")).toBe(true);
    expect(isApprovedCampusValUser("b@example.com")).toBe(true);
    expect(isApprovedCampusValUser("c@example.com")).toBe(false);
  });
});
