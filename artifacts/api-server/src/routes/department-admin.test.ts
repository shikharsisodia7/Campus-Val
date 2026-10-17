/**
 * The department layer: Department Notes, global overrides, program-scoped
 * administration, the audit trail, and how they sit under a student's own edits.
 *
 * What these protect:
 *  - a student can never reach the admin API, never edit a Department Note, and
 *    a client-supplied role/program/user changes nothing (identity is the
 *    verified address, scope is a database row);
 *  - a department admin can maintain exactly their own programs: Biology cannot
 *    touch Finance, a spoofed program or requirement key reaches nothing, and the
 *    shared Core is super-admin only;
 *  - Bulletin -> department -> student precedence: department changes reach every
 *    plan, a student's My Note / hide survive them, "reset to Bulletin" restores
 *    the Bulletin exactly, and the Bulletin source is never written;
 *  - every global change is audited with its before and after.
 *
 * Auth is stubbed (x-test-user / x-test-email); the routes and database are real.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import request from "supertest";
import { eq, inArray, like } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    req.userEmail = req.header("x-test-email") ?? `${userId}@scu.edu`;
    next();
  },
}));

const RUN = Date.now();
const SUPER = `super-${RUN}@scu.edu`;
process.env.ADMIN_EMAILS = SUPER;

const {
  db,
  academicPlansTable,
  planItemsTable,
  studentProfilesTable,
  requirementCustomizationsTable,
  departmentCanonicalResourcesTable,
  departmentRequirementNotesTable,
  departmentRequirementOverridesTable,
  departmentAuditLogTable,
  programAdminScopesTable,
  samplePlansTable,
} = await import("@workspace/db");
const plansRouter = (await import("./plans")).default;
const customizationsRouter = (await import("./requirement-customizations")).default;
const departmentRouter = (await import("./department-admin")).default;
const samplePlansRouter = (await import("./sample-plans")).default;
const { listPrograms, programTree } = await import("../lib/department/programs");
const { importSamplePlan, isPublicSamplePlan } = await import("../lib/sample-plans/service");
const { cleanNoteBody } = await import("../lib/department/service");

const app = express();
app.use(express.json());
app.use("/api", plansRouter);
app.use("/api", customizationsRouter);
app.use("/api", departmentRouter);
app.use("/api", samplePlansRouter);

const STUDENT = `test-dept-student-${RUN}`;
const OTHER_STUDENT = `test-dept-other-${RUN}`;
/** Another Arts and Sciences major: the same University Core, a different department. */
const CAS_STUDENT = `test-dept-cas-${RUN}`;
const BIO_ADMIN = `bio-admin-${RUN}@scu.edu`;
const FIN_ADMIN = `fin-admin-${RUN}@scu.edu`;
const PLAIN = `plain-${RUN}@scu.edu`;

const as = (user: string, email: string | null, r: request.Test) => {
  const t = r.set("x-test-user", user);
  return email ? t.set("x-test-email", email) : t;
};
const asStudent = (r: request.Test) => as(STUDENT, null, r);
const asBio = (r: request.Test) => as("bio-user", BIO_ADMIN, r);
const asFin = (r: request.Test) => as("fin-user", FIN_ADMIN, r);
const asSuper = (r: request.Test) => as("super-user", SUPER, r);

const biology = listPrograms().find((p) => p.type === "major" && p.title === "Biology")!;
const finance = listPrograms().find((p) => p.type === "major" && /finance/i.test(p.title))!;
const otherCasMajor = listPrograms().find((p) => p.type === "major" && p.college === "CAS" && p.programKey !== biology.programKey)!;
const bioTree = programTree(biology.programKey)!;
const bioGroup = bioTree.tree.find((g) => g.stableKey === biology.programKey)!;
const bioItem = bioGroup.items[0]!;
const bioItem2 = bioGroup.items[1]!;
const coreGroup = bioTree.tree.find((g) => g.group.kind === "university_core")!;
const coreItem = coreGroup.items[0]!;
const marker = `dept-test-${RUN}`;

let studentPlan: number;
let otherPlan: number;
let casPlan: number;

const view = async (user: string, planId: number) =>
  (await as(user, null, request(app).get(`/api/plans/${planId}/requirements`)).expect(200)).body;
const find = (body: any, key: string) => body.groups.flatMap((g: any) => g.items).find((i: any) => i.stableKey === key);
const groupOf = (body: any, key: string) => body.groups.find((g: any) => g.stableKey === key);

async function cleanup() {
  const plans = await db.select({ id: academicPlansTable.id }).from(academicPlansTable).where(inArray(academicPlansTable.userId, [STUDENT, OTHER_STUDENT, CAS_STUDENT]));
  const ids = plans.map((p) => p.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db.delete(academicPlansTable).where(inArray(academicPlansTable.id, ids));
  }
  await db.delete(studentProfilesTable).where(inArray(studentProfilesTable.userId, [STUDENT, OTHER_STUDENT, CAS_STUDENT]));
  await db.delete(departmentRequirementNotesTable).where(like(departmentRequirementNotesTable.createdBy, `%-${RUN}@scu.edu`));
  await db.delete(departmentRequirementNotesTable).where(like(departmentRequirementNotesTable.createdBy, `super-${RUN}%`));
  await db.delete(departmentCanonicalResourcesTable).where(like(departmentCanonicalResourcesTable.createdBy, `super-${RUN}%`));
  await db.delete(departmentRequirementOverridesTable).where(like(departmentRequirementOverridesTable.createdBy, `%-${RUN}@scu.edu`));
  await db.delete(departmentAuditLogTable).where(like(departmentAuditLogTable.actorEmail, `%-${RUN}@scu.edu`));
  await db.delete(programAdminScopesTable).where(like(programAdminScopesTable.email, `%-${RUN}@scu.edu`));
  await db.delete(samplePlansTable).where(like(samplePlansTable.slug, `test-${RUN}-%`));
}

async function profileFor(userId: string, major = biology.code) {
  await db.insert(studentProfilesTable).values({
    userId,
    name: "Dept Test",
    studentType: "undergraduate",
    college: "College of Arts and Sciences",
    major,
    startTerm: "fall",
    startYear: 2025,
    expectedGradTerm: "spring",
    expectedGradYear: 2029,
    currentTerm: "fall",
    currentYear: 2026,
  });
}

beforeAll(async () => {
  await cleanup();
  await profileFor(STUDENT);
  await profileFor(OTHER_STUDENT);
  const mine = await asStudent(request(app).get("/api/plans")).expect(200);
  studentPlan = mine.body.plans.find((p: any) => p.planType === "degree").id;
  const theirs = await as(OTHER_STUDENT, null, request(app).get("/api/plans")).expect(200);
  otherPlan = theirs.body.plans.find((p: any) => p.planType === "degree").id;
  await profileFor(CAS_STUDENT, otherCasMajor.code);
  const cas = await as(CAS_STUDENT, null, request(app).get("/api/plans")).expect(200);
  casPlan = cas.body.plans.find((p: any) => p.planType === "degree").id;
  // Scopes are database rows, granted by a super admin through the API.
  await asSuper(request(app).post("/api/admin/department/scopes")).send({ email: BIO_ADMIN, programKey: biology.programKey }).expect(201);
  await asSuper(request(app).post("/api/admin/department/scopes")).send({ email: FIN_ADMIN, programKey: finance.programKey }).expect(201);
});
afterAll(cleanup);

