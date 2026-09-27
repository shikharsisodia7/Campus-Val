/**
 * Academic Progress Report documents, end to end, against the REAL
 * local-filesystem storage provider and the REAL database (only Clerk auth is
 * stubbed): signed upload link -> PUT bytes -> create -> list -> full workbook
 * -> sidebar -> rename -> replace -> delete.
 *
 * All workbook data is synthetic (see __fixtures__/apr/build-workbooks.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

import { db, progressReportsTable, progressReportMappingsTable, studentProfilesTable } from "@workspace/db";
import { resetPrivateObjectStorageForTests } from "../lib/storage";
import { buildAprFixture, FIXTURE_PRIVATE_MARKERS, type AprFixtureName } from "../__fixtures__/apr/build-workbooks";
import { buildAprPdf } from "../__fixtures__/apr/build-pdf";
import storageRouter from "./storage";
import progressReportsRouter, { resolveSourceFormat } from "./progress-reports";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_TYPE = "application/pdf";
const PDF_BYTES = Buffer.from("%PDF-1.7\n% synthetic test file, not a real report\n%%EOF\n");

const RUN = Date.now();
const OWNER = `aprs-owner-${RUN}`;
const FRESH = `aprs-fresh-${RUN}`;
const PDFUSER = `aprs-pdf-${RUN}`;
const LEGACY = `aprs-legacy-${RUN}`;
const IDENT = `aprs-ident-${RUN}`;
const USERS = [OWNER, FRESH, LEGACY, IDENT, PDFUSER];

let dir: string;
let app: express.Express;
const saved = { ...process.env };
/** Everything the routes logged, to prove no workbook content is ever written. */
const logged: unknown[] = [];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "campusval-aprs-"));
  process.env["PRIVATE_STORAGE_PROVIDER"] = "local";
  process.env["PRIVATE_STORAGE_DIR"] = dir;
  process.env["STORAGE_SIGNING_SECRET"] = "t".repeat(48);
  delete process.env["APR_MAX_UPLOAD_MB"];
  resetPrivateObjectStorageForTests();

  const capture = (...args: unknown[]) => void logged.push(args);
  app = express();
  app.use((req, _res, next) => {
    (req as any).log = { info: capture, warn: capture, error: capture, debug: capture };
    next();
  });
  app.use(express.json());
  app.use("/api", storageRouter);
  app.use("/api", progressReportsRouter);
});

afterAll(async () => {
  await db.delete(progressReportsTable).where(inArray(progressReportsTable.userId, USERS));
  await db.delete(progressReportMappingsTable).where(inArray(progressReportMappingsTable.userId, USERS));
  await db.delete(studentProfilesTable).where(inArray(studentProfilesTable.userId, USERS));
  rmSync(dir, { recursive: true, force: true });
  process.env = saved;
  resetPrivateObjectStorageForTests();
});

const pathOf = (u: string) => (u.startsWith("/") ? u : new URL(u).pathname);

async function putBytes(user: string, bytes: Buffer, contentType: string, fileName: string) {
  const target = await request(app)
    .post("/api/storage/uploads/request-url")
    .set("x-test-user", user)
    .send({ name: fileName, size: bytes.length, contentType });
  expect(target.status).toBe(200);
  const put = await request(app).put(pathOf(target.body.uploadURL)).set("Content-Type", contentType).send(bytes);
  expect(put.status).toBe(200);
  return target.body.objectPath as string;
}

async function create(
  user: string,
  bytes: Buffer,
  opts: { label: string; category?: string; fileName?: string; contentType?: string },
) {
  const contentType = opts.contentType ?? XLSX_TYPE;
  const fileName = opts.fileName ?? "apr.xlsx";
  const objectPath = await putBytes(user, bytes, contentType, fileName);
  return request(app)
    .post("/api/progress-reports")
    .set("x-test-user", user)
    .send({
      objectPath,
      fileName,
      fileSize: bytes.length,
      contentType,
      label: opts.label,
      ...(opts.category ? { category: opts.category } : {}),
    });
}

const createFixture = async (user: string, name: AprFixtureName, label: string, category?: string) =>
  create(user, await buildAprFixture(name), { label, category, fileName: `${name}.xlsx` });

function filesOnDisk(): string[] {
  const root = join(dir, "progress-reports");
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((owner) =>
    readdirSync(join(root, owner)).filter((f) => !f.endsWith(".meta.json")),
  );
}

