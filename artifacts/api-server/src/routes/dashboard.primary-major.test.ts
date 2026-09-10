/**
 * The dashboard reflects the main Degree Plan's PRIMARY major planning intent,
 * never a stale onboarding value and never an unpromoted tentative scenario.
 * `declaredMajor` still exposes the profile/APR record so the UI can flag the
 * difference. (professor follow-up video 2)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    req.userEmail = `${userId}@example.com`;
    next();
  },
}));

const { db, studentProfilesTable, academicPlansTable, planItemsTable } =
  await import("@workspace/db");
const dashboardRouter = (await import("./dashboard")).default;

const app = express();
app.use(express.json());
app.use("/api", dashboardRouter);

const USER = `dash-pm-${Date.now()}`;
const as = (r: request.Test) => r.set("x-test-user", USER);

async function cleanup() {
  const rows = await db
    .select({ id: academicPlansTable.id })
    .from(academicPlansTable)
    .where(eq(academicPlansTable.userId, USER));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db.delete(academicPlansTable).where(inArray(academicPlansTable.id, ids));
  }
  await db.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, USER));
}

async function insertDegreePlan(primaryMajor: string | null) {
  const [row] = await db
    .insert(academicPlansTable)
    .values({
      userId: USER,
      name: "Degree Plan",
      planType: "degree",
      programs: { primaryMajor, additionalMajors: [], minors: [], professionalGoals: [] },
    })
    .returning();
  return row!.id;
}

const summary = async () =>
  (await as(request(app).get("/api/dashboard/summary")).expect(200)).body;

beforeAll(async () => {
  await cleanup();
  await db.insert(studentProfilesTable).values({
    userId: USER,
    name: "Dash Tester",
    studentType: "undergraduate",
    college: "College of Arts and Sciences",
    major: "BIOL",
    startTerm: "fall",
    startYear: 2024,
    expectedGradTerm: "spring",
    expectedGradYear: 2028,
    currentTerm: "fall",
    currentYear: 2026,
  });
});
afterAll(cleanup);

describe("dashboard planning major", () => {
  it("shows the profile major when no Degree Plan primaryMajor is set", async () => {
    await insertDegreePlan(null);
    const body = await summary();
    expect(body.planningMajor).toBe("BIOL");
    expect(body.declaredMajor).toBe("BIOL");
    expect(body.profile.major).toBe("BIOL");
  });

  it("reflects the Degree Plan primaryMajor as planning intent while preserving the declared/APR major", async () => {
    // Reset and set the degree plan's planning major to Chemistry.
    const rows = await db
      .select()
      .from(academicPlansTable)
      .where(
        and(
          eq(academicPlansTable.userId, USER),
          eq(academicPlansTable.planType, "degree"),
        ),
      );
    await db
      .update(academicPlansTable)
      .set({
        programs: { primaryMajor: "CHEM", additionalMajors: [], minors: [], professionalGoals: [] },
      })
      .where(eq(academicPlansTable.id, rows[0]!.id));

    const body = await summary();
    expect(body.planningMajor).toBe("CHEM");
    expect(body.profile.major).toBe("CHEM");
    // The onboarding/APR record is untouched.
    expect(body.declaredMajor).toBe("BIOL");
  });

  it("ignores an unpromoted tentative scenario's primary major", async () => {
    await db.insert(academicPlansTable).values({
      userId: USER,
      name: "What if Finance",
      planType: "tentative",
      programs: { primaryMajor: "FNCE", additionalMajors: [], minors: [], professionalGoals: [] },
    });
    const body = await summary();
    // Still Chemistry (the Degree Plan), never the tentative's Finance.
    expect(body.planningMajor).toBe("CHEM");
    expect(body.planningMajor).not.toBe("FNCE");
  });
});