describe("who can reach the admin API", () => {
  it("rejects a signed-out request and a plain student", async () => {
    await request(app).get("/api/admin/department/me").expect(401);
    await as("plain-user", PLAIN, request(app).get("/api/admin/department/me")).expect(403);
    await as("plain-user", PLAIN, request(app).post("/api/admin/department/notes")).send({ programKey: biology.programKey, targetKey: bioItem.stableKey, body: "x" }).expect(403);
    await as("plain-user", PLAIN, request(app).put("/api/admin/department/overrides")).send({ targetKey: bioItem.stableKey, hidden: true }).expect(403);
    await as("plain-user", PLAIN, request(app).get("/api/admin/department/sample-plans")).expect(403);
  });

  it("ignores a role, program or email the client claims", async () => {
    const res = await as("plain-user", PLAIN, request(app).post("/api/admin/department/notes"))
      .set("x-role", "department_admin")
      .send({ programKey: biology.programKey, targetKey: bioItem.stableKey, body: "I am an admin", role: "department_admin", email: BIO_ADMIN });
    expect(res.status).toBe(403);
  });

  it("shows a department admin only their own programs", async () => {
    const bio = (await asBio(request(app).get("/api/admin/department/programs")).expect(200)).body.programs;
    expect(bio.map((p: any) => p.programKey)).toEqual([biology.programKey]);
    const all = (await asSuper(request(app).get("/api/admin/department/programs")).expect(200)).body.programs;
    expect(all.length).toBeGreaterThan(100);
    const me = (await asBio(request(app).get("/api/admin/department/me")).expect(200)).body;
    expect(me.superAdmin).toBe(false);
    expect(me.programKeys).toEqual([biology.programKey]);
  });

  it("lets only a super admin grant scopes", async () => {
    await asBio(request(app).post("/api/admin/department/scopes")).send({ email: PLAIN, programKey: biology.programKey }).expect(403);
    await asBio(request(app).get("/api/admin/department/scopes")).expect(403);
    await asSuper(request(app).post("/api/admin/department/scopes")).send({ email: PLAIN, programKey: "major:not-a-program" }).expect(404);
  });
});

describe("program scoping", () => {
  it("lets Biology edit Biology and refuses Finance, in both directions", async () => {
    const mine = await asBio(request(app).post("/api/admin/department/notes"))
      .send({ programKey: biology.programKey, targetKey: bioItem.stableKey, body: `${marker} biology note`, status: "published" });
    expect(mine.status).toBe(201);
    expect(mine.body).toMatchObject({ sourceType: "admin_entry", provenanceStatus: "department_admin" });
    const finTree = programTree(finance.programKey)!;
    const finItem = finTree.tree.find((g) => g.stableKey === finance.programKey)!.items[0]!;
    await asBio(request(app).post("/api/admin/department/notes")).send({ programKey: finance.programKey, targetKey: finItem.stableKey, body: "x" }).expect(403);
    await asBio(request(app).put("/api/admin/department/overrides")).send({ targetKey: finItem.stableKey, hidden: true }).expect(403);
    await asBio(request(app).get(`/api/admin/department/programs/${encodeURIComponent(finance.programKey)}`)).expect(403);
    await asFin(request(app).post("/api/admin/department/notes")).send({ programKey: biology.programKey, targetKey: bioItem.stableKey, body: "x" }).expect(403);
    await asFin(request(app).put("/api/admin/department/overrides")).send({ targetKey: bioItem.stableKey, hidden: true }).expect(403);
    // Finance can edit Finance.
    await asFin(request(app).post("/api/admin/department/notes")).send({ programKey: finance.programKey, targetKey: finItem.stableKey, body: `${marker} finance note` }).expect(201);
  });

  it("rejects a spoofed program or requirement key", async () => {
    await asBio(request(app).post("/api/admin/department/notes")).send({ programKey: "major:made-up", targetKey: null, body: "x" }).expect(403);
    await asSuper(request(app).post("/api/admin/department/notes")).send({ programKey: "major:made-up", targetKey: null, body: "x" }).expect(404);
    // A real program with a requirement that is not in its tree.
    await asBio(request(app).post("/api/admin/department/notes")).send({ programKey: biology.programKey, targetKey: "major:biology#no-such-item", body: "x" }).expect(400);
    // An item of another program's tree filed under Biology.
    const other = programTree(finance.programKey)!.tree.find((g) => g.stableKey === finance.programKey)!.items[0]!;
    await asBio(request(app).post("/api/admin/department/notes")).send({ programKey: biology.programKey, targetKey: other.stableKey, body: "x" }).expect(400);
    // A note's program is the note's own, never the request's.
    const note = await db.select().from(departmentRequirementNotesTable).where(like(departmentRequirementNotesTable.body, `${marker} finance%`));
    await asBio(request(app).patch(`/api/admin/department/notes/${note[0]!.id}`)).send({ body: "hijack" }).expect(403);
  });

  it("keeps the shared Core to super admins, while a department may note a Core requirement for its own program", async () => {
    await asBio(request(app).put("/api/admin/department/overrides")).send({ targetKey: coreItem.stableKey, hidden: true }).expect(403);
    await asBio(request(app).post("/api/admin/department/requirements")).send({ groupKey: coreGroup.stableKey, title: "x" }).expect(403);
    const note = await asBio(request(app).post("/api/admin/department/notes"))
      .send({ programKey: biology.programKey, targetKey: coreItem.stableKey, body: `${marker} core note`, status: "published" });
    expect(note.status).toBe(201);
    await asSuper(request(app).delete(`/api/admin/department/overrides/99999999`)).expect(404);
  });
});