const list = (user: string) => request(app).get("/api/progress-reports").set("x-test-user", user);

describe("no APR yet", () => {
  it("lists nothing, and the sidebar is an empty (not failed) reference", async () => {
    const res = await list(FRESH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available: true, reports: [], maxDocuments: 12 });
    expect(res.body.maxUploadBytes).toBe(10 * 1024 * 1024);
    const side = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", FRESH);
    expect(side.status).toBe(200);
    expect(side.body).toEqual({ available: true, documents: [] });
  });

  it("requires sign-in for every route", async () => {
    const calls = [
      request(app).get("/api/progress-reports"),
      request(app).post("/api/progress-reports").send({}),
      request(app).get("/api/progress-reports/sidebar"),
      request(app).get("/api/progress-reports/1"),
      request(app).patch("/api/progress-reports/1").send({}),
      request(app).delete("/api/progress-reports/1"),
      request(app).get("/api/progress-reports/1/workbook"),
      request(app).get("/api/progress-reports/1/file"),
      request(app).put("/api/progress-reports/1/file").send({}),
    ];
    for (const call of calls) expect((await call).status).toBe(401);
  });
});

describe("several APR documents for one student", () => {
  let financeId: number;
  let csId: number;
  let minorId: number;
  /** The exact bytes uploaded (a rebuilt workbook differs in its zip timestamps). */
  let financeBytes: Buffer;

  it("adds a first Excel APR with a label, a category and an upload date", async () => {
    const before = Date.now();
    financeBytes = await buildAprFixture("finance-major");
    const res = await create(OWNER, financeBytes, {
      label: "  Finance Major  ",
      category: "primary_major",
      fileName: "finance-major.xlsx",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      label: "Finance Major",
      category: "primary_major",
      sourceFormat: "xlsx",
      importStatus: "ready",
      importErrorCode: null,
      sheetCount: 1,
      fileName: "finance-major.xlsx",
    });
    expect(res.body.fileFingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(new Date(res.body.uploadedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    // Never the storage location or the owner.
    expect(res.body).not.toHaveProperty("objectPath");
    expect(res.body).not.toHaveProperty("userId");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    financeId = res.body.id;
  });

  it("adds a second major and a minor WITHOUT replacing the first", async () => {
    const minor = await createFixture(OWNER, "data-science-minor", "Data Science Minor", "minor");
    const cs = await createFixture(OWNER, "computer-science-major", "Computer Science Major", "second_major");
    expect([minor.status, cs.status]).toEqual([201, 201]);
    minorId = minor.body.id;
    csId = cs.body.id;
    expect(new Set([financeId, csId, minorId]).size).toBe(3);
    expect(filesOnDisk()).toHaveLength(3);
  });

  it("lists them in a predictable order: majors, then minors — not insertion order", async () => {
    const res = await list(OWNER);
    expect(res.body.reports.map((r: any) => r.label)).toEqual([
      "Finance Major",
      "Computer Science Major",
      "Data Science Minor",
    ]);
    // The list carries metadata only.
    expect(JSON.stringify(res.body)).not.toMatch(/"rows"|"sheets"|"workbook"/);
  });

  it("FULL APR: every row and every column, including Academic Period, Units and Grade", async () => {
    const res = await request(app).get(`/api/progress-reports/${financeId}/workbook`).set("x-test-user", OWNER);
    expect(res.status).toBe(200);
    expect(res.body.report.id).toBe(financeId);
    const sheet = res.body.workbook.sheets[0];
    const header = sheet.rows.find((r: any) => r.cells[0].text === "Requirement");
    expect(header.cells.map((c: any) => c.text)).toEqual([
      "Requirement",
      "Status",
      "Remaining",
      "Satisfied With",
      "Academic Period",
      "Units",
      "Grade",
    ]);
    const texts = sheet.rows.flatMap((r: any) => r.cells.map((c: any) => c.text));
    expect(texts).toEqual(expect.arrayContaining(["Fall 2026 Quarter", "4.5", "B+", "A-", "CR"]));
    // No CampusVal interpretation rides along.
    expect(JSON.stringify(res.body)).not.toMatch(/completedCourses|matched|needs_review|inCatalog|parserVersion/);
  });

  it("each document's workbook is its own", async () => {
    const cs = await request(app).get(`/api/progress-reports/${csId}/workbook`).set("x-test-user", OWNER);
    const text = JSON.stringify(cs.body.workbook);
    expect(text).toContain("Computer Science Major : CSCI 10");
    expect(text).not.toContain("Finance Major");
  });

  it("SIDEBAR: all documents, grouped, with Academic Period / Units / Grade absent from the payload", async () => {
    const res = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", OWNER);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const docs = res.body.documents;
    expect(docs.map((d: any) => [d.report.label, d.state])).toEqual([
      ["Finance Major", "ready"],
      ["Computer Science Major", "ready"],
      ["Data Science Minor", "ready"],
    ]);
    expect(docs.every((d: any) => typeof d.report.uploadedAt === "string")).toBe(true);

    const finance = docs[0].sheets[0];
    expect(finance.columns.map((c: any) => c.header)).toEqual(["Requirement", "Status", "Remaining", "Satisfied With"]);
    expect(finance.groups.map((g: any) => g.label)).toEqual([
      "University Requirements",
      "Core",
      "Sample School of Business Core Knowledge",
      "Finance Major",
    ]);
    expect(docs[2].sheets[0].groups.map((g: any) => g.label)).toEqual(["Data Science Minor"]);

    const payload = JSON.stringify(res.body);
    for (const period of FIXTURE_PRIVATE_MARKERS.academicPeriods) expect(payload).not.toContain(period);
    const cells: string[] = docs.flatMap((d: any) =>
      d.sheets.flatMap((s: any) => s.groups.flatMap((g: any) => g.rows.flatMap((r: any) => r.cells))),
    );
    for (const token of [...FIXTURE_PRIVATE_MARKERS.grades, ...FIXTURE_PRIVATE_MARKERS.units]) {
      expect(cells).not.toContain(token);
    }
    // Workday's wording reaches the sidebar untouched.
    expect(cells).toContain("Core: LSB: 2nd Language (Level 2)");
    expect(cells).toContain("Not Satisfied");
    expect(payload).not.toMatch(/objectPath|completedCourses|inCatalog/);
  });

  it("renames / re-categorises one document without touching its file or its date", async () => {
    const before = await request(app).get(`/api/progress-reports/${csId}`).set("x-test-user", OWNER);
    const res = await request(app)
      .patch(`/api/progress-reports/${csId}`)
      .set("x-test-user", OWNER)
      .send({ label: "CS Major (BS)", category: "additional_major" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ label: "CS Major (BS)", category: "additional_major" });
    expect(res.body.uploadedAt).toBe(before.body.uploadedAt);
    expect(res.body.fileFingerprint).toBe(before.body.fileFingerprint);

    const bad = await request(app).patch(`/api/progress-reports/${csId}`).set("x-test-user", OWNER).send({ label: "   " });
    expect(bad.status).toBe(400);
    const badCategory = await request(app)
      .patch(`/api/progress-reports/${csId}`)
      .set("x-test-user", OWNER)
      .send({ category: "valedictorian" });
    expect(badCategory.status).toBe(400);
  });

  it("REPLACE: swaps only the selected document, moves its upload date, and removes the old file", async () => {
    const before = await list(OWNER);
    const old = before.body.reports.find((r: any) => r.id === minorId);
    const others = before.body.reports.filter((r: any) => r.id !== minorId);
    await new Promise((r) => setTimeout(r, 25));

    const bytes = await buildAprFixture("two-sheets");
    const objectPath = await putBytes(OWNER, bytes, XLSX_TYPE, "minor-v2.xlsx");
    expect(filesOnDisk()).toHaveLength(4);
    const res = await request(app)
      .put(`/api/progress-reports/${minorId}/file`)
      .set("x-test-user", OWNER)
      .send({ objectPath, fileName: "minor-v2.xlsx", fileSize: bytes.length, contentType: XLSX_TYPE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: minorId, label: "Data Science Minor", fileName: "minor-v2.xlsx", sheetCount: 3 });
    expect(new Date(res.body.uploadedAt).getTime()).toBeGreaterThan(new Date(old.uploadedAt).getTime());
    expect(res.body.fileFingerprint).not.toBe(old.fileFingerprint);
    expect(filesOnDisk()).toHaveLength(3);

    // The displayed workbook is the NEW file's — the old copy did not survive.
    const wb = await request(app).get(`/api/progress-reports/${minorId}/workbook`).set("x-test-user", OWNER);
    expect(wb.body.workbook.sheets.map((s: any) => s.name)).toEqual(["Finance Major", "Data Science Minor", "Empty"]);

    const after = await list(OWNER);
    expect(after.body.reports.filter((r: any) => r.id !== minorId)).toEqual(others);
  });

  it("REPLACE with a bad file keeps the last good file, date and workbook", async () => {
    const before = await request(app).get(`/api/progress-reports/${financeId}`).set("x-test-user", OWNER);
    const good = await buildAprFixture("finance-major");
    const broken = good.subarray(0, Math.floor(good.length / 2));
    const objectPath = await putBytes(OWNER, broken, XLSX_TYPE, "broken.xlsx");
    const res = await request(app)
      .put(`/api/progress-reports/${financeId}/file`)
      .set("x-test-user", OWNER)
      .send({ objectPath, fileName: "broken.xlsx", fileSize: broken.length, contentType: XLSX_TYPE });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("malformed_workbook");
    expect(res.body.error).not.toMatch(/at .*\.(ts|js)|Error:|stack/i);

    const after = await request(app).get(`/api/progress-reports/${financeId}`).set("x-test-user", OWNER);
    expect(after.body).toEqual(before.body);
    const wb = await request(app).get(`/api/progress-reports/${financeId}/workbook`).set("x-test-user", OWNER);
    expect(JSON.stringify(wb.body.workbook)).toContain("Finance Major : FNCE 121 & 124");
    // The rejected upload was removed; nothing accumulates.
    expect(filesOnDisk()).toHaveLength(3);
  });

  it("streams the original file of the selected document, as a download, never cached", async () => {
    const res = await request(app)
      .get(`/api/progress-reports/${financeId}/file`)
      .set("x-test-user", OWNER)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(XLSX_TYPE);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="academic-progress-report\.xlsx"$/);
    expect(Buffer.compare(res.body as Buffer, financeBytes)).toBe(0);
  });

  it("DELETE removes one document and its file, and leaves the others alone", async () => {
    const res = await request(app).delete(`/api/progress-reports/${csId}`).set("x-test-user", OWNER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(filesOnDisk()).toHaveLength(2);
    const after = await list(OWNER);
    expect(after.body.reports.map((r: any) => r.id).sort()).toEqual([financeId, minorId].sort());
    expect((await request(app).get(`/api/progress-reports/${csId}`).set("x-test-user", OWNER)).status).toBe(404);
    expect((await request(app).get(`/api/progress-reports/${csId}/workbook`).set("x-test-user", OWNER)).status).toBe(404);
    // Deleting again is a clean 404, not an error.
    expect((await request(app).delete(`/api/progress-reports/${csId}`).set("x-test-user", OWNER)).status).toBe(404);
  });

  it("deleting the last document leaves no record, no file and no leftover notes", async () => {
    await db.insert(progressReportMappingsTable).values({ userId: OWNER, rawCode: "ENGL 2A", courseCode: "ENGL 1A" });
    for (const id of [financeId, minorId]) {
      expect((await request(app).delete(`/api/progress-reports/${id}`).set("x-test-user", OWNER)).status).toBe(200);
    }
    expect((await list(OWNER)).body.reports).toEqual([]);
    expect(filesOnDisk()).toHaveLength(0);
    expect(
      await db.select().from(progressReportMappingsTable).where(eq(progressReportMappingsTable.userId, OWNER)),
    ).toHaveLength(0);
  });
});

describe("file validation", () => {
  it("accepts only a supported extension whose declared type agrees", () => {
    expect(resolveSourceFormat("apr.xlsx", XLSX_TYPE)).toBe("xlsx");
    expect(resolveSourceFormat("APR.XLSX", "application/octet-stream")).toBe("xlsx");
    expect(resolveSourceFormat("apr.xlsx", "")).toBe("xlsx");
    expect(resolveSourceFormat("apr.pdf", PDF_TYPE)).toBe("pdf");
    expect(resolveSourceFormat("apr.xlsx", PDF_TYPE)).toBeNull();
    expect(resolveSourceFormat("apr.pdf", XLSX_TYPE)).toBeNull();
    expect(resolveSourceFormat("apr.xls", "application/vnd.ms-excel")).toBeNull();
    expect(resolveSourceFormat("apr.xlsm", XLSX_TYPE)).toBeNull();
    expect(resolveSourceFormat("apr.csv", "text/csv")).toBeNull();
    expect(resolveSourceFormat("apr", XLSX_TYPE)).toBeNull();
  });

  it("rejects an unsupported type, an oversized file, a bad path and a missing label", async () => {
    const send = (body: object) => request(app).post("/api/progress-reports").set("x-test-user", FRESH).send(body);
    const base = { objectPath: "/objects/uploads/x/y", fileName: "apr.xlsx", fileSize: 100, contentType: XLSX_TYPE, label: "A" };

    const type = await send({ ...base, fileName: "apr.txt", contentType: "text/plain" });
    expect(type.status).toBe(400);
    expect(type.body.code).toBe("unsupported_type");
    expect(type.body.error).toMatch(/\.xlsx/);

    const size = await send({ ...base, fileSize: 11 * 1024 * 1024 });
    expect(size.status).toBe(400);
    expect(size.body.error).toMatch(/10 MB/);

    expect((await send({ ...base, objectPath: "relative/path" })).status).toBe(400);
    expect((await send({ ...base, label: undefined })).status).toBe(400);
    expect((await send({ ...base, label: "   " })).status).toBe(400);
    expect((await send({ ...base, label: "x".repeat(81) })).status).toBe(400);
    expect((await send({ ...base, category: "not-a-category" })).status).toBe(400);
    expect((await list(FRESH)).body.reports).toEqual([]);
  });

  it("honours a configured upload limit", async () => {
    process.env["APR_MAX_UPLOAD_MB"] = "1";
    try {
      const res = await request(app)
        .post("/api/progress-reports")
        .set("x-test-user", FRESH)
        .send({ objectPath: "/objects/uploads/x/y", fileName: "a.xlsx", fileSize: 2 * 1024 * 1024, contentType: XLSX_TYPE, label: "A" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1 MB/);
      expect((await list(FRESH)).body.maxUploadBytes).toBe(1024 * 1024);
    } finally {
      delete process.env["APR_MAX_UPLOAD_MB"];
    }
  });

  it.each([
    ["a legacy .xls / encrypted file renamed .xlsx", Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]), "legacy_xls_or_encrypted"],
    ["text renamed .xlsx", Buffer.from("this is not a workbook at all, just some text"), "not_a_workbook"],
  ])("rejects %s and leaves nothing behind", async (_name, bytes, code) => {
    const res = await create(FRESH, bytes, { label: "Bad" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(code);
    expect(res.body.error).not.toMatch(/Error:|\bat\b .*:\d+/);
    expect((await list(FRESH)).body.reports).toEqual([]);
    expect(filesOnDisk()).toHaveLength(0);
  });

  it("rejects a file that claims to be a PDF but is not", async () => {
    const res = await create(FRESH, Buffer.from("<html>not a pdf</html>"), {
      label: "Bad",
      fileName: "apr.pdf",
      contentType: PDF_TYPE,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("unsupported_type");
  });

  it("refuses an upload whose object was never stored", async () => {
    const { uploadPathOwnerSegment } = await import("../lib/uploadPath");
    const res = await request(app)
      .post("/api/progress-reports")
      .set("x-test-user", FRESH)
      .send({
        objectPath: `/objects/uploads/${uploadPathOwnerSegment(FRESH)}/00000000-0000-4000-8000-000000000000`,
        fileName: "a.xlsx",
        fileSize: 10,
        contentType: XLSX_TYPE,
        label: "A",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe("documents that need care do not break the others", () => {
  let goodId: number;

  it("keeps workbook text inert: markup, formulas and links arrive as plain text", async () => {
    const res = await createFixture(FRESH, "hostile-content", "Hostile");
    expect(res.status).toBe(201);
    const wb = await request(app).get(`/api/progress-reports/${res.body.id}/workbook`).set("x-test-user", FRESH);
    const text = JSON.stringify(wb.body);
    expect(text).toContain('<script>alert(\\"x\\")</script>');
    expect(text).not.toMatch(/javascript:|NOW\(\)|1\+1/);
    expect(wb.headers["content-type"]).toMatch(/^application\/json/);
    await request(app).delete(`/api/progress-reports/${res.body.id}`).set("x-test-user", FRESH);
  });

  it("an unrecognised Workday layout: the full APR shows everything, the sidebar sends no rows", async () => {
    const good = await createFixture(FRESH, "finance-major", "Finance Major", "primary_major");
    goodId = good.body.id;
    const odd = await createFixture(FRESH, "unrecognized-layout", "New Layout", "other");
    expect(odd.status).toBe(201);

    const wb = await request(app).get(`/api/progress-reports/${odd.body.id}/workbook`).set("x-test-user", FRESH);
    expect(JSON.stringify(wb.body.workbook)).toContain("Calculus");

    const side = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", FRESH);
    expect(side.body.documents.map((d: any) => [d.report.label, d.state])).toEqual([
      ["Finance Major", "ready"],
      ["New Layout", "unrecognized_layout"],
    ]);
    const oddDoc = side.body.documents[1];
    expect(oddDoc.sheets[0]).toMatchObject({ structured: false, groups: [], warnings: ["header_not_found"] });
    expect(JSON.stringify(oddDoc)).not.toMatch(/A-|B\+|Fall 2025/);
    // The healthy document is fully there.
    expect(side.body.documents[0].sheets[0].groups.length).toBe(4);
  });

  it("a PDF is kept as an original: no workbook, no sidebar rows, still downloadable", async () => {
    const res = await create(FRESH, PDF_BYTES, { label: "Old PDF export", fileName: "apr.pdf", contentType: PDF_TYPE });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sourceFormat: "pdf", importStatus: "ready", sheetCount: 0 });
    const wb = await request(app).get(`/api/progress-reports/${res.body.id}/workbook`).set("x-test-user", FRESH);
    expect(wb.body.workbook).toBeNull();
    const side = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", FRESH);
    expect(side.body.documents.find((d: any) => d.report.id === res.body.id).state).toBe("original_only");
    const file = await request(app).get(`/api/progress-reports/${res.body.id}/file`).set("x-test-user", FRESH);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe(PDF_TYPE);
    expect(file.headers["content-disposition"]).toMatch(/^inline/);
  });

  it("a document whose stored file has vanished is flagged alone", async () => {
    const lost = await createFixture(FRESH, "data-science-minor", "Lost Minor", "minor");
    const [row] = await db.select().from(progressReportsTable).where(eq(progressReportsTable.id, lost.body.id));
    // Simulate a record from before workbooks were stored, whose original is gone.
    await db.update(progressReportsTable).set({ workbook: null }).where(eq(progressReportsTable.id, lost.body.id));
    const seg = row!.objectPath.split("/");
    rmSync(join(dir, "progress-reports", seg[3]!, seg[4]!), { force: true });

    const side = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", FRESH);
    expect(side.status).toBe(200);
    const byLabel = Object.fromEntries(side.body.documents.map((d: any) => [d.report.label, d]));
    expect(byLabel["Lost Minor"].state).toBe("import_failed");
    expect(byLabel["Lost Minor"].report).toMatchObject({ importStatus: "failed", importErrorCode: "storage_failure" });
    expect(byLabel["Lost Minor"].report.importErrorMessage).toMatch(/storage/i);
    expect(byLabel["Finance Major"].state).toBe("ready");
    expect((await list(FRESH)).body.reports.find((r: any) => r.id === goodId).importStatus).toBe("ready");
    expect((await request(app).get(`/api/progress-reports/${lost.body.id}/file`).set("x-test-user", FRESH)).status).toBe(404);
  });

  it("caps how many documents one student may keep", async () => {
    const current = (await list(FRESH)).body.reports.length;
    const filler = Array.from({ length: 12 - current }, (_, i) => ({
      userId: FRESH,
      label: `Filler ${i}`,
      fileName: "f.pdf",
      fileSize: 1,
      contentType: PDF_TYPE,
      sourceFormat: "pdf",
      objectPath: `/objects/uploads/filler/${i}`,
      parseStatus: "parsed",
    }));
    if (filler.length > 0) await db.insert(progressReportsTable).values(filler);
    const res = await createFixture(FRESH, "finance-major", "One too many");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/up to 12/);
  });
});

describe("a Workday PDF export", () => {
  let id: number;

  it("is accepted, and its table is read for the planning sidebar", async () => {
    const res = await create(PDFUSER, buildAprPdf({ fuseFirstStatus: true }), {
      label: "My Academic Progress",
      fileName: "View_My_Academic_Progress.pdf",
      contentType: PDF_TYPE,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ sourceFormat: "pdf", importStatus: "ready", sheetCount: 1, tableFromPdf: true });
    id = res.body.id;
  });

  it("SIDEBAR: every program block, grouped — and no period, units, grade or GPA line", async () => {
    const side = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", PDFUSER);
    const doc = side.body.documents[0];
    expect(doc.state).toBe("ready");
    expect(doc.report.tableFromPdf).toBe(true);
    const sheet = doc.sheets[0];
    expect(sheet.columns.map((c: any) => c.header)).toEqual(["Requirement", "Status", "Remaining", "Registrations Used"]);
    expect([...new Set(sheet.groups.map((g: any) => g.block))]).toEqual([
      "Finance Major Requirements",
      "Mathematics Major Requirements",
      "Healthcare Innovation and Design Minor Requirements",
      "Sample Center Requirements",
    ]);
    const payload = JSON.stringify(side.body);
    for (const period of FIXTURE_PRIVATE_MARKERS.academicPeriods) expect(payload).not.toContain(period);
    for (const hidden of ["Program of Study GPA", "3.100", "2.800", "Last Evaluated"]) expect(payload).not.toContain(hidden);
    const cells: string[] = sheet.groups.flatMap((g: any) => g.rows.flatMap((r: any) => r.cells));
    for (const token of ["A-", "B+", "CR", "4.5"]) expect(cells).not.toContain(token);
    expect(cells).toContain("Mathematics Major GPA");
    expect(cells).toContain("Core: CAS: CTW 1");
  });

  it("FULL: the table read from the PDF carries all seven columns; the original PDF is still served", async () => {
    const wb = await request(app).get(`/api/progress-reports/${id}/workbook`).set("x-test-user", PDFUSER);
    expect(wb.body.workbook.sourceFormat).toBe("pdf");
    expect(wb.body.workbook.warnings).toContain("reconstructed_from_pdf");
    const texts = wb.body.workbook.sheets[0].rows.flatMap((r: any) => r.cells.map((c: any) => c.text));
    expect(texts).toEqual(expect.arrayContaining(["Academic Period", "Units", "Grade", "Fall 2025 Quarter", "4.5", "B+"]));
    const file = await request(app).get(`/api/progress-reports/${id}/file`).set("x-test-user", PDFUSER);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe(PDF_TYPE);
    expect(file.headers["content-disposition"]).toMatch(/^inline/);
  });

  it("a PDF uploaded BEFORE this release is read the first time it is opened, keeping its upload date", async () => {
    const bytes = buildAprPdf();
    const objectPath = await putBytes(PDFUSER, bytes, PDF_TYPE, "older.pdf");
    const uploadedAt = new Date("2026-09-09T17:00:00Z");
    const [row] = await db
      .insert(progressReportsTable)
      .values({
        userId: PDFUSER,
        fileName: "older.pdf",
        fileSize: bytes.length,
        contentType: PDF_TYPE,
        sourceFormat: "pdf",
        objectPath,
        uploadedAt,
        parsed: { completedCourses: [], possibleCourses: [], notes: [], parserVersion: "hierarchical-v4" },
        parseStatus: "parsed",
      })
      .returning();
    const side = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", PDFUSER);
    const doc = side.body.documents.find((d: any) => d.report.id === row!.id);
    expect(doc.state).toBe("ready");
    expect(doc.report.uploadedAt).toBe(uploadedAt.toISOString());
    expect(doc.sheets[0].groups.length).toBe(9);
    expect(JSON.stringify(doc)).not.toMatch(/completedCourses|parserVersion/);
  });

  it("a PDF that is not an Academic Progress report stays an original, and is tried only once", async () => {
    const res = await create(PDFUSER, buildAprPdf({ withoutHeader: true, programs: [] }), {
      label: "Some other PDF",
      fileName: "other.pdf",
      contentType: PDF_TYPE,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ importStatus: "ready", sheetCount: 0, tableFromPdf: false, importErrorCode: null });
    const side = await request(app).get("/api/progress-reports/sidebar").set("x-test-user", PDFUSER);
    expect(side.body.documents.find((d: any) => d.report.id === res.body.id).state).toBe("original_only");
    const [stored] = await db.select().from(progressReportsTable).where(eq(progressReportsTable.id, res.body.id));
    expect(stored!.importError).toBe("unrecognized_pdf");
  });
});

describe("a record from the single-APR era", () => {
  it("is imported from its stored original on first read, keeping its original upload date", async () => {
    const bytes = await buildAprFixture("computer-science-major");
    const objectPath = await putBytes(LEGACY, bytes, XLSX_TYPE, "old.xlsx");
    const uploadedAt = new Date("2026-08-15T17:00:00Z");
    // Exactly what migration 0002 leaves behind for an existing xlsx upload.
    const [row] = await db
      .insert(progressReportsTable)
      .values({
        userId: LEGACY,
        fileName: "old.xlsx",
        fileSize: bytes.length,
        contentType: XLSX_TYPE,
        sourceFormat: "xlsx",
        objectPath,
        uploadedAt,
        parsed: { completedCourses: [{ code: "CSCI 10" }], possibleCourses: [], notes: [], parserVersion: "hierarchical-v4" },
        parseStatus: "parsed",
      })
      .returning();

    const res = await list(LEGACY);
    expect(res.body.reports).toHaveLength(1);
    expect(res.body.reports[0]).toMatchObject({
      id: row!.id,
      label: "Academic Progress Report",
      category: "other",
      importStatus: "ready",
      sheetCount: 1,
    });
    expect(res.body.reports[0].uploadedAt).toBe(uploadedAt.toISOString());
    // The old interpretation is never served.
    const wb = await request(app).get(`/api/progress-reports/${row!.id}/workbook`).set("x-test-user", LEGACY);
    expect(JSON.stringify(wb.body)).not.toMatch(/completedCourses|parserVersion/);
    expect(JSON.stringify(wb.body.workbook)).toContain("Computer Science Major : CSCI 10");
  });

  it("can then have MORE documents added beside it", async () => {
    const res = await createFixture(LEGACY, "data-science-minor", "Data Science Minor", "minor");
    expect(res.status).toBe(201);
    expect((await list(LEGACY)).body.reports.map((r: any) => r.label)).toEqual([
      "Data Science Minor",
      "Academic Progress Report",
    ]);
  });
});

describe("identity guard", () => {
  it("refuses a workbook that names a different student ID than the profile, without echoing it", async () => {
    await db.insert(studentProfilesTable).values({
      userId: IDENT,
      name: "Synthetic Student",
      studentId: "W1111111",
      studentType: "first_year",
      college: "Leavey School of Business",
      major: "Finance",
      startTerm: "fall",
      startYear: 2025,
      expectedGradTerm: "spring",
      expectedGradYear: 2029,
      currentTerm: "fall",
      currentYear: 2026,
    } as any);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("View My Academic Progress");
    ws.addRow(["Student ID:", "W9999999"]);
    ws.addRow(["Requirement", "Status", "Grade"]);
    ws.addRow(["Core: X", "Satisfied", "A"]);
    const res = await create(IDENT, Buffer.from(await wb.xlsx.writeBuffer()), { label: "Someone else's" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("identity_mismatch");
    expect(JSON.stringify(res.body)).not.toContain("W9999999");
    expect((await list(IDENT)).body.reports).toEqual([]);
  });

  it("accepts a workbook that states no ID", async () => {
    const res = await createFixture(IDENT, "finance-major", "Mine");
    expect(res.status).toBe(201);
  });
});

describe("what the server writes to its log", () => {
  it("records events and categories, never workbook text, file names or storage paths", () => {
    const text = JSON.stringify(logged);
    expect(text).toContain("apr_upload_started");
    expect(text).toContain("apr_workbook_processed");
    expect(text).toContain("apr_replacement_succeeded");
    expect(text).toContain("apr_processing_failed");
    for (const secret of [
      "Finance Major",
      "FNCE 121",
      "Not Satisfied",
      "Fall 2026 Quarter",
      "B+",
      "finance-major.xlsx",
      "/objects/uploads",
      "W9999999",
    ]) {
      expect(text, secret).not.toContain(secret);
    }
  });
});

describe("row-level scoping in the database", () => {
  it("every document created here belongs to the user who created it", async () => {
    const rows = await db
      .select({ userId: progressReportsTable.userId, objectPath: progressReportsTable.objectPath })
      .from(progressReportsTable)
      .where(and(inArray(progressReportsTable.userId, [IDENT, LEGACY])));
    const { uploadPathOwnerSegment } = await import("../lib/uploadPath");
    for (const row of rows) {
      expect(row.objectPath.startsWith(`/objects/uploads/${uploadPathOwnerSegment(row.userId)}/`)).toBe(true);
    }
  });
});
