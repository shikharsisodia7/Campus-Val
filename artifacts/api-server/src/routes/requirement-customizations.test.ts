/**
 * Planning customizations of the requirements sidebar.
 *
 * What these protect:
 *  - the source requirement is never changed by a student edit, and an edit can
 *    never make a requirement count as complete;
 *  - edits are scoped to one plan (Degree Plan vs each Tentative plan);
 *  - only the plan owner can read or change them (server-side, by plan id);
 *  - duplicating a plan copies them independently; deleting a plan leaves none;
 *  - a source requirement that changed after an edit is flagged, not silently
 *    overwritten.
 *
 * Auth is stubbed (x-test-user); everything else is the real routes and the
 * real database, with throwaway users cleaned up afterwards.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { eq, inArray, sql } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

const { db, academicPlansTable, planItemsTable, studentProfilesTable, requirementCustomizationsTable } = await import("@workspace/db");
const plansRouter = (await import("./plans")).default;
const customizationsRouter = (await import("./requirement-customizations")).default;
const requirementsRouter = (await import("./requirements")).default;
const { buildRequirementsResponse } = await import("./requirements");
const { COURSES } = await import("../data/courses");

const app = express();
app.use(express.json());
app.use("/api", plansRouter);
app.use("/api", customizationsRouter);
app.use("/api", requirementsRouter);

const RUN = Date.now();
const USER_A = `test-reqcust-a-${RUN}`;
const USER_B = `test-reqcust-b-${RUN}`;
const USERS = [USER_A, USER_B];
const as = (user: string, r: request.Test) => r.set("x-test-user", user);

async function profileFor(userId: string) {
  await db.insert(studentProfilesTable).values({
    userId,
    name: "Requirements Test",
    studentType: "undergraduate",
    college: "School of Engineering",
    major: "CSE",
    startTerm: "fall",
    startYear: 2024,
    expectedGradTerm: "spring",
    expectedGradYear: 2028,
    currentTerm: "fall",
    currentYear: 2026,
  });
}

async function cleanup() {
  const plans = await db.select({ id: academicPlansTable.id }).from(academicPlansTable).where(inArray(academicPlansTable.userId, USERS));
  const ids = plans.map((p) => p.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db.delete(academicPlansTable).where(inArray(academicPlansTable.id, ids));
  }
  await db.delete(studentProfilesTable).where(inArray(studentProfilesTable.userId, USERS));
}

async function degreePlanId(user: string): Promise<number> {
  const res = await as(user, request(app).get("/api/plans")).expect(200);
  return res.body.plans.find((p: any) => p.planType === "degree").id;
}
const view = async (user: string, planId: number) => (await as(user, request(app).get(`/api/plans/${planId}/requirements`)).expect(200)).body;
const findByKey = (body: any, key: string) => body.groups.flatMap((g: any) => g.items).find((i: any) => i.stableKey === key);
const rowsOf = (planId: number) => db.select().from(requirementCustomizationsTable).where(eq(requirementCustomizationsTable.planId, planId));

let planA: number;
let sourceKey: string;
let sourceLabel: string;
let majorGroupKey: string;

beforeAll(async () => {
  await cleanup();
  await profileFor(USER_A);
  await profileFor(USER_B);
  planA = await degreePlanId(USER_A);
  const body = await view(USER_A, planA);
  const major = body.groups.find((g: any) => g.kind === "major");
  majorGroupKey = major.stableKey;
  sourceKey = major.items[0].stableKey;
  sourceLabel = major.items[0].label;
});
afterAll(cleanup);

describe("the plan's requirements view", () => {
  it("is the same content as the sidebar always was, plus stable keys", async () => {
    const body = await view(USER_A, planA);
    const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, USER_A));
    const direct = buildRequirementsResponse(profile!, [], [], [], [], null);
    const stripped = body.groups.map((g: any) => ({
      ...g,
      stableKey: undefined,
      items: g.items.map((i: any) => ({ ...i, stableKey: undefined })),
    }));
    expect(JSON.parse(JSON.stringify(stripped))).toEqual(JSON.parse(JSON.stringify(direct.groups)));
    expect(body.customizations.summary).toEqual({ edited: 0, hidden: 0, custom: 0, sourceChanged: 0, orphaned: 0 });
    expect(body.requirementsSource.policyDecided).toBe(false);
    expect(body.requirementsSource.label).not.toMatch(/official/i);
  });

  it("gives every group and item a unique, stable key that survives regeneration", async () => {
    const a = await view(USER_A, planA);
    const b = await view(USER_A, planA);
    const keys = a.groups.flatMap((g: any) => [g.stableKey, ...g.items.map((i: any) => i.stableKey)]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(a.groups.map((g: any) => g.stableKey)).toEqual(b.groups.map((g: any) => g.stableKey));
  });

  it("requires sign-in", async () => {
    await request(app).get(`/api/plans/${planA}/requirements`).expect(401);
  });
});

describe("editing a source requirement", () => {
  it("renames and annotates it; the original stays available and completion is untouched", async () => {
    const before = findByKey(await view(USER_A, planA), sourceKey);
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`))
      .send({ sourceKey, title: "  My   version  ", note: "Advisor said take it early" })
      .expect(200);
    const item = findByKey(await view(USER_A, planA), sourceKey);
    expect(item.label).toBe("My version");
    expect(item.customization).toMatchObject({
      kind: "edit",
      titleEdited: true,
      note: "Advisor said take it early",
      originalLabel: sourceLabel,
      sourceChanged: false,
    });
    for (const field of ["status", "complete", "courses", "satisfiedBy", "plannedBy", "autoTracked", "description"]) {
      expect(item[field], field).toEqual(before[field]);
    }
  });

  it("does not touch the source: another plan and another user still see the original", async () => {
    const other = await as(USER_A, request(app).post("/api/plans").send({ name: "Elsewhere" })).expect(201);
    expect(findByKey(await view(USER_A, other.body.id), sourceKey).label).toBe(sourceLabel);
    expect(findByKey(await view(USER_B, await degreePlanId(USER_B)), sourceKey).label).toBe(sourceLabel);
  });

  it("clears a field with null and removes the row when nothing is left", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: null }).expect(200);
    expect(findByKey(await view(USER_A, planA), sourceKey).label).toBe(sourceLabel);
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, note: null }).expect(200);
    expect(await rowsOf(planA)).toHaveLength(0);
  });

  it("treats typing the source label back as no edit", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: sourceLabel }).expect(200);
    expect(await rowsOf(planA)).toHaveLength(0);
  });

  it("hides and restores without deleting the source requirement", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, hidden: true }).expect(200);
    const hidden = findByKey(await view(USER_A, planA), sourceKey);
    expect(hidden).toBeTruthy(); // still returned, so it can be restored
    expect(hidden.customization.hidden).toBe(true);
    expect(hidden.label).toBe(sourceLabel);
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, hidden: false }).expect(200);
    expect(findByKey(await view(USER_A, planA), sourceKey).customization).toBeUndefined();
  });

  it("resets one requirement to the source", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: "Temp" }).expect(200);
    await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ sourceKey }).expect(200);
    expect(findByKey(await view(USER_A, planA), sourceKey).label).toBe(sourceLabel);
    expect(await rowsOf(planA)).toHaveLength(0);
  });

  it("rejects a key that is not in this plan's sidebar, and bad input", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey: "major:nothing#x", title: "x" }).expect(404);
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ title: "x" }).expect(400);
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: "x".repeat(400) }).expect(400);
    await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).expect(400);
  });

  it("stores plain text only", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`))
      .send({ sourceKey, note: "line one\u0000\u0007\nline two" })
      .expect(200);
    const [row] = await rowsOf(planA);
    expect(row!.note).toBe("line one \nline two");
    await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ all: true }).expect(200);
  });
});

describe("custom requirements", () => {
  it("adds, edits and deletes the student's own requirement, always open and marked custom", async () => {
    await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`))
      .send({ groupKey: majorGroupKey, title: "Honors thesis", note: "Talk to Dr. X" })
      .expect(201);
    let group = (await view(USER_A, planA)).groups.find((g: any) => g.stableKey === majorGroupKey);
    const custom = group.items.find((i: any) => i.customization?.kind === "custom");
    expect(custom).toMatchObject({ label: "Honors thesis", status: "open", complete: false, courses: [], autoTracked: false });
    expect(custom.customization).toMatchObject({ note: "Talk to Dr. X", done: false });
    const customId = custom.id.replace(/^custom-/, "");

    await as(USER_A, request(app).patch(`/api/plans/${planA}/custom-requirements/${customId}`)).send({ done: true, title: "Honors thesis 2" }).expect(200);
    group = (await view(USER_A, planA)).groups.find((g: any) => g.stableKey === majorGroupKey);
    const edited = group.items.find((i: any) => i.id === custom.id);
    expect(edited).toMatchObject({ label: "Honors thesis 2", status: "open", complete: false });
    expect(edited.customization.done).toBe(true);

    await as(USER_A, request(app).delete(`/api/plans/${planA}/custom-requirements/${customId}`)).expect(200);
    expect((await view(USER_A, planA)).customizations.summary.custom).toBe(0);
  });

  it("rejects an unknown group and an empty title", async () => {
    await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: "major:nope", title: "x" }).expect(404);
    await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: majorGroupKey, title: "   " }).expect(400);
  });
});

describe("custom requirement courses and order", () => {
  it("keeps catalog course shortcuts on a custom requirement without ever making it planned or complete", async () => {
    const [c1, c2] = COURSES.slice(0, 2).map((c) => c.code);
    await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`))
      .send({ groupKey: majorGroupKey, title: "Pick one", courseCodes: [c1!.toLowerCase(), c2, c1] })
      .expect(201);
    const group = (await view(USER_A, planA)).groups.find((g: any) => g.stableKey === majorGroupKey);
    const item = group.items.find((i: any) => i.label === "Pick one");
    expect(item.courses).toEqual([c1, c2]);
    expect(item).toMatchObject({ status: "open", complete: false, satisfiedBy: [], plannedBy: [] });
    await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ all: true }).expect(200);
  });

  it("refuses a course that is not in the catalog, or too many", async () => {
    await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: majorGroupKey, title: "x", courseCodes: ["ZZZZ 999"] }).expect(400);
    const many = COURSES.slice(0, 9).map((c) => c.code);
    await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: majorGroupKey, title: "x", courseCodes: many }).expect(400);
  });

  it("reorders own requirements within a group, and only inside the group", async () => {
    for (const t of ["First", "Second", "Third"]) {
      await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: majorGroupKey, title: t }).expect(201);
    }
    const titles = async () => (await view(USER_A, planA)).groups.find((g: any) => g.stableKey === majorGroupKey).items.filter((i: any) => i.customization?.kind === "custom");
    const list = await titles();
    expect(list.map((i: any) => i.label)).toEqual(["First", "Second", "Third"]);
    const id = (i: any) => i.id.replace(/^custom-/, "");
    await as(USER_A, request(app).patch(`/api/plans/${planA}/custom-requirements/${id(list[2])}`)).send({ move: "up" }).expect(200);
    expect((await titles()).map((i: any) => i.label)).toEqual(["First", "Third", "Second"]);
    await as(USER_A, request(app).patch(`/api/plans/${planA}/custom-requirements/${id(list[0])}`)).send({ move: "up" }).expect(200);
    expect((await titles()).map((i: any) => i.label)).toEqual(["First", "Third", "Second"]);
    await as(USER_A, request(app).patch(`/api/plans/${planA}/custom-requirements/${id(list[0])}`)).send({ move: "down" }).expect(200);
    expect((await titles()).map((i: any) => i.label)).toEqual(["Third", "First", "Second"]);
    await as(USER_B, request(app).patch(`/api/plans/${planA}/custom-requirements/${id(list[0])}`)).send({ move: "down" }).expect(404);
    await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ all: true }).expect(200);
  });
});

describe("who can change them", () => {
  it("keeps every route owner-only, by plan id, with the user taken from sign-in", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: "Private" }).expect(200);
    await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: majorGroupKey, title: "Mine" }).expect(201);
    const [custom] = (await rowsOf(planA)).filter((r) => r.entryType === "custom");

    // User B: nothing readable, creatable, changeable or removable on A's plan.
    await as(USER_B, request(app).get(`/api/plans/${planA}/requirements`)).expect(404);
    await as(USER_B, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: "Hijack" }).expect(404);
    await as(USER_B, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: majorGroupKey, title: "Hijack" }).expect(404);
    await as(USER_B, request(app).patch(`/api/plans/${planA}/custom-requirements/${custom!.targetKey}`)).send({ title: "Hijack" }).expect(404);
    await as(USER_B, request(app).delete(`/api/plans/${planA}/custom-requirements/${custom!.targetKey}`)).expect(404);
    await as(USER_B, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ all: true }).expect(404);
    await as(USER_B, request(app).post(`/api/plans/${planA}/requirement-customizations/resolve`)).send({ all: true, action: "use_source" }).expect(404);

    // A spoofed user id in the body is ignored: the row belongs to the signed-in user.
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, note: "n", userId: USER_B, planId: 1 }).expect(200);
    for (const row of await rowsOf(planA)) {
      expect(row.userId).toBe(USER_A);
      expect(row.updatedBy).toBe(USER_A);
    }
    // Nothing changed for A.
    expect(findByKey(await view(USER_A, planA), sourceKey).label).toBe("Private");
    await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ all: true }).expect(200);
  });

  it("requires sign-in on every route", async () => {
    await request(app).put(`/api/plans/${planA}/requirement-customizations`).send({ sourceKey, title: "x" }).expect(401);
    await request(app).delete(`/api/plans/${planA}/requirement-customizations`).query({ all: true }).expect(401);
    await request(app).post(`/api/plans/${planA}/custom-requirements`).send({ groupKey: majorGroupKey, title: "x" }).expect(401);
  });
});

describe("plans", () => {
  it("keeps the Degree Plan and each Tentative plan independent", async () => {
    const t1 = (await as(USER_A, request(app).post("/api/plans").send({ name: "T1" })).expect(201)).body.id;
    const t2 = (await as(USER_A, request(app).post("/api/plans").send({ name: "T2" })).expect(201)).body.id;
    await as(USER_A, request(app).put(`/api/plans/${t1}/requirement-customizations`)).send({ sourceKey, title: "Only T1" }).expect(200);
    expect(findByKey(await view(USER_A, t1), sourceKey).label).toBe("Only T1");
    expect(findByKey(await view(USER_A, t2), sourceKey).label).toBe(sourceLabel);
    expect(findByKey(await view(USER_A, planA), sourceKey).label).toBe(sourceLabel);
  });

  it("copies customizations into a duplicate, independently", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: "Original edit", note: "n1" }).expect(200);
    await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: majorGroupKey, title: "Custom one" }).expect(201);
    const dup = (await as(USER_A, request(app).post(`/api/plans/${planA}/duplicate`).send({ name: "Copy" })).expect(201)).body.id;
    const copied = await view(USER_A, dup);
    expect(findByKey(copied, sourceKey).label).toBe("Original edit");
    expect(copied.customizations.summary).toMatchObject({ edited: 1, custom: 1 });

    await as(USER_A, request(app).put(`/api/plans/${dup}/requirement-customizations`)).send({ sourceKey, title: "Changed in copy" }).expect(200);
    await as(USER_A, request(app).delete(`/api/plans/${dup}/requirement-customizations`)).query({ all: true }).expect(200);
    const original = await view(USER_A, planA);
    expect(findByKey(original, sourceKey).label).toBe("Original edit");
    expect(original.customizations.summary).toMatchObject({ edited: 1, custom: 1 });
  });

  it("copies them when a tentative plan is created from another", async () => {
    const created = (await as(USER_A, request(app).post("/api/plans").send({ name: "From degree", copyFromPlanId: planA })).expect(201)).body.id;
    expect((await view(USER_A, created)).customizations.summary).toMatchObject({ edited: 1, custom: 1 });
  });

  it("leaves no rows behind when a tentative plan is deleted", async () => {
    const dup = (await as(USER_A, request(app).post(`/api/plans/${planA}/duplicate`).send({ name: "Doomed" })).expect(201)).body.id;
    expect((await rowsOf(dup)).length).toBeGreaterThan(0);
    await as(USER_A, request(app).delete(`/api/plans/${dup}`)).expect(204);
    expect(await rowsOf(dup)).toHaveLength(0);
  });

  it("keeps them with the plan when it is promoted to the Degree Plan", async () => {
    const t = (await as(USER_A, request(app).post("/api/plans").send({ name: "Promote me" })).expect(201)).body.id;
    await as(USER_A, request(app).put(`/api/plans/${t}/requirement-customizations`)).send({ sourceKey, title: "Promoted title" }).expect(200);
    await as(USER_A, request(app).post(`/api/plans/${t}/promote`)).expect(200);
    expect(findByKey(await view(USER_A, t), sourceKey).label).toBe("Promoted title");
    // put things back for later tests
    planA = t;
    await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ all: true }).expect(200);
  });
});

describe("when the source changes after an edit", () => {
  it("shows the updated source, does not apply the old edit, and lets the student decide", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: "My label v1", note: "Planning note" }).expect(200);
    // Simulate the source moving on to a new version: the fingerprint recorded at edit time no longer matches.
    await db
      .update(requirementCustomizationsTable)
      .set({ baseFingerprint: "0000000000000000v1old000", baseSourceVersion: "2024-25 Bulletin" })
      .where(eq(requirementCustomizationsTable.planId, planA));

    const stale = findByKey(await view(USER_A, planA), sourceKey);
    expect(stale.label).toBe(sourceLabel); // updated source, not the old edit
    expect(stale.customization).toMatchObject({ sourceChanged: true, titleEdited: false, title: "My label v1", sourceVersionAtEdit: "2024-25 Bulletin" });
    expect((await view(USER_A, planA)).customizations.summary.sourceChanged).toBe(1);

    await as(USER_A, request(app).post(`/api/plans/${planA}/requirement-customizations/resolve`)).send({ sourceKey, action: "keep_mine" }).expect(200);
    const kept = findByKey(await view(USER_A, planA), sourceKey);
    expect(kept.label).toBe("My label v1");
    expect(kept.customization.sourceChanged).toBe(false);

    await db.update(requirementCustomizationsTable).set({ baseFingerprint: "0000000000000000v1old000" }).where(eq(requirementCustomizationsTable.planId, planA));
    await as(USER_A, request(app).post(`/api/plans/${planA}/requirement-customizations/resolve`)).send({ all: true, action: "use_source" }).expect(200);
    expect(findByKey(await view(USER_A, planA), sourceKey).customization).toBeUndefined();
    expect(await rowsOf(planA)).toHaveLength(0);
  });

  it("does not resolve another user's customization", async () => {
    await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: "Keep" }).expect(200);
    await as(USER_B, request(app).post(`/api/plans/${planA}/requirement-customizations/resolve`)).send({ sourceKey, action: "use_source" }).expect(404);
    expect(await rowsOf(planA)).toHaveLength(1);
    await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ all: true }).expect(200);
  });

  it("lists edits whose requirement is no longer in the sidebar, and lets them be removed", async () => {
    await db.insert(requirementCustomizationsTable).values({
      planId: planA,
      userId: USER_A,
      entryType: "source_edit",
      targetKey: `${majorGroupKey}#a-course-that-no-longer-exists`,
      title: "Ghost",
      baseFingerprint: "x",
      baseSourceType: "current_bulletin",
      updatedBy: USER_A,
    });
    await db.insert(requirementCustomizationsTable).values({
      planId: planA,
      userId: USER_A,
      entryType: "source_edit",
      targetKey: "major:a-program-not-in-plan#x",
      title: "Other program",
      baseFingerprint: "x",
      baseSourceType: "current_bulletin",
      updatedBy: USER_A,
    });
    const body = await view(USER_A, planA);
    expect(body.customizations.orphaned.map((o: any) => o.reason).sort()).toEqual(["program_not_in_plan", "requirement_not_in_source"]);
    for (const o of body.customizations.orphaned) {
      await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ sourceKey: o.targetKey }).expect(200);
    }
    expect((await view(USER_A, planA)).customizations.summary.orphaned).toBe(0);
  });
});

describe("a plan with more than ten planned courses", () => {
  it("counts all of them when marking requirements planned", async () => {
    const body = await view(USER_A, planA);
    const major = body.groups.find((g: any) => g.kind === "major");
    const codes: string[] = major.items.slice(0, 14).map((i: any) => i.courses[0]).filter(Boolean);
    expect(codes.length).toBeGreaterThan(11);
    for (const [index, code] of codes.entries()) {
      await as(USER_A, request(app).post(`/api/plans/${planA}/items`))
        .send({ itemType: "course", courseCode: code, academicYear: 2026 + Math.floor(index / 4), term: ["fall", "winter", "spring", "summer"][index % 4] })
        .expect(201);
    }
    const after = await view(USER_A, planA);
    const plannedAfter = after.groups.find((g: any) => g.kind === "major").items.slice(0, 14);
    expect(plannedAfter.filter((i: any) => i.status === "planned").length).toBe(codes.length);
    // The stand-alone GET /requirements agrees now that it also takes them all.
    const legacy = await as(USER_A, request(app).get("/api/requirements")).query({ plannedCourses: codes.join(",") }).expect(200);
    const legacyPlanned = legacy.body.groups.find((g: any) => g.kind === "major").items.slice(0, 14);
    expect(legacyPlanned.filter((i: any) => i.status === "planned").length).toBe(codes.length);
  });
});

describe("before migration 0005 has been applied", () => {
  it("still serves the requirements and duplicates plans; edits say they are not available yet", async () => {
    await db.execute(sql`ALTER TABLE requirement_customizations RENAME TO requirement_customizations_off`);
    try {
      const body = await view(USER_A, planA);
      expect(body.groups.length).toBeGreaterThan(2);
      expect(body.customizations.summary).toEqual({ edited: 0, hidden: 0, custom: 0, sourceChanged: 0, orphaned: 0 });

      const write = await as(USER_A, request(app).put(`/api/plans/${planA}/requirement-customizations`)).send({ sourceKey, title: "x" }).expect(503);
      expect(write.body.error).toMatch(/aren.t available yet/);
      await as(USER_A, request(app).post(`/api/plans/${planA}/custom-requirements`)).send({ groupKey: majorGroupKey, title: "x" }).expect(503);
      await as(USER_A, request(app).delete(`/api/plans/${planA}/requirement-customizations`)).query({ all: true }).expect(503);

      // The plan itself is untouched, and copying it does not fail.
      const dup = await as(USER_A, request(app).post(`/api/plans/${planA}/duplicate`).send({ name: "Pre-migration copy" })).expect(201);
      await as(USER_A, request(app).delete(`/api/plans/${dup.body.id}`)).expect(204);
    } finally {
      await db.execute(sql`ALTER TABLE requirement_customizations_off RENAME TO requirement_customizations`);
    }
  });
});
