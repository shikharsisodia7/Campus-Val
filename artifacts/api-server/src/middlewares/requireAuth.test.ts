/**
 * Unit tests for the CampusVal auth gate: SCU emails and allowlisted
 * external reviewers are permitted; everyone else is denied. Clerk itself
 * is mocked.
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

  it("allows an allowlisted external reviewer (e.g. thines@pdx.edu)", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "thines@pdx.edu, jake@example.com";
    mockAuth = {
      userId: "user_thom",
      sessionClaims: { email: "thines@pdx.edu" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.userEmail).toBe("thines@pdx.edu");
  });

  it("denies a random non-SCU, non-allowlisted email with 403", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "thines@pdx.edu";
    mockAuth = {
      userId: "user_random",
      sessionClaims: { email: "random@gmail.com" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(403);
  });

  it("denies an unapproved @pdx.edu email that isn't on the allowlist", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "thines@pdx.edu";
    mockAuth = {
      userId: "user_other_pdx",
      sessionClaims: { email: "someoneelse@pdx.edu" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(403);
  });

  it("normalizes email case for both req.userEmail and the allowlist check", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "thines@pdx.edu";
    mockAuth = {
      userId: "user_thom_upper",
      sessionClaims: { email: "THINES@PDX.EDU" },
    };
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.userEmail).toBe("thines@pdx.edu");
  });

  it("falls back to a Clerk API lookup when claims lack an email", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "";
    mockAuth = { userId: "user_scu_2" };
    mockGetUser.mockResolvedValue({
      primaryEmailAddressId: "eid_1",
      emailAddresses: [{ id: "eid_1", emailAddress: "student@scu.edu" }],
    });
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(200);
    expect(mockGetUser).toHaveBeenCalledWith("user_scu_2");
  });

  it("denies safely when the authenticated user has no readable email", async () => {
    process.env.GUEST_REVIEWER_EMAILS = "";
    mockAuth = { userId: "user_no_email" };
    mockGetUser.mockResolvedValue({
      primaryEmailAddressId: "eid_missing",
      emailAddresses: [],
    });
    const res = await request(buildApp()).get("/protected");
    expect(res.status).toBe(403);
  });
});

describe("isApprovedCampusValUser", () => {
  const ORIGINAL = process.env.GUEST_REVIEWER_EMAILS;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.GUEST_REVIEWER_EMAILS;
    else process.env.GUEST_REVIEWER_EMAILS = ORIGINAL;
  });

  it("approves any @scu.edu email", () => {
    expect(isApprovedCampusValUser("student@scu.edu")).toBe(true);
    expect(isApprovedCampusValUser("Student@SCU.EDU")).toBe(true);
  });

  it("approves an allowlisted reviewer email, case-insensitively", () => {
    process.env.GUEST_REVIEWER_EMAILS = "thines@pdx.edu";
    expect(isApprovedCampusValUser("thines@pdx.edu")).toBe(true);
    expect(isApprovedCampusValUser("THINES@PDX.EDU")).toBe(true);
  });

  it("denies a random non-allowlisted email", () => {
    process.env.GUEST_REVIEWER_EMAILS = "thines@pdx.edu";
    expect(isApprovedCampusValUser("anyone@example.com")).toBe(false);
  });

  it("denies everyone when the allowlist is empty/unset", () => {
    delete process.env.GUEST_REVIEWER_EMAILS;
    expect(isApprovedCampusValUser("anyone@example.com")).toBe(false);
  });
});
