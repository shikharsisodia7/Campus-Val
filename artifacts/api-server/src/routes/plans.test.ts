/**
 * API tests for /api/plans — protects the invariants that were verified
 * manually: ownership, undeletable degree plan, deep-copy independence,
 * promote/demote backup, contiguous position reindexing on moves, input
 * validation, and 409 duplicate handling.
 *
 * Auth is stubbed (x-test-user header → req.userId); everything else runs
 * against the real routes and the real database, using throwaway user ids
 * that are cleaned up afterwards.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { inArray, eq } from "drizzle-orm";

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
const { COURSES } = await import("../data/courses");

const app = express();
app.use(express.json());
app.use("/api", plansRouter);

const RUN = Date.now();
const USER_A = `test-plans-a-${RUN}`;
const USER_B = `test-plans-b-${RUN}`;
const TEST_USERS = [USER_A, USER_B];

// Real catalog courses so course-add validation passes.
const [C1, C2, C3] = COURSES.slice(0, 3).map((c) => c.code);

const asA = (r: request.Test) => r.set("x-test-user", USER_A);
const asB = (r: request.Test) => r.set("x-test-user", USER_B);

async function cleanup() {
  const plans = await db
    .select({ id: academicPlansTable.id })
    .from(academicPlansTable)
    .where(inArray(academicPlansTable.userId, TEST_USERS));
  const ids = plans.map((p) => p.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db
      .delete(academicPlansTable)
      .where(inArray(academicPlansTable.id, ids));
  }
}

async function degreePlanId(user: string): Promise<number> {
  const res = await request(app)
    .get("/api/plans")
    .set("x-test-user", user)
    .expect(200);
  return res.body.plans.find((p: any) => p.planType === "degree").id;
}

async function addCourse(
  planId: number,
  courseCode: string,
  term = "fall",
  academicYear = 2026,
) {
  const res = await asA(request(app).post(`/api/plans/${planId}/items`)).send({
    itemType: "course",
    courseCode,
    term,
    academicYear,
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function getItems(planId: number, user = USER_A) {
  const res = await request(app)
    .get(`/api/plans/${planId}`)
    .set("x-test-user", user)
    .expect(200);
  return res.body.items as any[];
}

beforeAll(async () => {
  expect(COURSES.length).toBeGreaterThanOrEqual(3);
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("auth & ownership", () => {
  it("rejects unauthenticated requests", async () => {
    await request(app).get("/api/plans").expect(401);
  });

  it("returns 404 for another user's plan (read, write, delete, items)", async () => {
    const aPlanId = await degreePlanId(USER_A);
    // Make sure user B exists with their own degree plan.
    await degreePlanId(USER_B);

    await asB(request(app).get(`/api/plans/${aPlanId}`)).expect(404);
    await asB(request(app).patch(`/api/plans/${aPlanId}`))
      .send({ name: "hijack" })
      .expect(404);
    await asB(request(app).delete(`/api/plans/${aPlanId}`)).expect(404);
    await asB(request(app).post(`/api/plans/${aPlanId}/duplicate`))
      .send({ name: "steal" })
      .expect(404);
    await asB(request(app).post(`/api/plans/${aPlanId}/items`))
      .send({ itemType: "course", courseCode: C1, term: "fall", academicYear: 2026 })
      .expect(404);
  });

  it("returns 404 when duplicating with a copyFrom source owned by someone else", async () => {
    const aPlanId = await degreePlanId(USER_A);
    await asB(request(app).post("/api/plans"))
      .send({ name: "copy of a", copyFromPlanId: aPlanId })
      .expect(404);
  });
});

describe("degree plan lifecycle", () => {
  it("auto-creates exactly one degree plan and lists it first", async () => {
    const res = await asA(request(app).get("/api/plans")).expect(200);
    const degrees = res.body.plans.filter((p: any) => p.planType === "degree");
    expect(degrees).toHaveLength(1);
    expect(res.body.plans[0].planType).toBe("degree");
  });

  it("refuses to delete the degree plan", async () => {
    const id = await degreePlanId(USER_A);
    const res = await asA(request(app).delete(`/api/plans/${id}`)).expect(400);
    expect(res.body.error).toMatch(/cannot be deleted/i);
    // Still there.
    await asA(request(app).get(`/api/plans/${id}`)).expect(200);
  });
});

describe("duplication (deep copy)", () => {
  it("copies items and keeps the copy independent of the source", async () => {
    const sourceId = await degreePlanId(USER_A);
    const item = await addCourse(sourceId, C1, "winter", 2026);

    const dup = await asA(request(app).post(`/api/plans/${sourceId}/duplicate`))
      .send({ name: "What-if copy" })
      .expect(201);
    expect(dup.body.planType).toBe("tentative");
    expect(dup.body.sourcePlanId).toBe(sourceId);
    expect(dup.body.itemCount).toBe(1);

    // Mutating the copy must not touch the source (and vice versa).
    const copyItems = await getItems(dup.body.id);
    await asA(
      request(app).delete(`/api/plans/${dup.body.id}/items/${copyItems[0].id}`),
    ).expect(204);
    expect(await getItems(dup.body.id)).toHaveLength(0);
    const sourceItems = await getItems(sourceId);
    expect(sourceItems.map((i) => i.id)).toContain(item.id);

    await addCourse(sourceId, C2, "spring", 2026);
    expect(await getItems(dup.body.id)).toHaveLength(0);

    // Cleanup for later tests.
    await asA(request(app).delete(`/api/plans/${dup.body.id}`)).expect(204);
    for (const i of await getItems(sourceId)) {
      await asA(
        request(app).delete(`/api/plans/${sourceId}/items/${i.id}`),
      ).expect(204);
    }
  });
});

describe("promote", () => {
  it("promotes a tentative plan and keeps the old degree plan as a backup", async () => {
    const oldDegreeId = await degreePlanId(USER_A);
    const created = await asA(request(app).post("/api/plans"))
      .send({ name: "Better plan" })
      .expect(201);

    const promoted = await asA(
      request(app).post(`/api/plans/${created.body.id}/promote`),
    ).expect(200);
    expect(promoted.body.planType).toBe("degree");

    const list = await asA(request(app).get("/api/plans")).expect(200);
    const plans = list.body.plans as any[];
    expect(plans.filter((p) => p.planType === "degree")).toHaveLength(1);
    expect(plans.find((p) => p.planType === "degree").id).toBe(created.body.id);
    const backup = plans.find((p) => p.id === oldDegreeId);
    expect(backup).toBeDefined();
    expect(backup.planType).toBe("tentative");
    expect(backup.name).toMatch(/previous/i);
  });

  it("rejects promoting the plan that is already the degree plan", async () => {
    const id = await degreePlanId(USER_A);
    await asA(request(app).post(`/api/plans/${id}/promote`)).expect(400);
  });
});

describe("items: validation and duplicates", () => {
  it("rejects invalid academic year and term", async () => {
    const id = await degreePlanId(USER_A);
    await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C1, term: "fall", academicYear: 1999 })
      .expect(400);
    await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C1, term: "fall", academicYear: 2026.5 })
      .expect(400);
    await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C1, term: "autumn", academicYear: 2026 })
      .expect(400);
  });

  it("rejects unknown catalog courses", async () => {
    const id = await degreePlanId(USER_A);
    await asA(request(app).post(`/api/plans/${id}/items`))
      .send({
        itemType: "course",
        courseCode: "ZZZZ 9999",
        term: "fall",
        academicYear: 2026,
      })
      .expect(400);
  });

  it("returns 409 for a duplicate course unless allowDuplicate is set", async () => {
    const id = await degreePlanId(USER_A);
    await addCourse(id, C1);
    const dup = await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C1, term: "winter", academicYear: 2026 })
      .expect(409);
    expect(dup.body.duplicate).toBe(true);
    await asA(request(app).post(`/api/plans/${id}/items`))
      .send({
        itemType: "course",
        courseCode: C1,
        term: "winter",
        academicYear: 2026,
        allowDuplicate: true,
      })
      .expect(201);
    for (const i of await getItems(id)) {
      await asA(request(app).delete(`/api/plans/${id}/items/${i.id}`)).expect(204);
    }
  });

  it("rejects invalid position on move", async () => {
    const id = await degreePlanId(USER_A);
    const item = await addCourse(id, C1);
    await asA(request(app).patch(`/api/plans/${id}/items/${item.id}`))
      .send({ position: -1 })
      .expect(400);
    await asA(request(app).patch(`/api/plans/${id}/items/${item.id}`))
      .send({ position: 1.5 })
      .expect(400);
    await asA(request(app).delete(`/api/plans/${id}/items/${item.id}`)).expect(204);
  });
});

describe("items: moves reindex both terms contiguously", () => {
  it("keeps positions 0..n-1 in source and target terms after a cross-term move", async () => {
    const id = await degreePlanId(USER_A);
    // Fall: C1, C2, C3 — Winter: placeholder.
    const f1 = await addCourse(id, C1, "fall");
    const f2 = await addCourse(id, C2, "fall");
    const f3 = await addCourse(id, C3, "fall");
    const w1 = await asA(request(app).post(`/api/plans/${id}/items`))
      .send({
        itemType: "requirement_placeholder",
        requirementLabel: "Any Religion course",
        term: "winter",
        academicYear: 2026,
      })
      .expect(201);
    expect([f1.position, f2.position, f3.position]).toEqual([0, 1, 2]);

    // Move the middle fall item to winter at position 0.
    const moved = await asA(request(app).patch(`/api/plans/${id}/items/${f2.id}`))
      .send({ term: "winter", academicYear: 2026, position: 0 })
      .expect(200);
    expect(moved.body.term).toBe("winter");
    expect(moved.body.position).toBe(0);

    const items = await getItems(id);
    const fall = items
      .filter((i) => i.term === "fall")
      .sort((a, b) => a.position - b.position);
    const winter = items
      .filter((i) => i.term === "winter")
      .sort((a, b) => a.position - b.position);
    // Source term closed the gap: contiguous 0..n-1, order preserved.
    expect(fall.map((i) => [i.id, i.position])).toEqual([
      [f1.id, 0],
      [f3.id, 1],
    ]);
    // Target term reindexed with the moved item inserted at 0.
    expect(winter.map((i) => [i.id, i.position])).toEqual([
      [f2.id, 0],
      [w1.body.id, 1],
    ]);

    // Reorder within a term also stays contiguous.
    await asA(request(app).patch(`/api/plans/${id}/items/${f1.id}`))
      .send({ position: 99 })
      .expect(200);
    const after = (await getItems(id))
      .filter((i) => i.term === "fall")
      .sort((a, b) => a.position - b.position);
    expect(after.map((i) => [i.id, i.position])).toEqual([
      [f3.id, 0],
      [f1.id, 1],
    ]);

    for (const i of await getItems(id)) {
      await asA(request(app).delete(`/api/plans/${id}/items/${i.id}`)).expect(204);
    }
  });
});

describe("completed-before-plan bucket", () => {
  it("keeps completion provenance when copying or duplicating a plan", async () => {
    const degreeId = await degreePlanId(USER_A);
    await asA(request(app).post(`/api/plans/${degreeId}/items`))
      .send({
        itemType: "course",
        courseCode: C1,
        term: "fall",
        academicYear: 2026,
        bucket: "completed",
        completionSource: "transfer_credit",
        provenance: "student_asserted",
      })
      .expect(201);

    const copied = await asA(request(app).post("/api/plans"))
      .send({ name: "Copied provenance", copyFromPlanId: degreeId })
      .expect(201);
    const duplicated = await asA(
      request(app).post(`/api/plans/${copied.body.id}/duplicate`),
    )
      .send({ name: "Duplicated provenance" })
      .expect(201);

    for (const planId of [copied.body.id, duplicated.body.id]) {
      const completed = (await getItems(planId)).find(
        (item) => item.courseCode === C1 && item.bucket === "completed",
      );
      expect(completed?.completionSource).toBe("transfer_credit");
      expect(completed?.provenance).toBe("student_asserted");
    }
  });
  it("accepts every explicit student-asserted provenance without changing another user's plan", async () => {
    const aId = await degreePlanId(USER_A);
    const bId = await degreePlanId(USER_B);
    const sources = [
      "prior_to_scu",
      "transfer_credit",
      "ap_ib_test_credit",
      "previously_completed_scu",
      "other_institution",
      "manually_marked",
    ];
    const codes = [C1, C2, C3];
    for (const [index, source] of sources.entries()) {
      const created = await asA(request(app).post(`/api/plans/${aId}/items`))
        .send({
          itemType: "course",
          courseCode: codes[index % codes.length],
          term: "fall",
          academicYear: 2026,
          bucket: "completed",
          completionSource: source,
          allowDuplicate: true,
        })
        .expect(201);
      expect(created.body.completionSource).toBe(source);
    }
    expect((await getItems(bId, USER_B)).filter((item) => item.bucket === "completed")).toHaveLength(0);
    for (const item of await getItems(aId)) {
      await asA(request(app).delete(`/api/plans/${aId}/items/${item.id}`)).expect(204);
    }
  });
  it("requires a valid completion source and rejects sources on planned items", async () => {
    const id = await degreePlanId(USER_A);
    await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C1, term: "fall", academicYear: 2026, bucket: "completed" })
      .expect(400);
    await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C1, term: "fall", academicYear: 2026, bucket: "completed", completionSource: "made_up" })
      .expect(400);
    await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C1, term: "fall", academicYear: 2026, completionSource: "transfer_credit" })
      .expect(400);
  });

  it("adds, moves to a term (clearing provenance), and marks completed again", async () => {
    const id = await degreePlanId(USER_A);
    const created = await asA(request(app).post(`/api/plans/${id}/items`))
      .send({
        itemType: "course",
        courseCode: C1,
        term: "fall",
        academicYear: 2026,
        bucket: "completed",
        completionSource: "ap_ib_test_credit",
      })
      .expect(201);
    expect(created.body.bucket).toBe("completed");
    expect(created.body.completionSource).toBe("ap_ib_test_credit");

    // Move into a real term: becomes planned, provenance cleared.
    const planned = await asA(request(app).patch(`/api/plans/${id}/items/${created.body.id}`))
      .send({ bucket: "planned", term: "winter", academicYear: 2027 })
      .expect(200);
    expect(planned.body.bucket).toBe("planned");
    expect(planned.body.completionSource).toBeNull();
    expect(planned.body.term).toBe("winter");

    // Mark completed again with a different source.
    const back = await asA(request(app).patch(`/api/plans/${id}/items/${created.body.id}`))
      .send({ bucket: "completed", completionSource: "manually_marked" })
      .expect(200);
    expect(back.body.bucket).toBe("completed");
    expect(back.body.completionSource).toBe("manually_marked");

    // Moving to completed without any source fails validation on a planned item.
    const other = await addCourse(id, C2, "spring", 2027);
    await asA(request(app).patch(`/api/plans/${id}/items/${other.id}`))
      .send({ bucket: "completed" })
      .expect(400);

    for (const i of await getItems(id)) {
      await asA(request(app).delete(`/api/plans/${id}/items/${i.id}`)).expect(204);
    }
  });

  it("keeps the completed group and term groups reindexed independently", async () => {
    const id = await degreePlanId(USER_A);
    const c1 = await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C1, term: "fall", academicYear: 2026, bucket: "completed", completionSource: "transfer_credit" })
      .expect(201);
    const c2 = await asA(request(app).post(`/api/plans/${id}/items`))
      .send({ itemType: "course", courseCode: C2, term: "fall", academicYear: 2026, bucket: "completed", completionSource: "prior_to_scu" })
      .expect(201);
    expect([c1.body.position, c2.body.position]).toEqual([0, 1]);

    const f1 = await addCourse(id, C3, "fall", 2026);
    // Planned fall group starts at 0 independently of the completed group.
    expect(f1.position).toBe(0);

    // Move planned item into completed at position 0; completed reindexes.
    await asA(request(app).patch(`/api/plans/${id}/items/${f1.id}`))
      .send({ bucket: "completed", completionSource: "manually_marked", position: 0 })
      .expect(200);
    const completed = (await getItems(id))
      .filter((i) => i.bucket === "completed")
      .sort((a, b) => a.position - b.position);
    expect(completed.map((i) => [i.id, i.position])).toEqual([
      [f1.id, 0],
      [c1.body.id, 1],
      [c2.body.id, 2],
    ]);

    for (const i of await getItems(id)) {
      await asA(request(app).delete(`/api/plans/${id}/items/${i.id}`)).expect(204);
    }
  });
});

describe("placeholder replace", () => {
  it("swaps a placeholder for a course in place, keeping the requirement link", async () => {
    const id = await degreePlanId(USER_A);
    const ph = await asA(request(app).post(`/api/plans/${id}/items`))
      .send({
        itemType: "requirement_placeholder",
        requirementLabel: "Core elective",
        requirementCategory: "Core",
        term: "spring",
        academicYear: 2027,
      })
      .expect(201);
    const replaced = await asA(
      request(app).post(`/api/plans/${id}/items/${ph.body.id}/replace`),
    )
      .send({ courseCode: C1 })
      .expect(200);
    expect(replaced.body.itemType).toBe("course");
    expect(replaced.body.courseCode).toBe(C1);
    expect(replaced.body.requirementLabel).toBe("Core elective");
    expect(replaced.body.id).toBe(ph.body.id);
    expect(replaced.body.term).toBe("spring");

    // A course item cannot be "replaced".
    await asA(
      request(app).post(`/api/plans/${id}/items/${ph.body.id}/replace`),
    )
      .send({ courseCode: C2 })
      .expect(400);

    await asA(request(app).delete(`/api/plans/${id}/items/${ph.body.id}`)).expect(204);
  });
});