describe("canonical department resources", () => {
  it("requires super-admin-controlled source provenance and withdraws linked global notes when archived", async () => {
    const resourceBody = {
      programKey: biology.programKey,
      documentTitle: `${marker} Biology requirements checklist`,
      sourceFileName: `${marker}-biology.xlsx`,
      sourceUrl: "https://www.scu.edu/biology/checklists/biology.xlsx",
      academicYear: "2026-27",
      documentVersion: "2026.1",
    };
    await asBio(request(app).post("/api/admin/department/canonical-resources")).send(resourceBody).expect(403);
    await asSuper(request(app).post("/api/admin/department/canonical-resources"))
      .send({ ...resourceBody, sourceUrl: "file:///student-private.xlsx" })
      .expect(400);

    const created = await asSuper(request(app).post("/api/admin/department/canonical-resources")).send(resourceBody).expect(201);
    expect(created.body).toMatchObject({
      programKey: biology.programKey,
      programType: "major",
      school: "CAS",
      provenanceStatus: "documented",
      reviewStatus: "pending",
      publicationStatus: "draft",
    });
    // The registry derives the owning school from CampusVal's program data;
    // it is not a CAS-only importer assumption.
    const engineering = listPrograms().find((program) => program.type === "major" && program.college === "SOE")!;
    for (const [program, school] of [[finance, "LSB"], [engineering, "SOE"]] as const) {
      const row = await asSuper(request(app).post("/api/admin/department/canonical-resources"))
        .send({
          programKey: program.programKey,
          documentTitle: `${marker} ${school} canonical checklist`,
          sourceFileName: `${marker}-${school.toLowerCase()}.xlsx`,
          sourceUrl: `https://www.scu.edu/${school.toLowerCase()}/checklist.xlsx`,
          academicYear: "2026-27",
          documentVersion: "2026.1",
        })
        .expect(201);
      expect(row.body).toMatchObject({ programKey: program.programKey, school });
    }
    await asFin(request(app).get(`/api/admin/department/canonical-resources?programKey=${encodeURIComponent(biology.programKey)}`)).expect(403);
    const visibleToBio = await asBio(request(app).get(`/api/admin/department/canonical-resources?programKey=${encodeURIComponent(biology.programKey)}`)).expect(200);
    expect(visibleToBio.body.resources.map((row: any) => row.id)).toContain(created.body.id);

    await asSuper(request(app).patch(`/api/admin/department/canonical-resources/${created.body.id}`)).send({ provenanceStatus: "verified" }).expect(200);
    await asSuper(request(app).patch(`/api/admin/department/canonical-resources/${created.body.id}`)).send({ reviewStatus: "approved" }).expect(200);
    const published = await asSuper(request(app).patch(`/api/admin/department/canonical-resources/${created.body.id}`)).send({ publicationStatus: "published" }).expect(200);
    expect(published.body).toMatchObject({ provenanceStatus: "verified", reviewStatus: "approved", publicationStatus: "published" });

    const body = `${marker} canonical global note`;
    await db.insert(departmentRequirementNotesTable).values({
      programKey: biology.programKey,
      programType: "major",
      targetKey: bioItem.stableKey,
      bulletinEdition: "2026-27",
      body,
      status: "published",
      origin: "imported",
      sourceType: "canonical_resource",
      canonicalResourceId: created.body.id,
      sourceLabel: resourceBody.documentTitle,
      sourceUrl: resourceBody.sourceUrl,
      sourceAcademicYear: resourceBody.academicYear,
      sourceDocumentVersion: resourceBody.documentVersion,
      provenanceStatus: "verified",
      sourceReference: "Biology!D40",
      importKey: `test-canonical:${RUN}`,
      createdBy: SUPER,
      updatedBy: SUPER,
    });
    expect(find(await view(STUDENT, studentPlan), bioItem.stableKey).departmentNotes.map((note: any) => note.body)).toContain(body);

    const changedSource = await asSuper(request(app).patch(`/api/admin/department/canonical-resources/${created.body.id}`))
      .send({ sourceUrl: "https://www.scu.edu/biology/checklists/biology-2026-2.xlsx", documentVersion: "2026.2", publicationStatus: "published" })
      .expect(200);
    expect(changedSource.body).toMatchObject({
      sourceUrl: "https://www.scu.edu/biology/checklists/biology-2026-2.xlsx",
      documentVersion: "2026.2",
      provenanceStatus: "documented",
      reviewStatus: "pending",
      publicationStatus: "draft",
      reviewedBy: null,
      publishedBy: null,
    });
    expect((find(await view(STUDENT, studentPlan), bioItem.stableKey).departmentNotes ?? []).map((note: any) => note.body)).not.toContain(body);

    await asSuper(request(app).patch(`/api/admin/department/canonical-resources/${created.body.id}`)).send({ publicationStatus: "archived" }).expect(200);
    expect((find(await view(STUDENT, studentPlan), bioItem.stableKey).departmentNotes ?? []).map((note: any) => note.body)).not.toContain(body);
  });
});

