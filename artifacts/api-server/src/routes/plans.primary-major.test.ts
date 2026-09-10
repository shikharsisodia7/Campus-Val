/**
 * Plan-scoped PRIMARY major (professor follow-up video 2).
 *
 * Covers persistence, Degree-Plan ↔ Tentative isolation, independent tentative
 * scenarios, atomic promotion of the primary major with the rest of the
 * program state, owner authorization, validation, and last-write-wins under
 * rapid switching. DB-backed via the same pattern as plans.promote.test.ts.
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
    req.userEmail = `${userId}@example.com`;
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

const USER = `pm-user-${Date.now()}`;
const OTHER = `pm-other-${Date.now()}`;
const as = (r: request.Test, user = USER) => r.set("x-test-user", user);

async function cleanup() {
  const rows = await db
    .select({ id: academicPlansTable.id })
    .from(academicPlansTable)
    .where(inArray(academicPlansTable.userId, [USER, OTHER]));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db.delete(academicPlansTable).where(inArray(academicPlansTable.id, ids));
  }
}

const listPlans = async (user = USER) =>
  (await as(request(app).get("/api/plans"), user).expect(200)).body
    .plans as Array<{ id: number; name: string; planType: string }>;

const getPlan = async (id: number, user = USER) =>
  (await as(request(app).get(`/api/plans/${id}`), user).expect(200)).body;

const fullPrograms = (over: Record<string, unknown> = {}) => ({
  primaryMajor: null,
  additionalMajors: [],
  minors: [],
  professionalGoals: [],
  ...over,
});

async function degreePlanId(user = USER) {
  const plans = await listPlans(user);
  return plans.find((p) => p.planType === "degree")!.id;
}

async function newTentative(name: string, copyFromPlanId?: number) {
  const res = await as(request(app).post("/api/plans"))
    .send({ name, copyFromPlanId: copyFromPlanId ?? null })
    .expect(201);
  return res.body.id as number;
}

beforeAll(cleanup);
afterAll(cleanup);

describe("plan-scoped primary major", () => {
  it("persists a primaryMajor set on the Degree Plan", async () => {
    const id = await degreePlanId();
    await as(request(app).patch(`/api/plans/${id}`))
      .send({ programs: fullPrograms({ primaryMajor: "CHEM" }) })
      .expect(200);
    const plan = await getPlan(id);
    expect(plan.programs.primaryMajor).toBe("CHEM");
  });

  it("keeps Degree Plan and Tentative primary majors isolated", async () => {
    const degId = await degreePlanId();
    // Degree Plan = CHEM.
    await as(request(app).patch(`/api/plans/${degId}`))
      .send({ programs: fullPrograms({ primaryMajor: "CHEM" }) })
      .expect(200);
    // Tentative scenario workshops FNCE.
    const tentId = await newTentative("What if Finance", degId);
    await as(request(app).patch(`/api/plans/${tentId}`))
      .send({ programs: fullPrograms({ primaryMajor: "FNCE" }) })
      .expect(200);

    // Neither leaks into the other.
    expect((await getPlan(tentId)).programs.primaryMajor).toBe("FNCE");
    expect((await getPlan(degId)).programs.primaryMajor).toBe("CHEM");
  });

  it("keeps two tentative scenarios' primary majors independent", async () => {
    const degId = await degreePlanId();
    const a = await newTentative("Scenario A", degId);
    const b = await newTentative("Scenario B", degId);
    await as(request(app).patch(`/api/plans/${a}`))
      .send({ programs: fullPrograms({ primaryMajor: "CHEM" }) })
      .expect(200);
    await as(request(app).patch(`/api/plans/${b}`))
      .send({ programs: fullPrograms({ primaryMajor: "PHYS" }) })
      .expect(200);
    expect((await getPlan(a)).programs.primaryMajor).toBe("CHEM");
    expect((await getPlan(b)).programs.primaryMajor).toBe("PHYS");
  });

  it("carries primaryMajor + additional majors/minors atomically on promote", async () => {
    const degId = await degreePlanId();
    const tentId = await newTentative("Promote me", degId);
    await as(request(app).patch(`/api/plans/${tentId}`))
      .send({
        programs: fullPrograms({
          primaryMajor: "CHEM",
          additionalMajors: ["MATH"],
          minors: ["Biology"],
        }),
      })
      .expect(200);

    await as(request(app).post(`/api/plans/${tentId}/promote`)).expect(200);

    const nowDegreeId = await degreePlanId();
    expect(nowDegreeId).toBe(tentId);
    const promoted = await getPlan(nowDegreeId);
    expect(promoted.programs.primaryMajor).toBe("CHEM");
    expect(promoted.programs.additionalMajors).toContain("MATH");
    expect(promoted.programs.minors).toContain("Biology");
  });

  it("denies changing another user's plan primary major (owner-scoped)", async () => {
    const victimId = await degreePlanId(USER);
    // OTHER is authenticated but does not own USER's plan → 404, no mutation.
    await as(request(app).patch(`/api/plans/${victimId}`), OTHER)
      .send({ programs: fullPrograms({ primaryMajor: "FNCE" }) })
      .expect(404);
    // USER's value is whatever a prior test set; assert it is NOT FNCE.
    expect((await getPlan(victimId, USER)).programs.primaryMajor).not.toBe("FNCE");
  });

  it("rejects an invalid primaryMajor payload", async () => {
    const id = await degreePlanId();
    await as(request(app).patch(`/api/plans/${id}`))
      .send({ programs: { ...fullPrograms(), primaryMajor: 12345 } })
      .expect(400);
    await as(request(app).patch(`/api/plans/${id}`))
      .send({ programs: fullPrograms({ primaryMajor: "X".repeat(200) }) })
      .expect(400);
  });

  it("last write wins under rapid A→B→C switching", async () => {
    const degId = await degreePlanId();
    for (const m of ["BIOL", "CHEM", "PHYS"]) {
      await as(request(app).patch(`/api/plans/${degId}`))
        .send({ programs: fullPrograms({ primaryMajor: m }) })
        .expect(200);
    }
    expect((await getPlan(degId)).programs.primaryMajor).toBe("PHYS");
  });

  it("clears the primaryMajor back to the profile default when set to null", async () => {
    const id = await degreePlanId();
    await as(request(app).patch(`/api/plans/${id}`))
      .send({ programs: fullPrograms({ primaryMajor: "CHEM" }) })
      .expect(200);
    await as(request(app).patch(`/api/plans/${id}`))
      .send({ programs: fullPrograms({ primaryMajor: null }) })
      .expect(200);
    expect((await getPlan(id)).programs.primaryMajor ?? null).toBeNull();
  });
});
