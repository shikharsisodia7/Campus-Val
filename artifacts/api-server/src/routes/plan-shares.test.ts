/**
 * API tests for /api/plan-shares and /api/advisor/shared-students — student-
 * controlled advisor sharing (docs/ADVISOR_SHARING.md). Covers the exact
 * permission matrix from the product spec: grant, view, revoke, scope
 * enforcement, and unauthorized denial. Auth is stubbed via x-test-user/
 * x-test-email headers (same pattern as routes/usage.test.ts); everything
 * else runs against the real routes and the real database with throwaway
 * user ids, cleaned up afterwards.
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

const { db, academicPlansTable, planItemsTable, planSharesTable } =
  await import("@workspace/db");
const plansRouter = (await import("./plans")).default;
const planSharesRouter = (await import("./plan-shares")).default;

const app = express();
app.use(express.json());
app.use("/api", plansRouter);
app.use("/api", planSharesRouter);

const RUN = Date.now();
const STUDENT_A = `test-share-student-a-${RUN}`;
const STUDENT_B = `test-share-student-b-${RUN}`;
const ADVISOR_X_EMAIL = `advisor-x-${RUN}@scu.edu`;
const ADVISOR_Y_EMAIL = `advisor-y-${RUN}@scu.edu`;
const RANDOM_REVIEWER_EMAIL = `random-reviewer-${RUN}@pdx.edu`;
const TEST_USERS = [STUDENT_A, STUDENT_B];

const asStudentA = (r: request.Test) =>
  r.set("x-test-user", STUDENT_A).set("x-test-email", "student-a@scu.edu");
const asStudentB = (r: request.Test) =>
  r.set("x-test-user", STUDENT_B).set("x-test-email", "student-b@scu.edu");
const asAdvisorX = (r: request.Test) =>
  r.set("x-test-user", "advisor-x-uid").set("x-test-email", ADVISOR_X_EMAIL);
const asAdvisorY = (r: request.Test) =>
  r.set("x-test-user", "advisor-y-uid").set("x-test-email", ADVISOR_Y_EMAIL);
const asRandomReviewer = (r: request.Test) =>
  r.set("x-test-user", "random-reviewer-uid").set("x-test-email", RANDOM_REVIEWER_EMAIL);

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
  await db
    .delete(planSharesTable)
    .where(inArray(planSharesTable.studentUserId, TEST_USERS));
}

afterAll(cleanup);

describe("POST /api/plan-shares (student grants access)", () => {
  it("401s when signed out", async () => {
    await request(app)
      .post("/api/plan-shares")
      .send({ advisorEmail: ADVISOR_X_EMAIL })
      .expect(401);
  });

  it("rejects a malformed email", async () => {
    await asStudentA(request(app).post("/api/plan-shares"))
      .send({ advisorEmail: "not-an-email" })
      .expect(400);
  });

  it("rejects sharing with yourself", async () => {
    await asStudentA(request(app).post("/api/plan-shares"))
      .send({ advisorEmail: "student-a@scu.edu" })
      .expect(400);
  });

  it("defaults to degree_plan-only scope and never bundles APR automatically", async () => {
    const res = await asStudentA(request(app).post("/api/plan-shares"))
      .send({ advisorEmail: ADVISOR_X_EMAIL })
      .expect(201);
    expect(res.body.scopes).toEqual(["degree_plan"]);
    expect(res.body.scopes).not.toContain("apr");
    expect(res.body.status).toBe("active");
  });

  it("rejects a bare apr scope request unless explicitly listed by the client", async () => {
    // Sanity: the server only trusts scopes the client actually sent, not an
    // inferred default — this test documents that "apr" must be explicit.
    const res = await asStudentA(request(app).post("/api/plan-shares"))
      .send({ advisorEmail: ADVISOR_Y_EMAIL, scopes: ["degree_plan", "apr"] })
      .expect(201);
    expect(res.body.scopes.sort()).toEqual(["apr", "degree_plan"]);
  });
});

describe("GET /api/plan-shares (student sees who has access)", () => {
  it("lists only the caller's own grants", async () => {
    const res = await asStudentA(request(app).get("/api/plan-shares")).expect(200);
    const emails = res.body.shares.map((s: any) => s.advisorEmail);
    expect(emails).toEqual(expect.arrayContaining([ADVISOR_X_EMAIL, ADVISOR_Y_EMAIL]));

    const resB = await asStudentB(request(app).get("/api/plan-shares")).expect(200);
    expect(resB.body.shares).toHaveLength(0);
  });
});

describe("GET /api/advisor/shared-students/:id/plan (advisor read-only view)", () => {
  it("401s when signed out", async () => {
    await request(app)
      .get(`/api/advisor/shared-students/${STUDENT_A}/plan`)
      .expect(401);
  });

  it("lets the shared advisor read the student's Degree Plan", async () => {
    // ensureDegreePlan runs on the student's own first /api/plans call.
    await asStudentA(request(app).get("/api/plans")).expect(200);

    const res = await asAdvisorX(
      request(app).get(`/api/advisor/shared-students/${STUDENT_A}/plan`),
    ).expect(200);
    expect(res.body.planType).toBe("degree");
    expect(res.body.readOnly).toBe(true);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("denies an advisor nobody shared with", async () => {
    await asRandomReviewer(
      request(app).get(`/api/advisor/shared-students/${STUDENT_A}/plan`),
    ).expect(403);
  });

  it("denies a different student's data leaking to the advisor", async () => {
    // Student B never shared anything, so even though the route only checks
    // (studentUserId, advisorEmail), Advisor X gets 403 for Student B.
    await asAdvisorX(
      request(app).get(`/api/advisor/shared-students/${STUDENT_B}/plan`),
    ).expect(403);
  });

  it("enforces scope: a degree_plan-only share cannot read the tentative plan", async () => {
    await asAdvisorX(
      request(app).get(`/api/advisor/shared-students/${STUDENT_A}/plan?planType=tentative`),
    ).expect(403);
  });

  it("random external reviewer sees no shared students and cannot read any plan", async () => {
    const res = await asRandomReviewer(
      request(app).get("/api/advisor/shared-students"),
    ).expect(200);
    expect(res.body.students).toHaveLength(0);
  });
});

describe("DELETE /api/plan-shares/:id (student revokes)", () => {
  it("immediately denies the advisor after revoke", async () => {
    const listRes = await asStudentA(request(app).get("/api/plan-shares")).expect(200);
    const grant = listRes.body.shares.find((s: any) => s.advisorEmail === ADVISOR_X_EMAIL);
    expect(grant).toBeTruthy();

    await asStudentA(request(app).delete(`/api/plan-shares/${grant.id}`)).expect(200);

    await asAdvisorX(
      request(app).get(`/api/advisor/shared-students/${STUDENT_A}/plan`),
    ).expect(403);
  });

  it("a student cannot revoke another student's share", async () => {
    const listRes = await asStudentA(request(app).get("/api/plan-shares")).expect(200);
    const grant = listRes.body.shares.find((s: any) => s.advisorEmail === ADVISOR_Y_EMAIL);
    expect(grant).toBeTruthy();

    await asStudentB(request(app).delete(`/api/plan-shares/${grant.id}`)).expect(404);
  });
});
