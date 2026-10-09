/**
 * Degree Completion Assessment over HTTP, with the real database and the real
 * local storage provider, on SYNTHETIC APR workbooks: the automatic result,
 * the student's corrections, reset, APR replacement and several APRs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import ExcelJS from "exceljs";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eq, inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

import { db, progressReportsTable, degreeCompletionOverridesTable } from "@workspace/db";
import { resetPrivateObjectStorageForTests } from "../lib/storage";
import storageRouter from "./storage";
import progressReportsRouter from "./progress-reports";

const RUN = Date.now();
const STUDENT = `dca-student-${RUN}`;
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const savedEnv = { ...process.env };
let dir: string;

const app = express();
app.use((req, _res, next) => {
  (req as any).log = { error() {}, warn() {}, info() {} };
  next();
});
app.use(express.json());
app.use("/api", storageRouter);
app.use("/api", progressReportsRouter);

type Row = (string | number | null)[];
/** A synthetic Workday-shaped export: a block title, the two-row header, the rows. */
async function aprXlsx(title: string, rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("View My Academic Progress");
  ws.addRow([title]);
  ws.addRow(["Program of Study GPA", "3.100"]);
  ws.addRow(["Requirement", "Status", "Remaining", "Satisfied With", null, null, null]);
  ws.addRow([null, null, null, "Registrations Used", "Academic Period", "Units", "Grade"]);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const BIOLOGY_V1: Row[] = [
  ["Core: CAS: CTW 1", "Satisfied", null, "ENGL 1A - Critical Thinking and Writing I", "Fall 2025 Quarter", 4, "A-"],
  ["Biology Major: BIOL 1B", "In Progress", null, "BIOL 1B - Information and Evolution (In Progress)", "Winter 2026 Quarter", 4, null],
  ["Biology Major: Upper Division Theme Courses", "In Progress", "Minimum 2 Course(s)", "BIOL 174 - Cell Biology", "Fall 2025 Quarter", 5, "B+"],
  ["Biology Major: BIOL 101", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
  ["Biology Major: Physics", "Not Satisfied", "Minimum Combination Required", null, null, null, null],
];

const pathOf = (u: string) => (u.startsWith("/") ? u : new URL(u).pathname);
async function upload(bytes: Buffer, fileName: string): Promise<string> {
  const target = await request(app)
    .post("/api/storage/uploads/request-url")
    .set("x-test-user", STUDENT)
    .send({ name: fileName, size: bytes.length, contentType: XLSX_TYPE });
  await request(app).put(pathOf(target.body.uploadURL)).set("Content-Type", XLSX_TYPE).send(bytes);
  return target.body.objectPath;
}
async function addApr(bytes: Buffer, label: string, category: string): Promise<number> {
  const res = await request(app)
    .post("/api/progress-reports")
    .set("x-test-user", STUDENT)
    .send({ objectPath: await upload(bytes, `${label}.xlsx`), fileName: `${label}.xlsx`, fileSize: bytes.length, contentType: XLSX_TYPE, label, category });
  expect(res.status).toBe(201);
  return res.body.id;
}
const assessment = async () => (await request(app).get("/api/progress-reports/assessment").set("x-test-user", STUDENT).expect(200)).body;
const itemsOf = (body: any, id: number) => body.documents.find((d: any) => d.report.id === id).programs.flatMap((p: any) => p.items);
const byLabel = (items: any[], label: string) => items.find((i: any) => i.label === label);
const correct = (id: number, key: string, body: object) =>
  request(app).put(`/api/progress-reports/${id}/assessment/items/${key}`).set("x-test-user", STUDENT).send(body);

let bioId: number;
let chemId: number;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "campusval-dca-"));
  process.env["PRIVATE_STORAGE_PROVIDER"] = "local";
  process.env["PRIVATE_STORAGE_DIR"] = dir;
  process.env["STORAGE_SIGNING_SECRET"] = "t".repeat(48);
  delete process.env["DEGREE_COMPLETION_ASSESSMENT_ENABLED"];
  delete process.env["DEGREE_COMPLETION_IN_PROGRESS_REMAINING_IS_ADDITIONAL"];
  resetPrivateObjectStorageForTests();
  bioId = await addApr(await aprXlsx("Biology Major Requirements", BIOLOGY_V1), "Biology", "primary_major");
  chemId = await addApr(
    await aprXlsx("Chemistry Minor Requirements", [["Chemistry Minor: CHEM 31", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null]]),
    "Chemistry Minor",
    "minor",
  );
});

afterAll(async () => {
  await db.delete(progressReportsTable).where(inArray(progressReportsTable.userId, [STUDENT]));
  rmSync(dir, { recursive: true, force: true });
  process.env = savedEnv;
  resetPrivateObjectStorageForTests();
});