describe("Department Notes beside a student's My Note", () => {
  it("shows a published note to a student with Biology, read-only, apart from their own note", async () => {
    const before = await view(STUDENT, studentPlan);
    const item = find(before, bioItem.stableKey);
    expect(item.departmentNotes.map((n: any) => n.body)).toEqual([`${marker} biology note`]);
    expect(item.departmentNotes[0].programTitle).toBe("Biology");
    expect(item.departmentNotes[0].origin).toBe("admin");
    expect(item.departmentNotes[0].reviewed).toBe(true);
    expect(item.customization).toBeUndefined();
    // The Core note shows on the shared Core item for a Biology plan only.
    expect(find(before, coreItem.stableKey).departmentNotes.map((n: any) => n.body)).toContain(`${marker} core note`);

    await asStudent(request(app).put(`/api/plans/${studentPlan}/requirement-customizations`)).send({ sourceKey: bioItem.stableKey, note: "ask my advisor" }).expect(200);
    const after = await view(STUDENT, studentPlan);
    const merged = find(after, bioItem.stableKey);
    expect(merged.customization.note).toBe("ask my advisor");
    expect(merged.departmentNotes.map((n: any) => n.body)).toEqual([`${marker} biology note`]);
  });

  it("keeps a department's Core note on the Core requirement, under Core, and only for that department's students", async () => {
    const mine = await view(STUDENT, studentPlan);
    // Classification is the Bulletin's: the noted Core requirement stays in Core, never in the Biology major.
    expect(groupOf(mine, coreGroup.stableKey).items.map((i: any) => i.stableKey)).toContain(coreItem.stableKey);
    expect(groupOf(mine, biology.programKey).items.map((i: any) => i.stableKey)).not.toContain(coreItem.stableKey);
    expect(find(mine, coreItem.stableKey).departmentNotes.find((n: any) => n.body === `${marker} core note`).programTitle).toBe("Biology");
    // Another Arts and Sciences major sees the same Core requirement, without Biology's note.
    const theirs = await view(CAS_STUDENT, casPlan);
    const same = find(theirs, coreItem.stableKey);
    expect(same).toBeDefined();
    expect((same.departmentNotes ?? []).map((n: any) => n.body)).not.toContain(`${marker} core note`);
  });

  it("gives a student no way to write a Department Note", async () => {
    const note = (await db.select().from(departmentRequirementNotesTable).where(like(departmentRequirementNotesTable.body, `${marker} biology%`)))[0]!;
    await asStudent(request(app).patch(`/api/admin/department/notes/${note.id}`)).send({ body: "mine now", status: "archived" }).expect(403);
    await asStudent(request(app).post("/api/admin/department/notes")).send({ programKey: biology.programKey, targetKey: bioItem.stableKey, body: "mine" }).expect(403);
    const [still] = await db.select().from(departmentRequirementNotesTable).where(eq(departmentRequirementNotesTable.id, note.id));
    expect(still!.body).toBe(`${marker} biology note`);
  });

  it("updates for every plan while the student's own note stays", async () => {
    const note = (await db.select().from(departmentRequirementNotesTable).where(like(departmentRequirementNotesTable.body, `${marker} biology%`)))[0]!;
    await asBio(request(app).patch(`/api/admin/department/notes/${note.id}`)).send({ body: `${marker} biology note v2` }).expect(200);
    for (const [user, plan] of [[STUDENT, studentPlan], [OTHER_STUDENT, otherPlan]] as const) {
      expect(find(await view(user, plan), bioItem.stableKey).departmentNotes[0].body).toBe(`${marker} biology note v2`);
    }
    expect(find(await view(STUDENT, studentPlan), bioItem.stableKey).customization.note).toBe("ask my advisor");
    expect(find(await view(OTHER_STUDENT, otherPlan), bioItem.stableKey).customization).toBeUndefined();
  });

  it("does not show a draft, an unmapped or an archived note", async () => {
    const draft = await asBio(request(app).post("/api/admin/department/notes")).send({ programKey: biology.programKey, targetKey: bioItem2.stableKey, body: `${marker} draft` }).expect(201);
    expect(find(await view(STUDENT, studentPlan), bioItem2.stableKey).departmentNotes).toBeUndefined();
    await asBio(request(app).patch(`/api/admin/department/notes/${draft.body.id}`)).send({ status: "published" }).expect(200);
    expect(find(await view(STUDENT, studentPlan), bioItem2.stableKey).departmentNotes).toHaveLength(1);
    await asBio(request(app).patch(`/api/admin/department/notes/${draft.body.id}`)).send({ status: "archived" }).expect(200);
    expect(find(await view(STUDENT, studentPlan), bioItem2.stableKey).departmentNotes).toBeUndefined();
    // An unmapped imported note stays hidden until a person maps it, and cannot be published unmapped.
    const [unmapped] = await db
      .insert(departmentRequirementNotesTable)
      .values({ programKey: biology.programKey, programType: "major", targetKey: null, bulletinEdition: "2026-27", body: `${marker} unmapped`, status: "unmapped", origin: "imported", sourceType: "checklist", sourceAnchorText: "Theme", createdBy: `imp-${RUN}@scu.edu`, updatedBy: `imp-${RUN}@scu.edu` })
      .returning();
    await asBio(request(app).patch(`/api/admin/department/notes/${unmapped!.id}`)).send({ status: "published" }).expect(409);
    const mapped = await asBio(request(app).patch(`/api/admin/department/notes/${unmapped!.id}`)).send({ targetKey: bioItem2.stableKey }).expect(200);
    expect(mapped.body.status).toBe("draft");
  });

  it("does not show a Biology note to a plan without Biology", async () => {
    const [row] = await db.select().from(departmentRequirementNotesTable).where(like(departmentRequirementNotesTable.body, `${marker} biology%`));
    // A student whose plan is built around another major.
    const create = await asStudent(request(app).post("/api/plans")).send({ name: "Elsewhere" }).expect(201);
    await asStudent(request(app).patch(`/api/plans/${create.body.id}`)).send({ programs: { primaryMajor: finance.code, additionalMajors: [], minors: [], professionalGoals: [] } }).expect(200);
    const body = await view(STUDENT, create.body.id);
    expect(body.groups.some((g: any) => g.stableKey === biology.programKey)).toBe(false);
    const all = JSON.stringify(body);
    expect(all).not.toContain(row!.body);
  });

  it("stores note text as plain text and caps it", () => {
    expect(cleanNoteBody("a\u0000b\u0007c")).toBe("a b c");
    expect(cleanNoteBody("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
    expect(cleanNoteBody("x".repeat(5000)).length).toBe(1200);
    expect(() => cleanNoteBody("   ")).toThrow();
  });
});

describe("global overrides: Bulletin -> department -> student", () => {
  const retitle = `${marker} retitled`;

  it("retitles for everyone, keeps the Bulletin wording, and never touches status or courses", async () => {
    const before = find(await view(STUDENT, studentPlan), bioItem.stableKey);
    await asBio(request(app).put("/api/admin/department/overrides")).send({ targetKey: bioItem.stableKey, title: retitle }).expect(200);
    const after = find(await view(STUDENT, studentPlan), bioItem.stableKey);
    expect(after.label).toBe(retitle);
    expect(after.department).toMatchObject({ overridden: true, originalLabel: before.label, programTitle: "Biology" });
    expect(after.courses).toEqual(before.courses);
    expect(after.status).toBe(before.status);
    expect(after.complete).toBe(before.complete);
    expect(after.departmentNotes).toBeTruthy();
  });

  it("keeps a student's own edit on top of a department retitle, and keeps it anchored to the Bulletin", async () => {
    await asStudent(request(app).put(`/api/plans/${studentPlan}/requirement-customizations`)).send({ sourceKey: bioItem.stableKey, title: "my wording" }).expect(200);
    const item = find(await view(STUDENT, studentPlan), bioItem.stableKey);
    expect(item.label).toBe("my wording");
    expect(item.customization.sourceChanged).toBe(false);
    // Another student still sees the department's wording.
    expect(find(await view(OTHER_STUDENT, otherPlan), bioItem.stableKey).label).toBe(retitle);
    await asStudent(request(app).delete(`/api/plans/${studentPlan}/requirement-customizations?sourceKey=${encodeURIComponent(bioItem.stableKey)}`)).expect(200);
    // Student reset restores Bulletin + the department's configuration, not the raw Bulletin.
    expect(find(await view(STUDENT, studentPlan), bioItem.stableKey).label).toBe(retitle);
  });

  it("hides a requirement for everyone, recounts the group, and resets to the Bulletin exactly", async () => {
    const group0 = groupOf(await view(STUDENT, studentPlan), biology.programKey);
    await asBio(request(app).put("/api/admin/department/overrides")).send({ targetKey: bioItem2.stableKey, hidden: true }).expect(200);
    const hiddenView = await view(OTHER_STUDENT, otherPlan);
    expect(find(hiddenView, bioItem2.stableKey)).toBeUndefined();
    const group1 = groupOf(hiddenView, biology.programKey);
    expect(group1.items.length).toBe(group0.items.length - 1);
    expect(group1.autoTrackedCount).toBe(group0.autoTrackedCount - 1);
    // The admin tree still shows it, with its override, for reset.
    const admin = (await asBio(request(app).get(`/api/admin/department/programs/${encodeURIComponent(biology.programKey)}`)).expect(200)).body;
    const adminItem = admin.groups.find((g: any) => g.stableKey === biology.programKey).items.find((i: any) => i.stableKey === bioItem2.stableKey);
    expect(adminItem.override.hidden).toBe(true);
    expect(adminItem.label).toBe(bioItem2.item.label);
    await asBio(request(app).delete(`/api/admin/department/overrides/${adminItem.override.id}`)).expect(204);
    const restored = await view(OTHER_STUDENT, otherPlan);
    expect(find(restored, bioItem2.stableKey).label).toBe(bioItem2.item.label);
    expect(groupOf(restored, biology.programKey).items.length).toBe(group0.items.length);
  });

  it("adds a requirement the Bulletin does not list, marked as the department's", async () => {
    const added = await asBio(request(app).post("/api/admin/department/requirements")).send({ groupKey: biology.programKey, title: `${marker} added`, courseCodes: ["BIOL 1A"] }).expect(201);
    const item = find(await view(STUDENT, studentPlan), added.body.targetKey);
    expect(item.department).toMatchObject({ added: true, programTitle: "Biology" });
    expect(item.label).toBe(`${marker} added`);
    expect(item.courses).toEqual(["BIOL 1A"]);
    await asBio(request(app).post("/api/admin/department/requirements")).send({ groupKey: biology.programKey, title: "x", courseCodes: ["NOPE 999"] }).expect(400);
    // Reset removes it.
    const admin = (await asBio(request(app).get(`/api/admin/department/programs/${encodeURIComponent(biology.programKey)}`)).expect(200)).body;
    const row = admin.groups.find((g: any) => g.stableKey === biology.programKey).added[0];
    await asBio(request(app).delete(`/api/admin/department/overrides/${row.id}`)).expect(204);
    expect(find(await view(STUDENT, studentPlan), added.body.targetKey)).toBeUndefined();
  });

  it("lets a super admin override the shared Core, and never writes Bulletin data", async () => {
    const original = coreItem.item.label;
    await asSuper(request(app).put("/api/admin/department/overrides")).send({ targetKey: coreItem.stableKey, title: `${marker} core` }).expect(200);
    expect(find(await view(STUDENT, studentPlan), coreItem.stableKey).label).toBe(`${marker} core`);
    const [row] = await db.select().from(departmentRequirementOverridesTable).where(eq(departmentRequirementOverridesTable.targetKey, coreItem.stableKey));
    await asSuper(request(app).delete(`/api/admin/department/overrides/${row!.id}`)).expect(204);
    expect(find(await view(STUDENT, studentPlan), coreItem.stableKey).label).toBe(original);
    // The compiled Bulletin tree is the same object content as before any of this.
    expect(programTree(biology.programKey)!.tree.find((g) => g.group.kind === "university_core")!.items[0]!.item.label).toBe(original);
  });

  it("treats typing the Bulletin's own wording back as no override at all", async () => {
    const res = await asBio(request(app).put("/api/admin/department/overrides")).send({ targetKey: bioItem2.stableKey, title: bioItem2.item.label }).expect(200);
    expect(res.body.override).toBeNull();
    expect(await db.select().from(departmentRequirementOverridesTable).where(eq(departmentRequirementOverridesTable.targetKey, bioItem2.stableKey))).toHaveLength(0);
  });
});

describe("audit trail", () => {
  it("records who changed what, with the effective value before and after", async () => {
    await asBio(request(app).put("/api/admin/department/overrides")).send({ targetKey: bioItem2.stableKey, title: `${marker} audited` }).expect(200);
    const entries = (await asBio(request(app).get(`/api/admin/department/programs/${encodeURIComponent(biology.programKey)}/audit`)).expect(200)).body.entries;
    const mine = entries.find((e: any) => e.entity === "override" && e.targetKey === bioItem2.stableKey && e.action === "create");
    expect(mine.actor).toBe(BIO_ADMIN);
    expect(mine.before.title).toBe(bioItem2.item.label); // the Bulletin's own wording was the effective value
    expect(mine.after.title).toBe(`${marker} audited`);
    expect(entries.some((e: any) => e.entity === "note" && e.action.startsWith("create"))).toBe(true);
    await asFin(request(app).get(`/api/admin/department/programs/${encodeURIComponent(biology.programKey)}/audit`)).expect(403);
    const row = (await db.select().from(departmentRequirementOverridesTable).where(eq(departmentRequirementOverridesTable.targetKey, bioItem2.stableKey)))[0]!;
    await asBio(request(app).delete(`/api/admin/department/overrides/${row.id}`)).expect(204);
    const after = (await asBio(request(app).get(`/api/admin/department/programs/${encodeURIComponent(biology.programKey)}/audit`)).expect(200)).body.entries;
    expect(after.some((e: any) => e.action === "reset" && e.targetKey === bioItem2.stableKey)).toBe(true);
  });
});

describe("student isolation", () => {
  it("keeps one student's My Note and plan edits from another", async () => {
    await asStudent(request(app).put(`/api/plans/${studentPlan}/requirement-customizations`)).send({ sourceKey: bioItem.stableKey, note: "private" }).expect(200);
    await as(OTHER_STUDENT, null, request(app).put(`/api/plans/${studentPlan}/requirement-customizations`)).send({ sourceKey: bioItem.stableKey, note: "hijack" }).expect(404);
    await as(OTHER_STUDENT, null, request(app).get(`/api/plans/${studentPlan}/requirements`)).expect(404);
    const rows = await db.select().from(requirementCustomizationsTable).where(eq(requirementCustomizationsTable.planId, studentPlan));
    expect(rows.every((r) => r.userId === STUDENT)).toBe(true);
    expect(JSON.stringify(await view(OTHER_STUDENT, otherPlan))).not.toContain("private");
  });

  it("copies My Notes into a duplicated Tentative Degree Plan, independently", async () => {
    const copy = await asStudent(request(app).post(`/api/plans/${studentPlan}/duplicate`)).send({ name: "Copy" }).expect(201);
    expect(find(await view(STUDENT, copy.body.id), bioItem.stableKey).customization.note).toBe("private");
    await asStudent(request(app).put(`/api/plans/${copy.body.id}/requirement-customizations`)).send({ sourceKey: bioItem.stableKey, note: "changed in copy" }).expect(200);
    expect(find(await view(STUDENT, studentPlan), bioItem.stableKey).customization.note).toBe("private");
    // A new, unrelated Tentative Degree Plan starts clean.
    const blank = await asStudent(request(app).post("/api/plans")).send({ name: "Blank" }).expect(201);
    expect(find(await view(STUDENT, blank.body.id), bioItem.stableKey).customization).toBeUndefined();
  });
});

describe("sample plans", () => {
  const actor = { email: BIO_ADMIN, userId: "importer" };
  const slug = `test-${RUN}-bio`;
  let planId: number;
  const base = {
    slug,
    version: "2026-27",
    school: "CAS" as const,
    program: "Biology",
    programKey: biology.programKey,
    title: "First-year plan — Option One",
    planLength: "first_year" as const,
    academicYear: "2026-27",
    sourceType: "official_department" as const,
    sourceLabel: "Test source",
    sourceUrl: "https://example.test/plan",
    sourceReference: "Biology first-year plan, Option One",
    items: [
      { year: 1, term: "fall", itemType: "course" as const, courseCode: "BIOL 1A" },
      { year: 1, term: "fall", itemType: "placeholder" as const, label: "CTW 1" },
      { year: 1, term: "winter", itemType: "course" as const, courseCode: "ZZZZ 999" },
      { year: 1, term: "winter", itemType: "course" as const, courseCode: "BIOL 1A" },
      { year: 2, term: "spring", itemType: "course" as const, courseCode: "BIOL 1B", sourceTitle: "A different name" },
    ],
  };

  it("requires each canonical provenance field before treating a row as public", () => {
    const canonical = {
      status: "published",
      school: "CAS",
      program: "Biology",
      version: "2026-27",
      academicYear: "2026-27",
      sourceType: "official_department",
      sourceLabel: "SCU Biology first-year plan",
      sourceUrl: null,
      sourceReference: "Biology first-year plan, Option One",
      createdAt: new Date("2026-01-15T12:00:00.000Z"),
    } as const;
    expect(isPublicSamplePlan(canonical)).toBe(true);
    expect(isPublicSamplePlan({ ...canonical, academicYear: null })).toBe(true);
    expect(isPublicSamplePlan({ ...canonical, sourceUrl: "https://www.scu.edu/biology/plan.pdf", sourceReference: null })).toBe(true);
    expect(isPublicSamplePlan({ ...canonical, program: " " })).toBe(false);
    expect(isPublicSamplePlan({ ...canonical, version: " " })).toBe(false);
    expect(isPublicSamplePlan({ ...canonical, academicYear: " " })).toBe(false);
    expect(isPublicSamplePlan({ ...canonical, sourceLabel: " " })).toBe(false);
    expect(isPublicSamplePlan({ ...canonical, sourceReference: " " })).toBe(false);
    expect(isPublicSamplePlan({ ...canonical, sourceUrl: "not-a-url", sourceReference: "Biology first-year plan" })).toBe(false);
    expect(isPublicSamplePlan({ ...canonical, sourceType: "admin_entry" })).toBe(false);
    expect(isPublicSamplePlan({ ...canonical, createdAt: new Date("invalid") })).toBe(false);
  });

  it("lists only published plans, grouped by school and program, and validates against the catalog", async () => {
    const created = await importSamplePlan(actor, base, { publish: false });
    planId = created.id;
    expect(created.warnings.map((w) => w.code).sort()).toEqual(["course_not_in_catalog", "course_renamed", "duplicate_course"].sort());
    const hidden = (await asStudent(request(app).get("/api/sample-plans")).expect(200)).body;
    expect(JSON.stringify(hidden)).not.toContain(slug);
    await asStudent(request(app).get(`/api/sample-plans/${planId}`)).expect(404);
    await asBio(request(app).patch(`/api/admin/department/sample-plans/${planId}`)).send({ status: "published" }).expect(200);
    const list = (await asStudent(request(app).get("/api/sample-plans")).expect(200)).body;
    const cas = list.schools.find((s: any) => s.code === "CAS");
    expect(cas.name).toBe("College of Arts and Sciences");
    const publicPlan = cas.programs.find((p: any) => p.program === "Biology").plans.find((p: any) => p.slug === slug);
    expect(publicPlan).toMatchObject({ sourceType: "official_department", sourceReference: "Biology first-year plan, Option One", academicYear: "2026-27" });
    expect(publicPlan.importedAt).toEqual(expect.any(String));
  });

  it("fails closed for published rows without canonical provenance or a trusted source type", async () => {
    const incompleteSlug = `${slug}-incomplete`;
    await expect(
      importSamplePlan(
        actor,
        { ...base, slug: incompleteSlug, version: "2026-27-incomplete", sourceUrl: null, sourceReference: null },
        { publish: true },
      ),
    ).rejects.toThrow(/official source, program, version, and source URL or document reference/);

    const incomplete = await importSamplePlan(
      actor,
      { ...base, slug: incompleteSlug, version: "2026-27-incomplete", sourceUrl: null, sourceReference: null },
      { publish: false },
    );
    // Department publishing gives a useful error rather than creating a row
    // that looks public but cannot clear the student-facing provenance gate.
    await asBio(request(app).patch(`/api/admin/department/sample-plans/${incomplete.id}`)).send({ status: "published" }).expect(400);
    // A legacy/manual database change cannot bypass that gate either.
    await db.update(samplePlansTable).set({ status: "published" }).where(eq(samplePlansTable.id, incomplete.id));

    const adminEntry = await importSamplePlan(
      actor,
      { ...base, slug: `${slug}-admin-entry`, version: "2026-27-admin", sourceType: "admin_entry" },
      { publish: false },
    );
    await db.update(samplePlansTable).set({ status: "published" }).where(eq(samplePlansTable.id, adminEntry.id));

    const publicList = (await asStudent(request(app).get("/api/sample-plans")).expect(200)).body;
    expect(JSON.stringify(publicList)).not.toContain(incompleteSlug);
    expect(JSON.stringify(publicList)).not.toContain(`${slug}-admin-entry`);
    await asStudent(request(app).get(`/api/sample-plans/${incomplete.id}`)).expect(404);
    await asStudent(request(app).post(`/api/sample-plans/${incomplete.id}/load`)).send({}).expect(404);
    await asStudent(request(app).get(`/api/sample-plans/${adminEntry.id}`)).expect(404);
    await asStudent(request(app).post(`/api/sample-plans/${adminEntry.id}/load`)).send({}).expect(404);
  });

  it("keeps CampusVal-generated sequences out of every normal public or department-admin sample-plan route", async () => {
    const generatedSlug = `${slug}-generated`;
    const generated = await importSamplePlan(
      actor,
      {
        ...base,
        slug: generatedSlug,
        title: "Experimental generated sequence",
        sourceType: "campusval_generated",
        sourceLabel: "Generated by CampusVal for R&D only",
      },
      { publish: true },
    );

    const publicList = (await asStudent(request(app).get("/api/sample-plans")).expect(200)).body;
    expect(JSON.stringify(publicList)).not.toContain(generatedSlug);
    await asStudent(request(app).get(`/api/sample-plans/${generated.id}`)).expect(404);
    await asStudent(request(app).post(`/api/sample-plans/${generated.id}/load`)).send({}).expect(404);

    const normalAdminList = (await asSuper(request(app).get("/api/admin/department/sample-plans")).expect(200)).body;
    expect(JSON.stringify(normalAdminList)).not.toContain(generatedSlug);
    await asSuper(request(app).get("/api/admin/rnd/generated-sample-plans")).expect(404);
    await asSuper(request(app).patch(`/api/admin/department/sample-plans/${generated.id}`)).send({ status: "archived" }).expect(404);

    process.env.ENABLE_GENERATED_PLAN_RND = "true";
    try {
      const rndList = (await asSuper(request(app).get("/api/admin/rnd/generated-sample-plans")).expect(200)).body;
      expect(rndList.plans.some((p: any) => p.slug === generatedSlug && p.sourceType === "campusval_generated")).toBe(true);
      // A department admin is not implicitly an R&D admin just because they can maintain their own source-backed plans.
      await asBio(request(app).get("/api/admin/rnd/generated-sample-plans")).expect(404);
    } finally {
      delete process.env.ENABLE_GENERATED_PLAN_RND;
    }
  });

  it("previews with source and live warnings", async () => {
    const preview = (await asStudent(request(app).get(`/api/sample-plans/${planId}`)).expect(200)).body;
    expect(preview.sourceLabel).toBe("Test source");
    expect(preview.warnings.map((w: any) => w.code)).toContain("course_not_in_catalog");
    expect(preview.terms["1:fall"].map((t: any) => t.kind)).toEqual(["course", "placeholder"]);
  });

  it("limits who can publish: another department cannot, a student cannot", async () => {
    await asFin(request(app).patch(`/api/admin/department/sample-plans/${planId}`)).send({ status: "archived" }).expect(403);
    await asStudent(request(app).patch(`/api/admin/department/sample-plans/${planId}`)).send({ status: "archived" }).expect(403);
  });

  it("loads into a NEW Tentative Degree Plan by default, leaves the Degree Plan alone, and records provenance", async () => {
    const degreeBefore = (await asStudent(request(app).get(`/api/plans/${studentPlan}`)).expect(200)).body;
    const res = await asStudent(request(app).post(`/api/sample-plans/${planId}/load`)).send({}).expect(201);
    expect(res.body.plan.planType).toBe("tentative");
    expect(res.body.plan.metadata.sampleSource).toMatchObject({
      samplePlanId: planId,
      slug,
      version: "2026-27",
      program: "Biology",
      sourceType: "official_department",
      sourceLabel: "Test source",
      sourceReference: "Biology first-year plan, Option One",
      academicYear: "2026-27",
    });
    expect(res.body.plan.metadata.sampleSource.importedAt).toEqual(expect.any(String));
    expect(res.body.skippedDuplicates).toEqual(["BIOL 1A"]);
    expect(res.body.loadedAsPlaceholders).toEqual(["ZZZZ 999"]);
    expect(res.body.warnings.length).toBe(3);
    const items = (await asStudent(request(app).get(`/api/plans/${res.body.plan.id}`)).expect(200)).body.items;
    const bio1a = items.find((i: any) => i.courseCode === "BIOL 1A");
    expect(bio1a).toMatchObject({ term: "fall", academicYear: 2026, provenance: "sample_plan", itemType: "course" });
    expect(items.find((i: any) => i.courseCode === "BIOL 1B")).toMatchObject({ academicYear: 2027, term: "spring" });
    expect(items.find((i: any) => i.requirementLabel === "CTW 1").itemType).toBe("requirement_placeholder");
    expect(items.find((i: any) => /ZZZZ 999/.test(i.requirementLabel ?? "")).itemType).toBe("requirement_placeholder");
    const degreeAfter = (await asStudent(request(app).get(`/api/plans/${studentPlan}`)).expect(200)).body;
    expect(degreeAfter.items).toEqual(degreeBefore.items);
    expect(degreeAfter.metadata.sampleSource).toBeUndefined();
  });

  it("makes the loaded copy independent of the template and of later versions", async () => {
    const loaded = (await asStudent(request(app).post(`/api/sample-plans/${planId}/load`)).send({ name: "Mine" }).expect(201)).body.plan;
    const before = (await asStudent(request(app).get(`/api/plans/${loaded.id}`)).expect(200)).body.items;
    // A student edit does not reach the template.
    await asStudent(request(app).delete(`/api/plans/${loaded.id}/items/${before[0].id}`)).expect(204);
    const template = (await asStudent(request(app).get(`/api/sample-plans/${planId}`)).expect(200)).body;
    expect(template.terms["1:fall"]).toHaveLength(2);
    // A template change is a new version; a published template that differs is refused, and the copy is untouched.
    await expect(importSamplePlan(actor, { ...base, items: base.items.slice(0, 1) }, { publish: false })).rejects.toThrow(/new version/);
    await importSamplePlan(actor, { ...base, version: "2027-28", items: base.items.slice(0, 1) }, { publish: true });
    const after = (await asStudent(request(app).get(`/api/plans/${loaded.id}`)).expect(200)).body.items;
    expect(after.length).toBe(before.length - 1);
    // Archiving the template does not touch the copy either.
    await asBio(request(app).patch(`/api/admin/department/sample-plans/${planId}`)).send({ status: "archived" }).expect(200);
    expect((await asStudent(request(app).get(`/api/plans/${loaded.id}`)).expect(200)).body.items.length).toBe(after.length);
    await asStudent(request(app).get(`/api/sample-plans/${planId}`)).expect(404);
  });

  it("asks before adding to the Degree Plan, never adds to someone else's plan, and never removes anything", async () => {
    const v2 = (await db.select().from(samplePlansTable).where(eq(samplePlansTable.slug, slug))).find((p) => p.version === "2027-28")!;
    await asStudent(request(app).post(`/api/sample-plans/${v2.id}/load`)).send({ mode: "add_to_plan", targetPlanId: studentPlan }).expect(409);
    await asStudent(request(app).post(`/api/sample-plans/${v2.id}/load`)).send({ mode: "add_to_plan", targetPlanId: otherPlan }).expect(404);
    const res = await asStudent(request(app).post(`/api/sample-plans/${v2.id}/load`)).send({ mode: "add_to_plan", targetPlanId: studentPlan, confirmDegreePlan: true }).expect(201);
    expect(res.body.added).toBe(1);
    const again = await asStudent(request(app).post(`/api/sample-plans/${v2.id}/load`)).send({ mode: "add_to_plan", targetPlanId: studentPlan, confirmDegreePlan: true }).expect(201);
    expect(again.body.added).toBe(0);
    expect(again.body.skippedDuplicates).toEqual(["BIOL 1A"]);
  });
});

describe("provenance inspector", () => {
  const prov = (user: (r: request.Test) => request.Test, program: string, target: string) =>
    user(request(app).get(`/api/admin/department/programs/${encodeURIComponent(program)}/provenance?targetKey=${encodeURIComponent(target)}`));

  it("shows Base (Bulletin) and Department layers for a requirement, and says the student layer is private", async () => {
    const n = await asBio(request(app).post("/api/admin/department/notes")).send({ programKey: biology.programKey, targetKey: bioItem.stableKey, body: `${marker} prov`, status: "published" }).expect(201);
    await asBio(request(app).put("/api/admin/department/overrides")).send({ targetKey: bioItem.stableKey, title: `${marker} prov title` }).expect(200);
    const res = (await prov(asBio, biology.programKey, bioItem.stableKey).expect(200)).body;
    expect(res.base).toMatchObject({ source: "Bulletin", edition: "2026-27", category: "MAJOR", label: bioItem.item.label, fingerprint: bioItem.fingerprint });
    expect(res.base.sourceUrl).toMatch(/^https:\/\/www\.scu\.edu\/bulletin/);
    expect(res.department.override).toMatchObject({ title: `${marker} prov title`, hidden: false, bulletinChangedSince: false });
    expect(res.department.notes.map((x: any) => x.id)).toContain(n.body.id);
    expect(res.student).toMatch(/private to each plan/);
    expect(JSON.stringify(res)).not.toContain(STUDENT);
    const row = (await db.select().from(departmentRequirementOverridesTable).where(eq(departmentRequirementOverridesTable.targetKey, bioItem.stableKey)))[0]!;
    await asBio(request(app).delete(`/api/admin/department/overrides/${row.id}`)).expect(204);
  });

  it("is limited to the program's own administrators and its own requirements", async () => {
    await prov(asFin, biology.programKey, bioItem.stableKey).expect(403);
    await prov((r) => as("plain-user", PLAIN, r), biology.programKey, bioItem.stableKey).expect(403);
    await prov(asBio, biology.programKey, "major:biology#no-such").expect(404);
  });
});

describe("only department administration writes Department Notes", () => {
  it("has only the admin service and controlled checklist import/reconciliation scripts as writers", () => {
    // A student's checksheet upload, its tracking and "Add to planning" can therefore never create or change
    // a Department Note: none of their code writes the table.
    const root = path.resolve(import.meta.dirname, "..", "..");
    const writes = /\b(insert|update|delete)\(departmentRequirementNotesTable\)/;
    const writers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && writes.test(fs.readFileSync(file, "utf8"))) {
          writers.push(path.relative(root, file).split(path.sep).join("/"));
        }
      }
    };
    walk(path.join(root, "src"));
    walk(path.join(root, "scripts"));
    expect(writers.sort()).toEqual([
      "scripts/import-department-notes.ts",
      "scripts/reconcile-legacy-notes.ts",
      "src/lib/department/service.ts",
    ]);
    const importer = fs.readFileSync(path.join(root, "scripts", "import-department-notes.ts"), "utf8");
    expect(importer).toContain("departmentCanonicalResourcesTable");
    expect(importer).not.toContain("degreeChecksheetDocumentsTable");
    // The service is reached only through routes that check department access on the server.
    const routes = fs.readFileSync(path.join(root, "src", "routes", "department-admin.ts"), "utf8");
    const writeRoutes = routes.split("\n").filter((line) => /router\.(post|patch|put|delete)\(/.test(line));
    expect(writeRoutes.length).toBeGreaterThan(0);
    for (const line of writeRoutes) expect(line).toMatch(/requireAuth, (requireDepartmentAccess|requireSuperAdmin)/);
  });
});


