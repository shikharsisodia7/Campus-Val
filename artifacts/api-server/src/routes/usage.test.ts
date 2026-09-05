/**
 * API tests for /api/usage-events and /api/admin/usage/summary
 * (docs/USAGE_ANALYTICS.md). Auth is stubbed via x-test-user/x-test-email
 * headers, same pattern as routes/plans.test.ts; everything else runs
 * against the real routes and real database with throwaway user ids.
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: any) => {
      const userId = req.header("x-test-user");
      const email = req.header("x-test-email");
      if (!userId || !email) return res.status(401).json({ error: "Sign in required" });
      req.userId = userId;
      req.userEmail = email;
      next();
    },
  };
});

vi.mock("../lib/admin", () => ({
  isAdminUser: (email: string) => email === "admin@scu.edu",
}));

const { db, usageEventsTable } = await import("@workspace/db");
const usageRouter = (await import("./usage")).default;

const app = express();
app.use(express.json());
app.use("/api", usageRouter);

const RUN = Date.now();
const SCU_USER = `test-usage-scu-${RUN}`;
const REVIEWER_USER = `test-usage-reviewer-${RUN}`;
const TEST_USERS = [SCU_USER, REVIEWER_USER];

const asScuUser = (r: request.Test) =>
  r.set("x-test-user", SCU_USER).set("x-test-email", "student@scu.edu");
const asReviewer = (r: request.Test) =>
  r.set("x-test-user", REVIEWER_USER).set("x-test-email", "reviewer@pdx.edu");
const asAdmin = (r: request.Test) =>
  r.set("x-test-user", "test-admin").set("x-test-email", "admin@scu.edu");

afterAll(async () => {
  await db.delete(usageEventsTable).where(inArray(usageEventsTable.userId, TEST_USERS));
});

describe("POST /api/usage-events", () => {
  it("401s when signed out", async () => {
    await request(app).post("/api/usage-events").send({ feature: "dashboard" }).expect(401);
  });

  it("rejects an unknown feature name (no free-text query strings or arbitrary events)", async () => {
    await asScuUser(request(app).post("/api/usage-events")).send({
      feature: "CHEM 11 grade lookup",
    }).expect(400);
  });

  it("records a known feature under the caller's own verified identity, not client-supplied data", async () => {
    await asScuUser(request(app).post("/api/usage-events"))
      .send({ feature: "degree_plan", userId: "someone-else", userEmail: "attacker@evil.com" })
      .expect(200, { recorded: true });

    const rows = await db
      .select()
      .from(usageEventsTable)
      .where(inArray(usageEventsTable.userId, [SCU_USER]));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userEmail).toBe("student@scu.edu");
    expect(rows[0]!.userType).toBe("scu");
    expect(rows[0]!.feature).toBe("degree_plan");
  });

  it("classifies a non-@scu.edu caller as external_reviewer", async () => {
    await asReviewer(request(app).post("/api/usage-events"))
      .send({ feature: "quarter_plan" })
      .expect(200, { recorded: true });
    const rows = await db
      .select()
      .from(usageEventsTable)
      .where(inArray(usageEventsTable.userId, [REVIEWER_USER]));
    expect(rows[0]!.userType).toBe("external_reviewer");
  });

  // Regression test: this route previously replied 204 (No Content) on
  // success. That empty-body response shape was observed in production
  // intermittently arriving at the client as a platform-level 503 even
  // though the write had already committed (see docs/DEPLOYMENT.md and the
  // PR that introduced this test for the Vercel runtime-log evidence).
  // Asserting a non-empty 200 body here locks in the fix.
  it("replies 200 with a JSON body, never an empty 204", async () => {
    const res = await asScuUser(request(app).post("/api/usage-events")).send({
      feature: "find_courses",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recorded: true });
  });
});

describe("GET /api/admin/usage/summary", () => {
  it("401s when signed out", async () => {
    await request(app).get("/api/admin/usage/summary").expect(401);
  });

  it("403s a normal signed-in user (not on ADMIN_EMAILS)", async () => {
    await asScuUser(request(app).get("/api/admin/usage/summary")).expect(403);
  });

  it("403s an allowlisted external reviewer who isn't separately an admin", async () => {
    await asReviewer(request(app).get("/api/admin/usage/summary")).expect(403);
  });

  it("returns aggregated usage with no sensitive content for an admin", async () => {
    const res = await asAdmin(request(app).get("/api/admin/usage/summary")).expect(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(Array.isArray(res.body.features)).toBe(true);
    expect(typeof res.body.activeUsersLast7Days).toBe("number");

    const testUserRow = res.body.users.find((u: any) => u.userId === SCU_USER);
    expect(testUserRow).toBeTruthy();
    expect(testUserRow.userEmail).toBe("student@scu.edu");
    expect(testUserRow.userType).toBe("scu");
    expect(testUserRow).not.toHaveProperty("feature");

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("CHEM");
    expect(body).not.toContain("grade");
  });
});