describe("the automatic Degree Completion Assessment", () => {
  it("is generated per APR, says it is a planning aid, and names Workday as the definitive reference", async () => {
    const body = await assessment();
    expect(body.enabled).toBe(true);
    expect(body.disclaimer).toContain("Workday is the definitive reference for degree completion");
    expect(body.documents.map((d: any) => [d.report.label, d.programs.map((p: any) => p.block)])).toEqual([
      ["Biology", ["Biology Major Requirements"]],
      ["Chemistry Minor", ["Chemistry Minor Requirements"]],
    ]);
    expect(JSON.stringify(body)).not.toMatch(/cleared to graduate|official degree audit|graduation audit/i);
  });

  it("marks only explicit Not Satisfied as remaining, and never calls In Progress complete", async () => {
    const items = itemsOf(await assessment(), bioId);
    expect(byLabel(items, "Biology Major: BIOL 101")).toMatchObject({ effective: "remaining", confidence: "CLEAR_REMAINING", remaining: "Minimum 1 Course(s)" });
    expect(byLabel(items, "Core: CAS: CTW 1")).toMatchObject({ effective: "appears_complete", confidence: "LIKELY_COMPLETE" });
    expect(byLabel(items, "Biology Major: BIOL 1B")).toMatchObject({ effective: "needs_review", automatic: { reason: "in_progress_pending_grade" } });
    expect(byLabel(items, "Biology Major: Upper Division Theme Courses")).toMatchObject({ effective: "needs_review", automatic: { reason: "in_progress_with_remaining" } });
    expect(byLabel(items, "Biology Major: Physics")).toMatchObject({ effective: "remaining", remainingKind: "combination" });
    // The trace says exactly where each item came from.
    expect(byLabel(items, "Biology Major: BIOL 101").trace).toMatchObject({ sheet: "View My Academic Progress", row: 7, block: "Biology Major Requirements", rule: "apr_not_satisfied" });
  });
});

describe("student corrections", () => {
  it("a correction is shown as adjusted, keeps the automatic result, and resets to it", async () => {
    const item = byLabel(itemsOf(await assessment(), bioId), "Biology Major: Upper Division Theme Courses");
    await correct(bioId, item.key, { status: "remaining", note: "Two more theme courses per my advisor" }).expect(200);
    const after = byLabel(itemsOf(await assessment(), bioId), item.label);
    expect(after).toMatchObject({
      effective: "remaining",
      confidence: "USER_CORRECTED",
      adjusted: true,
      automatic: { state: "AMBIGUOUS", reason: "in_progress_with_remaining" },
      correction: { status: "remaining", note: "Two more theme courses per my advisor", sourceChanged: false },
    });
    await request(app).delete(`/api/progress-reports/${bioId}/assessment/items/${item.key}`).set("x-test-user", STUDENT).expect(204);
    expect(byLabel(itemsOf(await assessment(), bioId), item.label)).toMatchObject({ effective: "needs_review", adjusted: false, correction: null });
  });

  it("can mark complete for planning, add a note, hide from the assessment and restore", async () => {
    const item = byLabel(itemsOf(await assessment(), bioId), "Biology Major: BIOL 1B");
    await correct(bioId, item.key, { status: "complete" }).expect(200);
    expect(byLabel(itemsOf(await assessment(), bioId), item.label).effective).toBe("complete_for_planning");
    await correct(bioId, item.key, { hidden: true }).expect(200);
    const hidden = await assessment();
    expect(byLabel(itemsOf(hidden, bioId), item.label).correction).toMatchObject({ status: "complete", hidden: true });
    expect(hidden.documents.find((d: any) => d.report.id === bioId).summary.hidden).toBe(1);
    await correct(bioId, item.key, { hidden: false, status: null }).expect(200);
    // Nothing left to keep: the correction row is gone, the automatic result is back.
    const rows = await db.select().from(degreeCompletionOverridesTable).where(eq(degreeCompletionOverridesTable.aprDocumentId, bioId));
    expect(rows).toHaveLength(0);
  });

  it("refuses an unknown row key, an invalid body and an empty change", async () => {
    await correct(bioId, "0123456789abcdef", { status: "complete" }).expect(404);
    await correct(bioId, "not-a-key", { status: "complete" }).expect(400);
    const item = itemsOf(await assessment(), bioId)[0];
    await correct(bioId, item.key, { status: "official" }).expect(400);
    await correct(bioId, item.key, {}).expect(400);
  });

  it("never changes the APR itself", async () => {
    const [before] = await db.select().from(progressReportsTable).where(eq(progressReportsTable.id, bioId));
    const item = itemsOf(await assessment(), bioId)[0];
    await correct(bioId, item.key, { status: "complete", note: "x" }).expect(200);
    const [after] = await db.select().from(progressReportsTable).where(eq(progressReportsTable.id, bioId));
    expect(after!.workbook).toEqual(before!.workbook);
    expect(after!.updatedAt.toISOString()).toBe(before!.updatedAt.toISOString());
    await request(app).delete(`/api/progress-reports/${bioId}/assessment/items/${item.key}`).set("x-test-user", STUDENT).expect(204);
  });
});

