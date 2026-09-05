/**
 * API test for spec requirement "J": an admin role (ADMIN_EMAILS, used only
 * to gate /api/usage-events and /api/admin/usage/summary) must NOT imply any
 * bonus access to another student's Degree Plan. plans.ts never references
 * isAdminUser at all — this test locks that in behaviorally, not just by
 * reading the source, so a future change that wires admin bypass into the
 * ownership check would fail a real request instead of only a code review.
 *
 * Auth is stubbed via x-test-user/x-test-email headers, same pattern as
 * routes/usage.test.ts; everything else runs against the real routes and
 * real database, using throwaway user ids cleaned up afterwards.
 */
import { describe, it, expect, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    const email = req.header("x-test-email");
    if (!userId || !email) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    req.userEmail = email;
    next();
  },
}));

vi.mock("../lib/admin", () => ({
  isAdminUser: (email: string) => email === "admin@scu.edu",
}));

const { db, academicPlansTable, planItemsTable } = await import("@workspace/db");
const plansRouter = (await import("./plans")).default;

const app = express();
app.use(express.json());
app.use("/api", plansRouter);

const RUN = Date.now();
const STUDENT = `test-admin-iso-student-${RUN}`;
const ADMIN = `test-admin-iso-admin-${RUN}`;
const TEST_USERS = [STUDENT, ADMIN];

async function cleanup() {
  const plans = await db
    .select({ id: academicPlansTable.id })
    .from(academicPlansTable)
    .where(inArray(academicPlansTable.userId, TEST_USERS));
  const ids = plans.map((p) => p.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db.delete(academicPlansTable).where(inArray(academicPlansTable.id, ids));
  }
}

afterAll(cleanup);

async function studentPlanId(): Promise<number> {
  const res = await request(app)
    .get("/api/plans")
    .set("x-test-user", STUDENT)
    .set("x-test-email", "student@scu.edu")
    .expect(200);
  return res.body.plans.find((p: any) => p.planType === "degree").id;
}

describe("admin role grants no bonus access to another student's plan", () => {
  it("an ADMIN_EMAILS-listed caller gets 404 reading a plan they don't own, same as any other user", async () => {
    await cleanup();
    const planId = await studentPlanId();

    const res = await request(app)
      .get(`/api/plans/${planId}`)
      .set("x-test-user", ADMIN)
      .set("x-test-email", "admin@scu.edu")
      .expect(404);
    expect(res.body.error).toBeDefined();
  });

  it("admin cannot write to a plan they don't own either", async () => {
    const planId = await studentPlanId();

    await request(app)
      .patch(`/api/plans/${planId}`)
      .set("x-test-user", ADMIN)
      .set("x-test-email", "admin@scu.edu")
      .send({ name: "admin override" })
      .expect(404);
  });
});
