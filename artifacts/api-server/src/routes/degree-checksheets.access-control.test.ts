/**
 * Authorization audit for Degree Checksheets.
 *
 *   "No user can reach another user's documents or tracking through modified IDs."
 *   "Sharing a plan must not disclose the owner's checksheets."
 *   "A checksheet changes nothing about the plan, the requirements or the APR."
 *
 * Two layers, deliberately:
 *  1. STRUCTURAL guards over the source — cheap and permanent; they fail the
 *     moment someone adds a second reader of this data, trusts a client-sent
 *     user id, writes an unscoped query, or wires a checksheet into planning.
 *  2. BEHAVIOURAL checks over HTTP with the real database and the real local
 *     storage provider: user B, holding user A's ids, gets nothing — and so
 *     does an advisor holding a valid share of A's plan.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { eq, inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    req.userEmail = req.header("x-test-email");
    next();
  },
}));

import {
  db,
  academicPlansTable,
  degreeChecksheetAnnotationsTable,
  degreeChecksheetDocumentsTable,
  planSharesTable,
} from "@workspace/db";
import { resetPrivateObjectStorageForTests } from "../lib/storage";
import { buildChecksheetFixture } from "../__fixtures__/checksheets/build-fixtures";
import degreeChecksheetsRouter from "./degree-checksheets";
import planSharesRouter from "./plan-shares";
import progressReportsRouter from "./progress-reports";
import storageRouter from "./storage";

const SRC = join(import.meta.dirname, "..");
const REPO = join(SRC, "..", "..", "..");

function sourceFiles(dir: string, keep: (path: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      return name === "__fixtures__" || name === "node_modules" || name === "generated" ? [] : sourceFiles(p, keep);
    }
    return keep(p) ? [p] : [];
  });
}
const isSource = (p: string) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p);
const SERVER = sourceFiles(SRC, isSource);
const text = (p: string) => readFileSync(p, "utf8");
const rel = (p: string) => relative(SRC, p).replace(/\\/g, "/");
const ROUTE = text(join(SRC, "routes", "degree-checksheets.ts"));
const LIB = SERVER.filter((p) => rel(p).startsWith("lib/checksheets/"));

const ROUTES = [
  "get /degree-checksheets",
  "post /degree-checksheets/upload-url",
  "post /degree-checksheets",
  "get /degree-checksheets/:id",
  "patch /degree-checksheets/:id",
  "put /degree-checksheets/:id/file",
  "delete /degree-checksheets/:id",
  "get /degree-checksheets/:id/render",
  "get /degree-checksheets/:id/file",
  "get /degree-checksheets/:id/annotations",
  "post /degree-checksheets/:id/annotations",
  "patch /degree-checksheets/:id/annotations/:annotationId",
  "delete /degree-checksheets/:id/annotations/:annotationId",
];

describe("structural guards", () => {
  it("routes/degree-checksheets.ts is the ONLY server module that reads these tables", () => {
    const readers = SERVER.filter((p) => /degreeChecksheet(Documents|Annotations)Table/.test(text(p))).map(rel);
    expect(readers).toEqual(["routes/degree-checksheets.ts"]);
  });

  it("every route sits behind requireAuth", () => {
    const handlers = [...ROUTE.matchAll(/router\.(get|put|post|patch|delete)\(\s*"([^"]+)"([^)]*?)async/gs)];
    expect(handlers.map(([, method, path]) => `${method} ${path}`).sort()).toEqual([...ROUTES].sort());
    for (const [, method, path, middlewares] of handlers) {
      expect(middlewares, `${method} ${path}`).toMatch(/requireAuth/);
    }
  });

  it("the owner is ALWAYS the authenticated user — never a client-supplied id", () => {
    expect(ROUTE).not.toMatch(/req\.(body|query|params)(\.|\[["'])userId/);
    expect(ROUTE).not.toMatch(/req\.(body|query|params)\b[^;\n]*userId/);
    expect(ROUTE).not.toMatch(/parsed\.data\.userId|parsed\.data\.ownerId/);
    const handlers = ROUTE.split(/\nrouter\.(?:get|put|post|patch|delete)\(/).slice(1);
    expect(handlers).toHaveLength(ROUTES.length);
    for (const handler of handlers) {
      // Storage-unavailable short circuits aside, each handler derives the owner itself.
      expect(handler).toMatch(/const userId = req\.userId!/);
    }
  });

  it("every query against either table is scoped to an owner", () => {
    const statements = [
      ...ROUTE.matchAll(
        /\.(?:from|update|delete)\(degreeChecksheet(?:Documents|Annotations)Table\)[\s\S]*?;/g,
      ),
    ].map((m) => m[0]);
    expect(statements.length).toBeGreaterThanOrEqual(12);
    for (const statement of statements) {
      const scoped =
        /degreeChecksheet(?:Documents|Annotations)Table\.userId/.test(statement) ||
        // `own` is built, a few lines above its use, from the entry id AND the user id.
        /\.where\(own\)/.test(statement);
      expect(scoped, statement.slice(0, 140)).toBe(true);
    }
    expect(ROUTE).toMatch(
      /const own = and\(\s*eq\(degreeChecksheetAnnotationsTable\.id, entry\.id\),\s*eq\(degreeChecksheetAnnotationsTable\.userId, userId\),\s*\)/,
    );
  });

  it("an inserted row always takes its owner from the session", () => {
    const inserts = [...ROUTE.matchAll(/\.insert\(degreeChecksheet(?:Documents|Annotations)Table\)\s*\.values\(\{[\s\S]*?\}\)/g)];
    expect(inserts).toHaveLength(2);
    for (const [statement] of inserts) expect(statement).toMatch(/\n\s+userId,\n/);
  });

  it("the client DTOs never carry a storage path, an owner id or a full file hash", () => {
    const documentDto = /function documentDto\([\s\S]*?\n\}/.exec(ROUTE)![0];
    const annotationDto = /function annotationDto\([\s\S]*?\n\}/.exec(ROUTE)![0];
    expect(documentDto).not.toMatch(/objectPath|userId|fileHash:|render:/);
    expect(annotationDto).not.toMatch(/userId|anchorKey|anchorFingerprint/);
  });

  it("no advisor-sharing route touches checksheet data or the storage layer", () => {
    const shares = text(join(SRC, "routes", "plan-shares.ts"));
    expect(shares).not.toMatch(/getPrivateObjectStorage/);
    expect(shares).not.toMatch(/degreeChecksheet/i);
    expect(shares).not.toMatch(/lib\/checksheets\//);
  });

  it("stored objects are never served statically", () => {
    const app = text(join(SRC, "app.ts"));
    expect(app).not.toMatch(/PRIVATE_STORAGE_DIR|express\.static\([^)]*storage/);
  });

  it("nothing in the checksheet code logs an error object, which could quote file content", () => {
    for (const p of [...LIB, join(SRC, "routes", "degree-checksheets.ts")]) {
      expect(text(p), rel(p)).not.toMatch(/log\.(error|warn|info)\(\s*\{[^}]*\berr\b/);
      expect(text(p), rel(p)).not.toMatch(/console\.(log|error|warn)/);
    }
  });
});

describe("scope guards: a checksheet is a reference, not a source of requirements", () => {
  const ACADEMIC = /from\s+["'][^"']*(data\/courses|degree-requirements|graduation-paths|core-areas|core-cross-satisfaction|course-search|academic-status)["']/;

  it("the checksheet code imports no catalog, requirement, Core or planning logic", () => {
    expect(LIB.length).toBeGreaterThanOrEqual(10);
    for (const p of [...LIB, join(SRC, "routes", "degree-checksheets.ts")]) {
      expect(text(p), rel(p)).not.toMatch(ACADEMIC);
      expect(text(p), rel(p)).not.toMatch(/openai|integrations-openai/i);
    }
  });

  it("the route writes to no table but its own two", () => {
    const tables = [...ROUTE.matchAll(/\b(\w+Table)\b/g)].map((m) => m[1]);
    expect([...new Set(tables)].sort()).toEqual(["degreeChecksheetAnnotationsTable", "degreeChecksheetDocumentsTable"]);
    expect(ROUTE).not.toMatch(/progressReports|planItems|academicPlans|requirementCompletions|quarterSchedules/);
  });

  it("no planning, requirements, schedule or APR route knows checksheets exist", () => {
    for (const name of [
      "plans.ts",
      "planner.ts",
      "requirements.ts",
      "requirement-completions.ts",
      "schedules.ts",
      "dashboard.ts",
      "progress-reports.ts",
      "graduation-paths.ts",
      "courses.ts",
    ]) {
      expect(text(join(SRC, "routes", name)), name).not.toMatch(/checksheet/i);
    }
    for (const p of SERVER.filter((f) => rel(f).startsWith("lib/apr/"))) {
      expect(text(p), rel(p)).not.toMatch(/checksheet/i);
    }
  });

  it("the APR's own modules were not changed to serve checksheets", () => {
    // Checksheets REUSE the APR's workbook reader and zip guard; the dependency
    // runs one way only.
    const privateFile = text(join(SRC, "lib", "private-file-response.ts"));
    expect(privateFile).not.toMatch(/checksheet|image\/png|wordprocessingml/i);
    expect(text(join(SRC, "routes", "storage.ts"))).not.toMatch(/checksheet/i);
  });

  it("there is no scraper, no scheduled sync and no fetch of the SCU checksheet pages", () => {
    for (const p of [...LIB, join(SRC, "routes", "degree-checksheets.ts")]) {
      const source = text(p);
      expect(source, rel(p)).not.toMatch(/\bfetch\(|axios|node-fetch|setInterval\(|cron/);
      expect(source, rel(p)).not.toMatch(/scu\.edu/);
    }
  });

  it("in the web app, only the Degree Checksheets feature uses the checksheet API", () => {
    const web = join(REPO, "artifacts", "scu-advising", "src");
    const allowed = /^(pages\/degree-checksheets\.tsx|components\/degree-checksheets\/|hooks\/use-degree-checksheets\.ts|lib\/pilot-features\.ts|App\.tsx)/;
    const users = sourceFiles(web, isSource)
      .filter((p) => /DegreeChecksheet|degree-checksheets/.test(text(p)))
      .map((p) => relative(web, p).replace(/\\/g, "/"))
      .filter((p) => !allowed.test(p));
    expect(users).toEqual([]);
  });
});

const RUN = Date.now();
const STUDENT = `dcs-ac-student-${RUN}`;
const OTHER = `dcs-ac-other-${RUN}`;
const ADVISOR = `dcs-ac-advisor-${RUN}`;
const ADVISOR_EMAIL = `dcs-advisor-${RUN}@scu.edu`;
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SECRETS = /Widget|WIDG|Sprocket|SPRK|secret-major|My private note|Private list item|Sample School/;
const CELL = { sheet: 0, row: 4, col: 2 };

let planId: number;
let dir: string;
let docId: number;
let secondDocId: number;
let cellEntryId: number;
let manualEntryId: number;
let studentObjectPath: string;
const savedEnv = { ...process.env };

const app = express();
app.use((req, _res, next) => {
  (req as any).log = { error() {}, warn() {}, info() {} };
  next();
});
app.use(express.json());
app.use("/api", storageRouter);
app.use("/api", degreeChecksheetsRouter);
app.use("/api", progressReportsRouter);
app.use("/api", planSharesRouter);

const pathOf = (u: string) => (u.startsWith("/") ? u : new URL(u).pathname);
const as = (user: string, r: request.Test) => r.set("x-test-user", user);

async function upload(user: string, bytes: Buffer, fileName: string): Promise<string> {
  const target = await as(user, request(app).post("/api/degree-checksheets/upload-url")).send({
    name: fileName,
    size: bytes.length,
    contentType: XLSX_TYPE,
  });
  await request(app).put(pathOf(target.body.uploadURL)).set("Content-Type", XLSX_TYPE).send(bytes);
  return target.body.objectPath;
}

async function addDocument(user: string, bytes: Buffer, fileName: string, title: string) {
  const objectPath = await upload(user, bytes, fileName);
  const res = await as(user, request(app).post("/api/degree-checksheets")).send({
    objectPath,
    fileName,
    fileSize: bytes.length,
    contentType: XLSX_TYPE,
    title,
    // Only the student's documents carry text the others must never see.
    ...(user === STUDENT ? { school: "Sample School of Widgets" } : {}),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { id: res.body.id as number, objectPath };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "campusval-dcs-ac-"));
  process.env["PRIVATE_STORAGE_PROVIDER"] = "local";
  process.env["PRIVATE_STORAGE_DIR"] = dir;
  process.env["STORAGE_SIGNING_SECRET"] = "k".repeat(48);
  resetPrivateObjectStorageForTests();

  const major = await addDocument(STUDENT, await buildChecksheetFixture("major-workbook"), "secret-major.xlsx", "Applied Widgetry Major");
  docId = major.id;
  studentObjectPath = major.objectPath;
  secondDocId = (await addDocument(STUDENT, await buildChecksheetFixture("minor-workbook"), "minor.xlsx", "Sprocket Studies Minor")).id;

  const cell = await as(STUDENT, request(app).post(`/api/degree-checksheets/${docId}/annotations`)).send({
    anchorType: "sheet_cell",
    anchor: CELL,
    status: "completed",
    note: "My private note",
  });
  cellEntryId = cell.body.id;
  const manual = await as(STUDENT, request(app).post(`/api/degree-checksheets/${docId}/annotations`)).send({
    anchorType: "manual",
    itemLabel: "Private list item",
    status: "planned",
    term: "fall",
    termYear: 2026,
  });
  manualEntryId = manual.body.id;

  const [plan] = await db
    .insert(academicPlansTable)
    .values({ userId: STUDENT, name: "My plan", planType: "degree" } as any)
    .returning();
  planId = plan!.id;
  await db.insert(planSharesTable).values({
    studentUserId: STUDENT,
    advisorEmail: ADVISOR_EMAIL,
    scopes: ["degree_plan", "tentative_degree_plan"],
  });
});

afterAll(async () => {
  await db.delete(planSharesTable).where(eq(planSharesTable.studentUserId, STUDENT));
  await db.delete(academicPlansTable).where(eq(academicPlansTable.id, planId));
  await db
    .delete(degreeChecksheetDocumentsTable)
    .where(inArray(degreeChecksheetDocumentsTable.userId, [STUDENT, OTHER, ADVISOR]));
  rmSync(dir, { recursive: true, force: true });
  process.env = savedEnv;
  resetPrivateObjectStorageForTests();
});

async function studentState() {
  const documents = await db
    .select()
    .from(degreeChecksheetDocumentsTable)
    .where(eq(degreeChecksheetDocumentsTable.userId, STUDENT));
  const entries = await db
    .select()
    .from(degreeChecksheetAnnotationsTable)
    .where(eq(degreeChecksheetAnnotationsTable.userId, STUDENT));
  return {
    documents: documents
      .map((d) => ({ id: d.id, title: d.title, file: d.originalFilename, path: d.objectPath, hash: d.fileHash, version: d.sourceVersion, uploadedAt: d.uploadedAt.toISOString() }))
      .sort((a, b) => a.id - b.id),
    entries: entries
      .map((e) => ({ id: e.id, doc: e.documentId, type: e.anchorType, anchor: e.anchor, status: e.status, term: e.term, year: e.termYear, note: e.note, label: e.itemLabel, revision: e.revision, detached: e.detachedAt }))
      .sort((a, b) => a.id - b.id),
  };
}

describe("user B, knowing user A's ids, gets nothing", () => {
  it("cannot LIST user A's documents", async () => {
    const res = await as(OTHER, request(app).get("/api/degree-checksheets"));
    expect(res.status).toBe(200);
    expect(res.body.documents).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(SECRETS);
  });

  it("cannot read user A's metadata or preview — indistinguishable from a missing document", async () => {
    const missing = await as(OTHER, request(app).get("/api/degree-checksheets/2147483000"));
    expect(missing.status).toBe(404);
    for (const id of [docId, secondDocId]) {
      const meta = await as(OTHER, request(app).get(`/api/degree-checksheets/${id}`));
      const render = await as(OTHER, request(app).get(`/api/degree-checksheets/${id}/render`));
      expect([meta.status, render.status]).toEqual([404, 404]);
      expect(meta.body).toEqual(missing.body);
      expect(render.body).toEqual(missing.body);
      expect(JSON.stringify([meta.body, render.body])).not.toMatch(SECRETS);
    }
  });

  it("cannot get user A's source file, by id or by storage path", async () => {
    expect((await as(OTHER, request(app).get(`/api/degree-checksheets/${docId}/file`))).status).toBe(404);
    expect((await as(OTHER, request(app).get(`/api/storage${studentObjectPath}`))).status).toBe(403);
    // Control: the owner can.
    expect((await as(STUDENT, request(app).get(`/api/degree-checksheets/${docId}/file`))).status).toBe(200);
  });

  it("cannot read user A's tracking", async () => {
    const res = await as(OTHER, request(app).get(`/api/degree-checksheets/${docId}/annotations`));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(SECRETS);
  });

  it("cannot create tracking on user A's document", async () => {
    const before = await studentState();
    for (const body of [
      { anchorType: "sheet_cell", anchor: { sheet: 0, row: 5, col: 2 }, status: "completed" },
      { anchorType: "sheet_cell", anchor: CELL, status: "not_started" },
      { anchorType: "manual", itemLabel: "Planted", status: "completed" },
    ]) {
      const res = await as(OTHER, request(app).post(`/api/degree-checksheets/${docId}/annotations`)).send(body);
      expect(res.status, JSON.stringify(body)).toBe(404);
    }
    expect(await studentState()).toEqual(before);
  });

  it("cannot edit or delete user A's tracking, even through a document of their own", async () => {
    const before = await studentState();
    const own = await addDocument(OTHER, await buildChecksheetFixture("second-major-workbook"), "own.xlsx", "Mine");

    for (const entry of [cellEntryId, manualEntryId]) {
      for (const doc of [docId, own.id]) {
        const edit = await as(OTHER, request(app).patch(`/api/degree-checksheets/${doc}/annotations/${entry}`)).send({ status: "not_started", note: "hijacked" });
        const move = await as(OTHER, request(app).patch(`/api/degree-checksheets/${doc}/annotations/${entry}`)).send({ keepAsListEntry: true });
        const del = await as(OTHER, request(app).delete(`/api/degree-checksheets/${doc}/annotations/${entry}`));
        expect([edit.status, move.status, del.status], `entry ${entry} via document ${doc}`).toEqual([404, 404, 404]);
        expect(JSON.stringify([edit.body, move.body, del.body])).not.toMatch(SECRETS);
      }
    }
    expect(await studentState()).toEqual(before);
  });

  it("cannot rename, re-describe, replace or delete user A's documents", async () => {
    const before = await studentState();
    const bytes = await buildChecksheetFixture("second-major-workbook");
    const ownUpload = await upload(OTHER, bytes, "mine.xlsx");

    const rename = await as(OTHER, request(app).patch(`/api/degree-checksheets/${docId}`)).send({ title: "Hijacked" });
    const describe_ = await as(OTHER, request(app).patch(`/api/degree-checksheets/${docId}`)).send({ sourceUrl: "https://evil.example/", academicYearLabel: "x" });
    const replace = await as(OTHER, request(app).put(`/api/degree-checksheets/${docId}/file`)).send({
      objectPath: ownUpload,
      fileName: "mine.xlsx",
      fileSize: bytes.length,
      contentType: XLSX_TYPE,
    });
    const del = await as(OTHER, request(app).delete(`/api/degree-checksheets/${docId}`));
    expect([rename.status, describe_.status, replace.status, del.status]).toEqual([404, 404, 404, 404]);
    expect(await studentState()).toEqual(before);
    expect((await as(STUDENT, request(app).get(`/api/degree-checksheets/${docId}/file`))).status).toBe(200);
  });

  it("cannot claim user A's uploaded object as a new document or as a replacement", async () => {
    const bytes = await buildChecksheetFixture("major-workbook");
    const create = await as(OTHER, request(app).post("/api/degree-checksheets")).send({
      objectPath: studentObjectPath,
      fileName: "stolen.xlsx",
      fileSize: bytes.length,
      contentType: XLSX_TYPE,
      title: "Stolen",
    });
    expect(create.status).toBe(403);

    const mine = await addDocument(OTHER, await buildChecksheetFixture("second-major-workbook"), "own2.xlsx", "Mine too");
    const swap = await as(OTHER, request(app).put(`/api/degree-checksheets/${mine.id}/file`)).send({
      objectPath: studentObjectPath,
      fileName: "stolen.xlsx",
      fileSize: bytes.length,
      contentType: XLSX_TYPE,
    });
    expect(swap.status).toBe(403);
    // A's file is still there for A, and B's document still shows B's own file.
    expect((await as(STUDENT, request(app).get(`/api/degree-checksheets/${docId}/file`))).status).toBe(200);
    const render = await as(OTHER, request(app).get(`/api/degree-checksheets/${mine.id}/render`));
    expect(JSON.stringify(render.body)).toContain("Gadget");
    expect(JSON.stringify(render.body)).not.toMatch(SECRETS);
  });

  it("no path, query or body trick can address another user's documents", async () => {
    const tricks = [
      `/api/degree-checksheets?userId=${STUDENT}`,
      `/api/degree-checksheets?user_id=${STUDENT}`,
      `/api/degree-checksheets/${docId}?userId=${STUDENT}`,
      `/api/degree-checksheets/${docId}/render?owner=${STUDENT}`,
      `/api/degree-checksheets/${docId}/annotations?userId=${STUDENT}`,
    ];
    for (const url of tricks) {
      const res = await as(OTHER, request(app).get(url));
      expect(JSON.stringify(res.body), url).not.toMatch(SECRETS);
    }
    for (const id of ["0", "-1", "1.5", "abc", `${docId} OR 1=1`, `${docId}%20`, "99999999999999999999", "../upload-url"]) {
      const res = await as(OTHER, request(app).get(`/api/degree-checksheets/${encodeURIComponent(id)}`));
      expect(res.status, id).toBe(404);
    }
    const planted = await as(OTHER, request(app).post(`/api/degree-checksheets/${docId}/annotations`)).send({
      anchorType: "manual",
      itemLabel: "x",
      userId: STUDENT,
      documentId: docId,
    });
    expect(planted.status).toBe(404);
    const del = await as(OTHER, request(app).delete(`/api/degree-checksheets/${docId}`)).send({ userId: STUDENT });
    expect(del.status).toBe(404);
  });

  it("a body cannot move an entry to another owner or another document", async () => {
    const before = await studentState();
    const res = await as(STUDENT, request(app).patch(`/api/degree-checksheets/${docId}/annotations/${manualEntryId}`)).send({
      note: "edited by owner",
      userId: OTHER,
      documentId: secondDocId,
      revision: 99,
      detached: true,
    });
    expect(res.status).toBe(200);
    const after = await studentState();
    const entry = after.entries.find((e) => e.id === manualEntryId)!;
    const was = before.entries.find((e) => e.id === manualEntryId)!;
    expect(entry).toEqual({ ...was, note: "edited by owner", revision: was.revision + 1 });
    const owners = await db
      .select({ userId: degreeChecksheetAnnotationsTable.userId })
      .from(degreeChecksheetAnnotationsTable)
      .where(eq(degreeChecksheetAnnotationsTable.id, manualEntryId));
    expect(owners).toEqual([{ userId: STUDENT }]);
  });
});

describe("an advisor with a VALID plan share still cannot reach the student's checksheets", () => {
  const asAdvisor = (r: request.Test) => r.set("x-test-user", ADVISOR).set("x-test-email", ADVISOR_EMAIL);

  it("the share itself works (control): the advisor can read the shared plan", async () => {
    const res = await asAdvisor(request(app).get(`/api/advisor/shared-students/${STUDENT}/plan`));
    expect(res.status).toBe(200);
    expect(res.body.readOnly).toBe(true);
  });

  it("…and that response contains no checksheet data of any kind", async () => {
    const res = await asAdvisor(request(app).get(`/api/advisor/shared-students/${STUDENT}/plan`));
    expect(JSON.stringify(res.body)).not.toMatch(SECRETS);
    expect(JSON.stringify(res.body)).not.toMatch(/checksheet|annotation|renderStatus|anchorType/i);
  });

  it("the advisor's library is THEIR OWN (empty), never the student's", async () => {
    const res = await asAdvisor(request(app).get("/api/degree-checksheets"));
    expect(res.body.documents).toEqual([]);
    for (const path of ["", "/render", "/file", "/annotations"]) {
      expect((await asAdvisor(request(app).get(`/api/degree-checksheets/${docId}${path}`))).status, path).toBe(404);
    }
  });

  it("the advisor cannot change or remove anything", async () => {
    const before = await studentState();
    const calls = [
      asAdvisor(request(app).patch(`/api/degree-checksheets/${docId}`)).send({ title: "Advisor edit" }),
      asAdvisor(request(app).delete(`/api/degree-checksheets/${docId}`)),
      asAdvisor(request(app).post(`/api/degree-checksheets/${docId}/annotations`)).send({ anchorType: "manual", itemLabel: "Advisor note" }),
      asAdvisor(request(app).patch(`/api/degree-checksheets/${docId}/annotations/${cellEntryId}`)).send({ status: "not_started" }),
      asAdvisor(request(app).delete(`/api/degree-checksheets/${docId}/annotations/${cellEntryId}`)),
    ];
    for (const call of calls) expect((await call).status).toBe(404);
    expect(await studentState()).toEqual(before);
  });

  it("no advisor route returns checksheets, whatever the share's scope", async () => {
    await db
      .update(planSharesTable)
      .set({ scopes: ["degree_plan", "tentative_degree_plan", "quarter_plan", "degree_checksheets", "checksheets"] as any })
      .where(eq(planSharesTable.studentUserId, STUDENT));
    const list = await asAdvisor(request(app).get("/api/advisor/shared-students"));
    const plan = await asAdvisor(request(app).get(`/api/advisor/shared-students/${STUDENT}/plan`));
    expect(JSON.stringify([list.body, plan.body])).not.toMatch(SECRETS);
    expect((await asAdvisor(request(app).get(`/api/degree-checksheets/${docId}`))).status).toBe(404);
  });
});

describe("checksheets and APRs stay apart", () => {
  it("a checksheet never appears among Academic Progress Reports, and the reverse", async () => {
    const aprs = await as(STUDENT, request(app).get("/api/progress-reports"));
    expect(aprs.status).toBe(200);
    expect(aprs.body.reports).toEqual([]);
    const sidebar = await as(STUDENT, request(app).get("/api/progress-reports/sidebar"));
    expect(sidebar.body.documents).toEqual([]);
    expect(JSON.stringify([aprs.body, sidebar.body])).not.toMatch(SECRETS);
    // A checksheet id is not an APR id.
    expect((await as(STUDENT, request(app).get(`/api/progress-reports/${docId}/workbook`))).status).toBe(404);
  });

  it("an upload link made for a checksheet cannot be registered as an APR of another type", async () => {
    const bytes = await buildChecksheetFixture("flowchart-png");
    const target = await as(STUDENT, request(app).post("/api/degree-checksheets/upload-url")).send({
      name: "chart.png",
      size: bytes.length,
      contentType: "image/png",
    });
    await request(app).put(pathOf(target.body.uploadURL)).set("Content-Type", "image/png").send(bytes);
    const res = await as(STUDENT, request(app).post("/api/progress-reports")).send({
      objectPath: target.body.objectPath,
      fileName: "chart.png",
      fileSize: bytes.length,
      contentType: "image/png",
      label: "Not an APR",
    });
    expect(res.status).toBe(400);
    expect((await as(STUDENT, request(app).get("/api/progress-reports"))).body.reports).toEqual([]);
  });
});