describe("when the APR is replaced by a newer export", () => {
  it("keeps a correction on an unchanged row, flags one whose row changed, and lists one whose row is gone", async () => {
    const items = itemsOf(await assessment(), bioId);
    const ctw = byLabel(items, "Core: CAS: CTW 1");
    const theme = byLabel(items, "Biology Major: Upper Division Theme Courses");
    const physics = byLabel(items, "Biology Major: Physics");
    await correct(bioId, ctw.key, { note: "done in my first year" }).expect(200);
    await correct(bioId, theme.key, { status: "complete" }).expect(200);
    await correct(bioId, physics.key, { status: "complete" }).expect(200);

    // The newer export: CTW 1 unchanged, the theme row changed, the physics row gone.
    const v2: Row[] = [
      BIOLOGY_V1[0]!,
      BIOLOGY_V1[1]!,
      ["Biology Major: Upper Division Theme Courses", "In Progress", "Minimum 1 Course(s)", "BIOL 174 - Cell Biology", "Fall 2025 Quarter", 5, "B+"],
      [null, null, null, "BIOL 180 - Marine Ecology (In Progress)", "Winter 2026 Quarter", 5, null],
      BIOLOGY_V1[3]!,
    ];
    const bytes = await aprXlsx("Biology Major Requirements", v2);
    const replaced = await request(app)
      .put(`/api/progress-reports/${bioId}/file`)
      .set("x-test-user", STUDENT)
      .send({ objectPath: await upload(bytes, "biology-v2.xlsx"), fileName: "biology-v2.xlsx", fileSize: bytes.length, contentType: XLSX_TYPE });
    expect(replaced.status).toBe(200);

    const body = await assessment();
    const now = itemsOf(body, bioId);
    expect(byLabel(now, ctw.label).correction).toMatchObject({ note: "done in my first year", sourceChanged: false });
    // Changed row: the correction is kept but NOT applied until the student confirms it.
    expect(byLabel(now, theme.label)).toMatchObject({ effective: "needs_review", adjusted: false, correction: { status: "complete", sourceChanged: true } });
    // Gone: listed, not silently dropped.
    const doc = body.documents.find((d: any) => d.report.id === bioId);
    expect(doc.orphaned.map((o: any) => o.sourceLabel)).toEqual(["Biology Major: Physics"]);

    // Confirming (saving again) re-anchors it to the new row.
    await correct(bioId, theme.key, { status: "complete" }).expect(200);
    expect(byLabel(itemsOf(await assessment(), bioId), theme.label)).toMatchObject({ effective: "complete_for_planning", correction: { sourceChanged: false } });
    // An orphaned correction can be reset.
    await request(app).delete(`/api/progress-reports/${bioId}/assessment/items/${physics.key}`).set("x-test-user", STUDENT).expect(204);
    expect((await assessment()).documents.find((d: any) => d.report.id === bioId).orphaned).toEqual([]);
  });

  it("deleting the APR deletes its corrections with it", async () => {
    const item = itemsOf(await assessment(), chemId)[0];
    await correct(chemId, item.key, { note: "taking it in spring" }).expect(200);
    await request(app).delete(`/api/progress-reports/${chemId}`).set("x-test-user", STUDENT).expect(200);
    const rows = await db.select().from(degreeCompletionOverridesTable).where(eq(degreeCompletionOverridesTable.aprDocumentId, chemId));
    expect(rows).toEqual([]);
  });
});

describe("feature switch", () => {
  it("DEGREE_COMPLETION_ASSESSMENT_ENABLED=false hides it without touching anything", async () => {
    process.env["DEGREE_COMPLETION_ASSESSMENT_ENABLED"] = "false";
    try {
      const body = await assessment();
      expect(body).toMatchObject({ enabled: false, documents: [] });
      const key = "0123456789abcdef";
      await correct(bioId, key, { status: "complete" }).expect(404);
    } finally {
      delete process.env["DEGREE_COMPLETION_ASSESSMENT_ENABLED"];
    }
  });
});