describe("structured Department Notes: a title and a course list", () => {
  const themeKey = `${biology.programKey}#theme-cmb`;

  it("lets a department attach a titled course list to a Biology theme requirement", async () => {
    expect(bioGroup.items.map((i) => i.stableKey)).toContain(themeKey);
    const created = await asBio(request(app).post("/api/admin/department/notes"))
      .send({
        programKey: biology.programKey,
        targetKey: themeKey,
        title: `${marker} CMB courses`,
        body: `${marker} Courses that also overlap with the Biotechnology minor.`,
        courseCodes: ["biol 110", "BIOL  112", "BIOL 110"],
        status: "published",
      })
      .expect(201);
    expect(created.body.courseCodes).toEqual(["BIOL 110", "BIOL 112"]);
    const note = find(await view(STUDENT, studentPlan), themeKey).departmentNotes.find((n: any) => n.id === created.body.id);
    expect(note.title).toBe(`${marker} CMB courses`);
    expect(note.courseCodes).toEqual(["BIOL 110", "BIOL 112"]);
    expect(note.programTitle).toBe("Biology");
  });

  it("refuses a course that is not in the catalog, naming it, and never substitutes", async () => {
    const res = await asBio(request(app).post("/api/admin/department/notes"))
      .send({ programKey: biology.programKey, targetKey: themeKey, body: `${marker} bad list`, courseCodes: ["BIOL 110", "BIOL 999"] })
      .expect(400);
    expect(res.body.error).toContain("BIOL 999");
    const rows = await db.select().from(departmentRequirementNotesTable).where(like(departmentRequirementNotesTable.body, `${marker} bad list%`));
    expect(rows).toHaveLength(0);
  });

  it("edits and clears the title and course list, and audits both", async () => {
    const [row] = await db.select().from(departmentRequirementNotesTable).where(like(departmentRequirementNotesTable.body, `${marker} Courses that%`));
    await asBio(request(app).patch(`/api/admin/department/notes/${row!.id}`)).send({ title: null, courseCodes: [] }).expect(200);
    const note = find(await view(STUDENT, studentPlan), themeKey).departmentNotes.find((n: any) => n.id === row!.id);
    expect(note.title).toBeNull();
    expect(note.courseCodes).toEqual([]);
    const audit = await asBio(request(app).get(`/api/admin/department/programs/${encodeURIComponent(biology.programKey)}/audit`)).expect(200);
    const entry = audit.body.entries.find((e: any) => e.entity === "note" && e.action === "update" && e.targetKey === themeKey);
    expect(entry.before.courseCodes).toEqual(["BIOL 110", "BIOL 112"]);
    expect(entry.after.courseCodes).toEqual([]);
  });
});

