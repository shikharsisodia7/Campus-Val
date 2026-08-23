/**
 * Promoting a Tentative Degree Plan.
 *
 * REGRESSION: promote demoted the current Degree Plan and then promoted the
 * chosen one in two separate statements. GET /plans calls ensureDegreePlan(),
 * so a request landing in the window between them — and the frontend refetches
 * often — created a spurious empty "Degree Plan". The user ended up with TWO
 * plans of type "degree", and `find(p => p.planType === "degree")` could pick
 * the empty one, making the plan they had just promoted look like it vanished.
 *
 * Observed live before the fix: plans listed as
 *   degree: "Degree Plan (Tentative)" | degree: "Degree Plan" | tentative: "…(previous, …)"
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

const { db, academicPlansTable, planItemsTable } = await import("@workspace/db");
const plansRouter = (await import("./plans")).default;

const stubLogger = (req: any, _res: any, next: any) => {
  req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  next();
};

const app = express();
app.use(express.json());
app.use(stubLogger);
app.use("/api", plansRouter);

const USER = `test-promote-${Date.now()}`;
const as = (r: request.Test) => r.set("x-test-user", USER);

async function cleanup() {
  const rows = await db
    .select({ id: academicPlansTable.id })
    .from(academicPlansTable)
    .where(inArray(academicPlansTable.userId, [USER]));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db
      .delete(academicPlansTable)
      .where(inArray(academicPlansTable.id, ids));
  }
}

const listPlans = async () =>
  (await as(request(app).get("/api/plans")).expect(200)).body.plans as Array<{
    id: number;
    name: string;
    planType: string;
  }>;

async function newTentative(name: string, copyFromPlanId?: number) {
  const res = await as(request(app).post("/api/plans"))
    .send({ name, copyFromPlanId: copyFromPlanId ?? null })
    .expect(201);
  return res.body.id as number;
}

beforeAll(cleanup);
afterAll(cleanup);

describe("promoting a tentative plan", () => {
  it("leaves exactly one Degree Plan", async () => {
    const plans = await listPlans();
    const degree = plans.find((p) => p.planType === "degree")!;
    const tentativeId = await newTentative("Second major idea", degree.id);

    await as(request(app).post(`/api/plans/${tentativeId}/promote`)).expect(200);

    const after = await listPlans();
    expect(after.filter((p) => p.planType === "degree")).toHaveLength(1);
  });

  it("makes the promoted plan the Degree Plan", async () => {
    const plans = await listPlans();
    const degree = plans.find((p) => p.planType === "degree")!;
    const tentativeId = await newTentative("Study abroad", degree.id);

    await as(request(app).post(`/api/plans/${tentativeId}/promote`)).expect(200);

    const after = await listPlans();
    const nowDegree = after.find((p) => p.planType === "degree")!;
    expect(nowDegree.id).toBe(tentativeId);
  });

  it("keeps the previous Degree Plan as a dated tentative backup", async () => {
    const before = await listPlans();
    const degree = before.find((p) => p.planType === "degree")!;
    const tentativeId = await newTentative("Backup check", degree.id);

    await as(request(app).post(`/api/plans/${tentativeId}/promote`)).expect(200);

    const after = await listPlans();
    const backup = after.find(
      (p) => p.planType === "tentative" && /\(previous, \d{4}-\d{2}-\d{2}\)/.test(p.name),
    );
    expect(backup).toBeTruthy();
  });

  it("drops the scenario suffix so the promoted plan is not called Tentative", async () => {
    const plans = await listPlans();
    const degree = plans.find((p) => p.planType === "degree")!;
    const tentativeId = await newTentative("Degree Plan (Tentative)", degree.id);

    await as(request(app).post(`/api/plans/${tentativeId}/promote`)).expect(200);

    const after = await listPlans();
    const nowDegree = after.find((p) => p.planType === "degree")!;
    expect(nowDegree.name).toBe("Degree Plan");
    expect(nowDegree.name).not.toMatch(/Tentative/i);
  });

  it("never leaves a user with zero Degree Plans mid-promote", async () => {
    // ensureDegreePlan() would paper over a gap by creating an empty plan, so
    // assert on the count of degree plans rather than merely on existence.
    const plans = await listPlans();
    const degree = plans.find((p) => p.planType === "degree")!;
    const tentativeId = await newTentative("Race check", degree.id);

    const [, listedDuring] = await Promise.all([
      as(request(app).post(`/api/plans/${tentativeId}/promote`)).expect(200),
      listPlans(),
    ]);

    expect(listedDuring.filter((p) => p.planType === "degree").length).toBe(1);
    const after = await listPlans();
    expect(after.filter((p) => p.planType === "degree")).toHaveLength(1);
  });

  it("carries the promoted plan's items across", async () => {
    const plans = await listPlans();
    const degree = plans.find((p) => p.planType === "degree")!;
    const tentativeId = await newTentative("With a course", degree.id);
    await as(request(app).post(`/api/plans/${tentativeId}/items`))
      .send({
        itemType: "course",
        courseCode: "ANTH 3",
        academicYear: 2026,
        term: "fall",
      })
      .expect(201);

    await as(request(app).post(`/api/plans/${tentativeId}/promote`)).expect(200);

    const detail = await as(
      request(app).get(`/api/plans/${tentativeId}`),
    ).expect(200);
    expect(
      detail.body.items.some((i: any) => i.courseCode === "ANTH 3"),
    ).toBe(true);
  });

  it("refuses to promote a plan that is already the Degree Plan", async () => {
    const plans = await listPlans();
    const degree = plans.find((p) => p.planType === "degree")!;
    await as(request(app).post(`/api/plans/${degree.id}/promote`)).expect(400);
  });
});
