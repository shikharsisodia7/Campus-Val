/**
 * Checksheet -> Planning transfer: the student's My Note carries where it came from.
 *
 * The transfer itself IS the ordinary My Note / Custom Requirement save (one implementation);
 * these tests protect what is extra: provenance that cannot be forged, notes that outlive
 * their source document, plan scoping, independent copies, and privacy of the documents.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    req.userEmail = `${userId}@scu.edu`;
    next();
  },
}));

const {
  db,
  academicPlansTable,
  planItemsTable,
  studentProfilesTable,
  requirementCustomizationsTable,
  degreeChecksheetDocumentsTable,
  departmentRequirementNotesTable,
  departmentRequirementOverridesTable,
  departmentAuditLogTable,
} = await import("@workspace/db");
const plansRouter = (await import("./plans")).default;
const customizationsRouter = (await import("./requirement-customizations")).default;
const checksheetsRouter = (await import("./degree-checksheets")).default;

const app = express();
app.use(express.json());
app.use("/api", plansRouter);
app.use("/api", customizationsRouter);
app.use("/api", checksheetsRouter);

const RUN = Date.now();
const A = `test-note-src-a-${RUN}`;
const B = `test-note-src-b-${RUN}`;
const as = (user: string, r: request.Test) => r.set("x-test-user", user);

async function profileFor(userId: string) {
  await db.insert(studentProfilesTable).values({
    userId,
    name: "Transfer Test",
    studentType: "undergraduate",
    college: "College of Arts and Sciences",
    major: "BIOL",
    startTerm: "fall",
    startYear: 2025,
    expectedGradTerm: "spring",
    expectedGradYear: 2029,
    currentTerm: "fall",
    currentYear: 2026,
  });
}
async function documentFor(userId: string, title: string) {
  const [row] = await db
    .insert(degreeChecksheetDocumentsTable)
    .values({
      userId,
      title,
      originalFilename: "x.pdf",
      fileSize: 1,
      mimeType: "application/pdf",
      sourceFormat: "pdf",
      fileHash: `hash-${userId}-${title}`,
      objectPath: `/objects/test/${userId}/${title}`,
    })
    .returning();
  return row!;
}
const view = async (user: string, planId: number) => (await as(user, request(app).get(`/api/plans/${planId}/requirements`)).expect(200)).body;
const find = (body: any, key: string) => body.groups.flatMap((g: any) => g.items).find((i: any) => i.stableKey === key);

async function cleanup() {
  const plans = await db.select({ id: academicPlansTable.id }).from(academicPlansTable).where(inArray(academicPlansTable.userId, [A, B]));
  const ids = plans.map((p) => p.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db.delete(academicPlansTable).where(inArray(academicPlansTable.id, ids));
  }
  await db.delete(degreeChecksheetDocumentsTable).where(inArray(degreeChecksheetDocumentsTable.userId, [A, B]));
  await db.delete(studentProfilesTable).where(inArray(studentProfilesTable.userId, [A, B]));
}

let degree: number;
let tentativeA: number;
let tentativeB: number;
let key: string;
let groupKey: string;
let docA: Awaited<ReturnType<typeof documentFor>>;
let docB: Awaited<ReturnType<typeof documentFor>>;

beforeAll(async () => {
  await cleanup();
  await profileFor(A);
  await profileFor(B);
  degree = (await as(A, request(app).get("/api/plans")).expect(200)).body.plans.find((p: any) => p.planType === "degree").id;
  tentativeA = (await as(A, request(app).post("/api/plans")).send({ name: "Scenario A" }).expect(201)).body.id;
  tentativeB = (await as(A, request(app).post("/api/plans")).send({ name: "Scenario B" }).expect(201)).body.id;
  const major = (await view(A, degree)).groups.find((g: any) => g.kind === "major");
  groupKey = major.stableKey;
  key = major.items[0].stableKey;
  docA = await documentFor(A, "Biology Checksheet");
  docB = await documentFor(B, "Someone else's checksheet");
});
afterAll(cleanup);

describe("a private checksheet never becomes department guidance", () => {
  it("A's upload and transfer write only A's own My Note: no Department Note, override or audit row, and nothing in B's view", async () => {
    const count = async () => ({
      notes: (await db.select({ id: departmentRequirementNotesTable.id }).from(departmentRequirementNotesTable)).length,
      overrides: (await db.select({ id: departmentRequirementOverridesTable.id }).from(departmentRequirementOverridesTable)).length,
      audit: (await db.select({ id: departmentAuditLogTable.id }).from(departmentAuditLogTable)).length,
    });
    const degreeB = (await as(B, request(app).get("/api/plans")).expect(200)).body.plans.find((p: any) => p.planType === "degree").id;
    const before = await count();
    const bBefore = find(await view(B, degreeB), key);

    const upload = await documentFor(A, "Private Biology checksheet (synthetic)");
    await as(A, request(app).put(`/api/plans/${degree}/requirement-customizations`))
      .send({ sourceKey: key, note: "Department says take in Fall (from my checksheet)", noteSource: { type: "DEGREE_CHECKSHEET", documentId: upload.id, anchor: "Sheet1!A1" } })
      .expect(200);

    expect(await count()).toEqual(before);
    // A sees it as a My Note with its private source, never as a Department Note.
    const mine = find(await view(A, degree), key);
    expect(mine.customization.note).toContain("from my checksheet");
    expect(JSON.stringify(mine.departmentNotes ?? [])).not.toContain("from my checksheet");
    // B's requirement is exactly what it was.
    expect(find(await view(B, degreeB), key)).toEqual(bBefore);

    await as(A, request(app).put(`/api/plans/${degree}/requirement-customizations`)).send({ sourceKey: key, note: null }).expect(200);
    await db.delete(degreeChecksheetDocumentsTable).where(eq(degreeChecksheetDocumentsTable.id, upload.id));
  });
});

describe("a note transferred from a Degree Checksheet", () => {
  it("is the student's own My Note, with where it came from, on the selected plan only", async () => {
    await as(A, request(app).put(`/api/plans/${tentativeA}/requirement-customizations`))
      .send({ sourceKey: key, note: "From the checksheet: take in Fall", noteSource: { type: "DEGREE_CHECKSHEET", documentId: docA.id, anchor: "Biology!row 40" } })
      .expect(200);
    const item = find(await view(A, tentativeA), key);
    expect(item.customization.note).toBe("From the checksheet: take in Fall");
    expect(item.customization.noteSource).toEqual({ type: "DEGREE_CHECKSHEET", label: "Biology Checksheet", anchor: "Biology!row 40", documentAvailable: true });
    // Never a Department Note.
    expect(item.departmentNotes ?? []).toEqual([]);
    // Plan isolation: the Degree Plan and the other Tentative Degree Plan are untouched.
    expect(find(await view(A, degree), key).customization).toBeUndefined();
    expect(find(await view(A, tentativeB), key).customization).toBeUndefined();
  });

  it("takes its label from the document, never from the request, and refuses someone else's document", async () => {
    await as(A, request(app).put(`/api/plans/${degree}/requirement-customizations`))
      .send({ sourceKey: key, note: "mine", noteSource: { type: "DEGREE_CHECKSHEET", documentId: docB.id } })
      .expect(400);
    await as(A, request(app).put(`/api/plans/${degree}/requirement-customizations`))
      .send({ sourceKey: key, note: "mine", noteSource: { type: "DEGREE_CHECKSHEET", documentId: 99999999 } })
      .expect(400);
    await as(A, request(app).put(`/api/plans/${degree}/requirement-customizations`))
      .send({ sourceKey: key, note: "mine", noteSource: { type: "APR", documentId: docA.id } })
      .expect(400);
    // A forged label field is not a field at all.
    await as(A, request(app).put(`/api/plans/${degree}/requirement-customizations`))
      .send({ sourceKey: key, note: "mine", noteSource: { type: "DEGREE_CHECKSHEET", documentId: docA.id, label: "Official SCU Document" } })
      .expect(200);
    expect(find(await view(A, degree), key).customization.noteSource.label).toBe("Biology Checksheet");
    await as(A, request(app).delete(`/api/plans/${degree}/requirement-customizations?all=true`)).expect(200);
  });

  it("another student cannot write a note onto this plan, and cannot see this student's document", async () => {
    await as(B, request(app).put(`/api/plans/${tentativeA}/requirement-customizations`))
      .send({ sourceKey: key, note: "hijack", noteSource: { type: "DEGREE_CHECKSHEET", documentId: docB.id } })
      .expect(404);
    await as(B, request(app).get(`/api/plans/${tentativeA}/requirements`)).expect(404);
    await as(B, request(app).get(`/api/degree-checksheets/${docA.id}`)).expect((r) => expect([403, 404]).toContain(r.status));
    const list = (await as(B, request(app).get("/api/degree-checksheets")).expect(200)).body.documents;
    expect(JSON.stringify(list)).not.toContain("Biology Checksheet");
  });

  it("stays when the source document is replaced, and when it is deleted (saying its source is gone)", async () => {
    await db.update(degreeChecksheetDocumentsTable).set({ sourceVersion: 2, fileHash: "replaced" }).where(eq(degreeChecksheetDocumentsTable.id, docA.id));
    let item = find(await view(A, tentativeA), key);
    expect(item.customization.note).toBe("From the checksheet: take in Fall");
    expect(item.customization.noteSource.documentAvailable).toBe(true);

    await db.delete(degreeChecksheetDocumentsTable).where(eq(degreeChecksheetDocumentsTable.id, docA.id));
    item = find(await view(A, tentativeA), key);
    expect(item.customization.note).toBe("From the checksheet: take in Fall");
    expect(item.customization.noteSource).toMatchObject({ label: "Biology Checksheet", documentAvailable: false });
    docA = await documentFor(A, "Biology Checksheet");
  });

  it("copies into a duplicated Tentative Degree Plan as an independent note, provenance included", async () => {
    const copy = (await as(A, request(app).post(`/api/plans/${tentativeA}/duplicate`)).send({ name: "Copy of A" }).expect(201)).body.id;
    const item = find(await view(A, copy), key);
    expect(item.customization.note).toBe("From the checksheet: take in Fall");
    expect(item.customization.noteSource.label).toBe("Biology Checksheet");
    await as(A, request(app).put(`/api/plans/${copy}/requirement-customizations`)).send({ sourceKey: key, note: "changed in the copy" }).expect(200);
    expect(find(await view(A, tentativeA), key).customization.note).toBe("From the checksheet: take in Fall");
  });

  it("clearing the note clears where it came from", async () => {
    await as(A, request(app).put(`/api/plans/${tentativeA}/requirement-customizations`)).send({ sourceKey: key, note: null }).expect(200);
    expect(find(await view(A, tentativeA), key).customization).toBeUndefined();
    expect(await db.select().from(requirementCustomizationsTable).where(eq(requirementCustomizationsTable.planId, tentativeA))).toHaveLength(0);
  });

  it("can become a Custom Requirement of the student's own, marked as theirs and never Bulletin-sourced", async () => {
    await as(A, request(app).post(`/api/plans/${tentativeB}/custom-requirements`))
      .send({ groupKey, title: "Meet the department advisor", note: "Checksheet says to see the advisor", noteSource: { type: "DEGREE_CHECKSHEET", documentId: docA.id, anchor: "Biology!row 3" } })
      .expect(201);
    const custom = (await view(A, tentativeB)).groups.find((g: any) => g.stableKey === groupKey).items.find((i: any) => i.customization?.kind === "custom");
    expect(custom).toMatchObject({ label: "Meet the department advisor", status: "open", complete: false, courses: [] });
    expect(custom.customization.noteSource.label).toBe("Biology Checksheet");
    expect(custom.stableKey).toContain("#custom:");
    // Not in the other plans.
    expect((await view(A, degree)).groups.flatMap((g: any) => g.items).some((i: any) => i.customization?.kind === "custom")).toBe(false);
  });
});