describe("several departments' notes on one Core requirement", () => {
  const chemistryMinor = listPrograms().find((p) => p.type === "minor" && p.title === "Chemistry")!;

  it("shows a Biology major's note and a Chemistry minor's note side by side, each labelled, neither overwriting the other", async () => {
    expect(chemistryMinor).toBeDefined();
    await asSuper(request(app).post("/api/admin/department/notes"))
      .send({ programKey: chemistryMinor.programKey, targetKey: coreItem.stableKey, body: `${marker} chemistry core note`, status: "published" })
      .expect(201);
    const plan = await asStudent(request(app).post("/api/plans")).send({ name: "Bio + Chem minor" }).expect(201);
    await asStudent(request(app).patch(`/api/plans/${plan.body.id}`))
      .send({ programs: { primaryMajor: biology.code, additionalMajors: [], minors: [chemistryMinor.code], professionalGoals: [] } })
      .expect(200);
    const body = await view(STUDENT, plan.body.id);
    expect(body.groups.some((g: any) => g.stableKey === chemistryMinor.programKey)).toBe(true);
    const notes = find(body, coreItem.stableKey).departmentNotes.filter((n: any) => n.body.startsWith(marker));
    expect(notes.map((n: any) => [n.programTitle, n.body])).toEqual(
      expect.arrayContaining([
        ["Biology", `${marker} core note`],
        ["Chemistry", `${marker} chemistry core note`],
      ]),
    );
    // The requirement stays Core whichever department wrote about it.
    expect(groupOf(body, coreGroup.stableKey).items.map((i: any) => i.stableKey)).toContain(coreItem.stableKey);
  });

  it("shows neither department's Core note to a student with neither program", async () => {
    const theirs = await view(CAS_STUDENT, casPlan);
    const bodies = (find(theirs, coreItem.stableKey).departmentNotes ?? []).map((n: any) => n.body);
    expect(bodies).not.toContain(`${marker} core note`);
    expect(bodies).not.toContain(`${marker} chemistry core note`);
  });
});
