/**
 * Degree Checksheets, end to end, against the REAL local-filesystem storage
 * provider and the REAL database (only Clerk auth is stubbed): upload link ->
 * PUT bytes -> create -> list -> preview -> tracking -> rename -> replace ->
 * delete.
 *
 * All documents are synthetic (see __fixtures__/checksheets/build-fixtures.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
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

import {
  db,
  academicPlansTable,
  degreeChecksheetAnnotationsTable,
  degreeChecksheetDocumentsTable,
  planItemsTable,
  progressReportsTable,
} from "@workspace/db";
import { resetPrivateObjectStorageForTests } from "../lib/storage";
import {
  buildChecksheetFixture,
  CHECKSHEET_FIXTURE_FILES,
  type ChecksheetFixtureName,
} from "../__fixtures__/checksheets/build-fixtures";
import degreeChecksheetsRouter from "./degree-checksheets";
import storageRouter from "./storage";

const RUN = Date.now();
const OWNER = `dcs-owner-${RUN}`;
const FRESH = `dcs-fresh-${RUN}`;
const MULTI = `dcs-multi-${RUN}`;
const TRACK = `dcs-track-${RUN}`;
const REPLACE = `dcs-replace-${RUN}`;
const FORMATS = `dcs-formats-${RUN}`;
const LIMIT = `dcs-limit-${RUN}`;
const USERS = [OWNER, FRESH, MULTI, TRACK, REPLACE, FORMATS, LIMIT];

let dir: string;
let app: express.Express;
const saved = { ...process.env };
/** Everything the routes logged, to prove no document content is ever written. */
const logged: unknown[] = [];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "campusval-dcs-"));
  process.env["PRIVATE_STORAGE_PROVIDER"] = "local";
  process.env["PRIVATE_STORAGE_DIR"] = dir;
  process.env["STORAGE_SIGNING_SECRET"] = "c".repeat(48);
  delete process.env["CHECKSHEET_MAX_UPLOAD_MB"];
  resetPrivateObjectStorageForTests();

  const capture = (...args: unknown[]) => void logged.push(args);
  app = express();
  app.use((req, _res, next) => {
    (req as any).log = { info: capture, warn: capture, error: capture, debug: capture };
    next();
  });
  app.use(express.json());
  app.use("/api", storageRouter);
  app.use("/api", degreeChecksheetsRouter);
});

afterAll(async () => {
  await db.delete(degreeChecksheetDocumentsTable).where(inArray(degreeChecksheetDocumentsTable.userId, USERS));
  rmSync(dir, { recursive: true, force: true });
  process.env = saved;
  resetPrivateObjectStorageForTests();
});

const pathOf = (u: string) => (u.startsWith("/") ? u : new URL(u).pathname);
const as = (user: string, r: request.Test) => r.set("x-test-user", user);

async function putBytes(user: string, bytes: Buffer, contentType: string, fileName: string) {
  const target = await as(user, request(app).post("/api/degree-checksheets/upload-url")).send({
    name: fileName,
    size: bytes.length,
    contentType,
  });
  expect(target.status, JSON.stringify(target.body)).toBe(200);
  const put = await request(app)
    .put(pathOf(target.body.uploadURL))
    .set("Content-Type", target.body.contentType)
    .send(bytes);
  expect(put.status).toBe(200);
  return target.body.objectPath as string;
}

interface Meta {
  title: string;
  category?: string;
  programName?: string | null;
  programRole?: string | null;
  school?: string | null;
  academicYearLabel?: string | null;
  sourceUrl?: string | null;
}

async function createRaw(user: string, bytes: Buffer, fileName: string, contentType: string, meta: Meta) {
  const objectPath = await putBytes(user, bytes, contentType, fileName);
  return as(user, request(app).post("/api/degree-checksheets")).send({
    objectPath,
    fileName,
    fileSize: bytes.length,
    contentType,
    ...meta,
  });
}

/**
 * Each fixture is built ONCE. A workbook records the moment it was written, so
 * two builds of the same fixture are different files; a test that means "the
 * same file again" must upload the same bytes.
 */
const built = new Map<ChecksheetFixtureName, Buffer>();
async function fixtureBytes(name: ChecksheetFixtureName): Promise<Buffer> {
  let bytes = built.get(name);
  if (!bytes) {
    bytes = await buildChecksheetFixture(name);
    built.set(name, bytes);
  }
  return bytes;
}

async function create(user: string, name: ChecksheetFixtureName, meta: Meta) {
  const file = CHECKSHEET_FIXTURE_FILES[name];
  const bytes = await fixtureBytes(name);
  const res = await createRaw(user, bytes, file.fileName, file.contentType, meta);
  return { res, bytes };
}

async function replaceWith(user: string, id: number, name: ChecksheetFixtureName) {
  const file = CHECKSHEET_FIXTURE_FILES[name];
  const bytes = await fixtureBytes(name);
  const objectPath = await putBytes(user, bytes, file.contentType, file.fileName);
  const res = await as(user, request(app).put(`/api/degree-checksheets/${id}/file`)).send({
    objectPath,
    fileName: file.fileName,
    fileSize: bytes.length,
    contentType: file.contentType,
  });
  return { res, bytes };
}

const list = (user: string) => as(user, request(app).get("/api/degree-checksheets"));
const annotations = (user: string, id: number) => as(user, request(app).get(`/api/degree-checksheets/${id}/annotations`));
const annotate = (user: string, id: number, body: object) =>
  as(user, request(app).post(`/api/degree-checksheets/${id}/annotations`)).send(body);
const patch = (user: string, id: number, annotationId: number, body: object) =>
  as(user, request(app).patch(`/api/degree-checksheets/${id}/annotations/${annotationId}`)).send(body);

async function originalOf(user: string, id: number): Promise<Buffer> {
  const res = await as(user, request(app).get(`/api/degree-checksheets/${id}/file`))
    .buffer(true)
    .parse((r, done) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => done(null, Buffer.concat(chunks)));
    });
  expect(res.status).toBe(200);
  return res.body as Buffer;
}

function filesOnDisk(): string[] {
  const root = join(dir, "progress-reports");
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((owner) =>
    readdirSync(join(root, owner))
      .filter((f) => !f.endsWith(".meta.json"))
      .map((f) => join(root, owner, f)),
  );
}

/** Where ONE document's file sits on disk (other tests upload identical bytes). */
async function diskPathOf(id: number): Promise<string> {
  const [row] = await db
    .select({ objectPath: degreeChecksheetDocumentsTable.objectPath })
    .from(degreeChecksheetDocumentsTable)
    .where(eq(degreeChecksheetDocumentsTable.id, id));
  const [owner, object] = row!.objectPath.replace("/objects/uploads/", "").split("/");
  return join(dir, "progress-reports", owner!, object!);
}

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * The major workbook: title (row index 0), blank, header (2), the "Lower
 * Division" heading (3), then the first item, "Introduction to Widgetry" (4).
 */
const STATUS_CELL = { sheet: 0, row: 4, col: 2 };
const TERM_CELL = { sheet: 0, row: 4, col: 3 };
/** The next item down, "Widget Mathematics I". */
const NEXT_STATUS_CELL = { sheet: 0, row: 5, col: 2 };
const NEXT_TERM_CELL = { sheet: 0, row: 5, col: 3 };

describe("nothing uploaded yet", () => {
  it("lists nothing, with the limits the page needs", async () => {
    const res = await list(FRESH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      available: true,
      documents: [],
      maxUploadBytes: 20 * 1024 * 1024,
      maxDocuments: 30,
      acceptedExtensions: [".pdf", ".xlsx", ".xls", ".docx", ".png", ".jpg", ".jpeg"],
    });
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("requires sign-in for every route", async () => {
    const calls = [
      request(app).get("/api/degree-checksheets"),
      request(app).post("/api/degree-checksheets").send({}),
      request(app).post("/api/degree-checksheets/upload-url").send({}),
      request(app).get("/api/degree-checksheets/1"),
      request(app).patch("/api/degree-checksheets/1").send({}),
      request(app).delete("/api/degree-checksheets/1"),
      request(app).get("/api/degree-checksheets/1/render"),
      request(app).get("/api/degree-checksheets/1/file"),
      request(app).put("/api/degree-checksheets/1/file").send({}),
      request(app).get("/api/degree-checksheets/1/annotations"),
      request(app).post("/api/degree-checksheets/1/annotations").send({}),
      request(app).patch("/api/degree-checksheets/1/annotations/1").send({}),
      request(app).delete("/api/degree-checksheets/1/annotations/1"),
    ];
    for (const call of calls) expect((await call).status).toBe(401);
  });

  it("reports the feature unavailable, not broken, when storage is not configured", async () => {
    const provider = process.env["PRIVATE_STORAGE_PROVIDER"];
    const storageDir = process.env["PRIVATE_STORAGE_DIR"];
    delete process.env["PRIVATE_STORAGE_PROVIDER"];
    delete process.env["PRIVATE_STORAGE_DIR"];
    try {
      const res = await list(FRESH);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ available: false, documents: [] });
      const link = await as(FRESH, request(app).post("/api/degree-checksheets/upload-url")).send({
        name: "a.pdf",
        size: 10,
        contentType: "application/pdf",
      });
      expect(link.status).toBe(503);
    } finally {
      process.env["PRIVATE_STORAGE_PROVIDER"] = provider;
      process.env["PRIVATE_STORAGE_DIR"] = storageDir;
    }
  });
});

describe("uploading a document", () => {
  let id: number;
  let uploaded: Buffer;

  it("stores the file and its descriptive metadata", async () => {
    const before = Date.now();
    const { res, bytes } = await create(OWNER, "major-workbook", {
      title: "  Applied Widgetry   Major Checksheet ",
      category: "major_checksheet",
      programName: "Applied Widgetry",
      programRole: "major",
      school: "Sample School of Widgets",
      academicYearLabel: "Fall 2025 and Later",
      sourceUrl: "https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    uploaded = bytes;
    id = res.body.id;
    expect(res.body).toMatchObject({
      title: "Applied Widgetry Major Checksheet",
      category: "major_checksheet",
      programName: "Applied Widgetry",
      programRole: "major",
      school: "Sample School of Widgets",
      academicYearLabel: "Fall 2025 and Later",
      sourceUrl: "https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/",
      fileName: "applied-widgetry-major.xlsx",
      fileSize: bytes.length,
      sourceFormat: "xlsx",
      sourceVersion: 1,
      renderStatus: "ready",
      renderNoteCode: null,
      renderNoteMessage: null,
      previewKind: "spreadsheet",
      inlineTracking: true,
      fileFingerprint: sha(bytes).slice(0, 12),
    });
    const uploadedAt = new Date(res.body.uploadedAt).getTime();
    expect(uploadedAt).toBeGreaterThanOrEqual(before - 5_000);
    expect(uploadedAt).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("never sends the owner, the storage path or the full hash to the browser", async () => {
    const meta = await as(OWNER, request(app).get(`/api/degree-checksheets/${id}`));
    const all = await list(OWNER);
    const text = JSON.stringify([meta.body, all.body]);
    expect(text).not.toMatch(/userId|user_id|objectPath|object_path|\/objects\/|fileHash/);
    expect(text).not.toContain(OWNER);
    expect(text).not.toContain(sha(uploaded));
  });

  it("serves the preview: the workbook as uploaded, with the student's columns marked", async () => {
    const res = await as(OWNER, request(app).get(`/api/degree-checksheets/${id}/render`));
    expect(res.status).toBe(200);
    expect(res.body.document.id).toBe(id);
    const sheet = res.body.render.sheets[0];
    expect(res.body.render.kind).toBe("spreadsheet");
    expect(sheet.rows.flatMap((r: any) => r.cells.map((c: any) => c.text))).toEqual(
      expect.arrayContaining(["Requirement", "Widget Ethics", "WIDG 130", "Also satisfies a sample Core area"]),
    );
    expect(sheet.tracking.columns.map((c: any) => c.header)).toEqual(["Status", "Quarter Completed"]);
    expect(sheet.tracking.cells).toContainEqual({ r: 4, c: 2, field: "status" });
    // A section heading is not an item.
    expect(sheet.tracking.cells.some((c: any) => c.r === 3)).toBe(false);
    // Fingerprints are the server's own bookkeeping.
    expect(JSON.stringify(res.body.render)).not.toMatch(/fingerprint|textHash/i);
  });

  it("serves the original byte for byte, as a private download", async () => {
    const res = await as(OWNER, request(app).get(`/api/degree-checksheets/${id}/file`));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers["content-disposition"]).toBe('attachment; filename="degree-checksheet.xlsx"');
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.headers["content-security-policy"]).toBe("sandbox; default-src 'none'");
    expect(sha(await originalOf(OWNER, id))).toBe(sha(uploaded));
  });

  it("requires a title, and refuses unknown types and unsafe links", async () => {
    const bytes = await buildChecksheetFixture("major-pdf");
    const objectPath = await putBytes(OWNER, bytes, "application/pdf", "a.pdf");
    const base = { objectPath, fileName: "a.pdf", fileSize: bytes.length, contentType: "application/pdf" };
    const post = (body: object) => as(OWNER, request(app).post("/api/degree-checksheets")).send({ ...base, ...body });

    expect((await post({})).status).toBe(400);
    expect((await post({ title: "   " })).status).toBe(400);
    expect((await post({ title: "x".repeat(121) })).status).toBe(400);
    expect((await post({ title: "T", category: "official_audit" })).status).toBe(400);
    expect((await post({ title: "T", programRole: "dean" })).status).toBe(400);
    for (const sourceUrl of ["javascript:alert(1)", "data:text/html,x", "www.scu.edu"]) {
      const res = await post({ title: "T", sourceUrl });
      expect(res.status, sourceUrl).toBe(400);
      expect(res.body.error).toMatch(/http/);
    }
    // None of those left a document behind.
    expect((await list(OWNER)).body.documents).toHaveLength(1);
    // The same upload is still usable once the details are valid.
    const ok = await post({ title: "Applied Widgetry (PDF)" });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ category: "other", programName: null, sourceUrl: null, previewKind: "pdf" });
  });
});

describe("every supported format", () => {
  const cases: [ChecksheetFixtureName, string, string | null, boolean][] = [
    ["major-pdf", "pdf", "pdf", false],
    ["minor-workbook", "xlsx", "spreadsheet", true],
    ["advising-docx", "docx", "document", true],
    ["flowchart-png", "png", "image", false],
    ["flowchart-jpg", "jpg", "image", false],
  ];
  const ids: Record<string, number> = {};

  for (const [name, format, kind, inline] of cases) {
    it(`accepts ${format} and previews it as ${kind}`, async () => {
      const { res } = await create(FORMATS, name, { title: name });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toMatchObject({
        sourceFormat: format,
        renderStatus: "ready",
        previewKind: kind,
        inlineTracking: inline,
      });
      ids[name] = res.body.id;
      const render = await as(FORMATS, request(app).get(`/api/degree-checksheets/${res.body.id}/render`));
      expect(render.body.render.kind).toBe(kind);
    });
  }

  it("serves PDFs and pictures inline, so they can be drawn in the app", async () => {
    const pdf = await as(FORMATS, request(app).get(`/api/degree-checksheets/${ids["major-pdf"]}/file`));
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toBe('inline; filename="degree-checksheet.pdf"');
    const png = await as(FORMATS, request(app).get(`/api/degree-checksheets/${ids["flowchart-png"]}/file`));
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.headers["content-disposition"]).toBe('inline; filename="degree-checksheet.png"');
    const docx = await as(FORMATS, request(app).get(`/api/degree-checksheets/${ids["advising-docx"]}/file`));
    expect(docx.headers["content-disposition"]).toBe('attachment; filename="degree-checksheet.docx"');
  });

  it("previews a legacy .xls and tracks in its Status and Quarter columns, like an .xlsx", async () => {
    const { res, bytes } = await create(FORMATS, "legacy-workbook", { title: "Old format" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      sourceFormat: "xls",
      fileName: "applied-widgetry-major.xls",
      mimeType: "application/vnd.ms-excel",
      renderStatus: "ready",
      renderNoteCode: null,
      previewKind: "spreadsheet",
      inlineTracking: true,
    });
    const render = await as(FORMATS, request(app).get(`/api/degree-checksheets/${res.body.id}/render`));
    expect(render.body.render.sheets.map((s: any) => s.name)).toEqual(["Major", "Notes"]);
    expect(JSON.stringify(render.body)).toContain("Widget Mathematics I");
    // The original is the file that was uploaded, byte for byte, as a download.
    expect(sha(await originalOf(FORMATS, res.body.id))).toBe(sha(bytes));
    const file = await as(FORMATS, request(app).get(`/api/degree-checksheets/${res.body.id}/file`));
    expect(file.headers["content-disposition"]).toBe('attachment; filename="degree-checksheet.xls"');
    expect(file.headers["x-content-type-options"]).toBe("nosniff");

    const status = await annotate(FORMATS, res.body.id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "completed" });
    expect(status.status, JSON.stringify(status.body)).toBe(201);
    expect(status.body).toMatchObject({ field: "status", status: "completed" });
    const term = await annotate(FORMATS, res.body.id, { anchorType: "sheet_cell", anchor: TERM_CELL, term: "fall", termYear: 2025 });
    expect(term.status).toBe(201);
    // A filled cell is the department's; a page marker has no page to sit on.
    expect((await annotate(FORMATS, res.body.id, { anchorType: "sheet_cell", anchor: { sheet: 0, row: 4, col: 0 }, status: "planned" })).status).toBe(400);
    expect((await annotate(FORMATS, res.body.id, { anchorType: "point", anchor: { page: 0, x: 0.5, y: 0.5 }, status: "planned" })).status).toBe(400);

    // A reworded replacement detaches the entries of the row that changed, as it does for .xlsx.
    const replaced = await replaceWith(FORMATS, res.body.id, "legacy-workbook-reworded");
    expect(replaced.res.status, JSON.stringify(replaced.res.body)).toBe(200);
    expect(replaced.res.body.tracking).toEqual({ kept: 0, detached: 2, moved: 0 });
    expect(sha(await originalOf(FORMATS, res.body.id))).toBe(sha(replaced.bytes));
  });

  it("refuses a password-protected or damaged legacy workbook, with the reason", async () => {
    const locked = await create(FORMATS, "legacy-workbook-protected", { title: "Locked" });
    expect(locked.res.status).toBe(422);
    expect(locked.res.body.error).toMatch(/password-protected/);
    const shell = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(200),
      Buffer.from("Workbook", "utf16le"),
      Buffer.alloc(200),
    ]);
    const damaged = await createRaw(FORMATS, shell, "old-checksheet.xls", "application/vnd.ms-excel", { title: "Damaged" });
    expect(damaged.status).toBe(422);
    expect(damaged.body.error).toMatch(/damaged/);
    expect((await list(FORMATS)).body.documents.map((d: any) => d.title)).not.toContain("Damaged");
  });

  it("refuses files that are not what they claim, and keeps nothing of them", async () => {
    const before = filesOnDisk().length;
    const count = (await list(FORMATS)).body.documents.length;
    const html = Buffer.from("<!doctype html><script>alert(document.cookie)</script>");
    const refused: [Buffer, string, string, string][] = [
      [html, "page.pdf", "application/pdf", "type_mismatch"],
      [html, "page.png", "image/png", "type_mismatch"],
      [Buffer.from("%PDF-1.7\nbroken\n%%EOF\n"), "broken.pdf", "application/pdf", "malformed_pdf"],
      [
        (await buildChecksheetFixture("major-workbook")).subarray(0, 300),
        "cut.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "malformed_workbook",
      ],
      [
        await buildChecksheetFixture("major-workbook"),
        "really-a-workbook.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "type_mismatch",
      ],
    ];
    for (const [bytes, fileName, contentType, code] of refused) {
      const res = await createRaw(FORMATS, bytes, fileName, contentType, { title: fileName });
      expect(res.status, fileName).toBe(422);
      expect(res.body.code, fileName).toBe(code);
      expect(res.body.error).toBeTruthy();
    }
    expect(filesOnDisk()).toHaveLength(before);
    expect((await list(FORMATS)).body.documents).toHaveLength(count);
  });

  it("will not issue an upload link for an unsupported or oversized file", async () => {
    const link = (body: object) => as(FORMATS, request(app).post("/api/degree-checksheets/upload-url")).send(body);
    for (const [name, contentType] of [
      ["page.html", "text/html"],
      ["vector.svg", "image/svg+xml"],
      ["macro.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
      ["run.exe", "application/octet-stream"],
    ]) {
      const res = await link({ name, size: 100, contentType });
      expect(res.status, name).toBe(400);
      expect(res.body.code).toBe("unsupported_type");
    }
    const big = await link({ name: "big.pdf", size: 21 * 1024 * 1024, contentType: "application/pdf" });
    expect(big.status).toBe(400);
    expect(big.body.code).toBe("too_large");
    expect((await link({ name: "" })).status).toBe(400);
  });

  it("binds an upload link to one content type", async () => {
    const bytes = Buffer.from("<html></html>");
    const target = await as(FORMATS, request(app).post("/api/degree-checksheets/upload-url")).send({
      name: "a.pdf",
      size: bytes.length,
      contentType: "application/pdf",
    });
    const put = await request(app).put(pathOf(target.body.uploadURL)).set("Content-Type", "text/html").send(bytes);
    expect(put.status).toBe(415);
  });
});

describe("student tracking on a spreadsheet", () => {
  let id: number;
  let uploaded: Buffer;
  let statusId: number;
  let termId: number;

  beforeAll(async () => {
    const { res, bytes } = await create(TRACK, "major-workbook", { title: "Applied Widgetry Major" });
    id = res.body.id;
    uploaded = bytes;
  });

  it("starts with no entries", async () => {
    const res = await annotations(TRACK, id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ maxAnnotations: 500, annotations: [] });
  });

  it("sets a status in a Status cell", async () => {
    const res = await annotate(TRACK, id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "in_progress" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      documentId: id,
      anchorType: "sheet_cell",
      anchor: STATUS_CELL,
      field: "status",
      detached: false,
      status: "in_progress",
      term: null,
      termYear: null,
      revision: 1,
    });
    statusId = res.body.id;
  });

  it("sets a quarter in a Quarter Completed cell", async () => {
    const res = await annotate(TRACK, id, { anchorType: "sheet_cell", anchor: TERM_CELL, term: "winter", termYear: 2027 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ field: "term", term: "winter", termYear: 2027, status: null });
    termId = res.body.id;
  });

  it("keeps them: a later read returns exactly what was saved", async () => {
    const res = await annotations(TRACK, id);
    expect(res.body.annotations.map((a: any) => [a.id, a.status, a.term, a.termYear])).toEqual([
      [statusId, "in_progress", null, null],
      [termId, null, "winter", 2027],
    ]);
  });

  it("changes a status and a quarter", async () => {
    const status = await patch(TRACK, id, statusId, { status: "completed" });
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({ status: "completed", revision: 2 });
    const term = await patch(TRACK, id, termId, { term: "fall", termYear: 2026 });
    expect(term.body).toMatchObject({ term: "fall", termYear: 2026, revision: 2 });
  });

  it("holds ONE entry per cell: setting a cell again updates it", async () => {
    const again = await annotate(TRACK, id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "planned" });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ id: statusId, status: "planned", revision: 3 });
    expect((await annotations(TRACK, id)).body.annotations).toHaveLength(2);
  });

  it("holds one entry per cell even when two saves arrive together", async () => {
    const cell = NEXT_STATUS_CELL;
    const [a, b] = await Promise.all([
      annotate(TRACK, id, { anchorType: "sheet_cell", anchor: cell, status: "planned" }),
      annotate(TRACK, id, { anchorType: "sheet_cell", anchor: cell, status: "completed" }),
    ]);
    expect([a.status, b.status].sort()).toEqual(expect.arrayContaining([201]));
    expect(a.body.id).toBe(b.body.id);
    const stored = (await annotations(TRACK, id)).body.annotations.filter((x: any) => x.anchor.row === 5);
    expect(stored).toHaveLength(1);
    await as(TRACK, request(app).delete(`/api/degree-checksheets/${id}/annotations/${a.body.id}`));
  });

  it("clears a value, and removes an entry entirely", async () => {
    const cleared = await patch(TRACK, id, statusId, { status: null });
    expect(cleared.body).toMatchObject({ status: null });
    const termCleared = await patch(TRACK, id, termId, { term: null, termYear: null });
    expect(termCleared.body).toMatchObject({ term: null, termYear: null });

    const removed = await as(TRACK, request(app).delete(`/api/degree-checksheets/${id}/annotations/${termId}`));
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ deleted: true });
    expect((await annotations(TRACK, id)).body.annotations.map((a: any) => a.id)).toEqual([statusId]);
    expect((await patch(TRACK, id, termId, { term: "fall", termYear: 2026 })).status).toBe(404);
  });

  it("refuses a place the document does not offer", async () => {
    for (const anchor of [
      { sheet: 0, row: 4, col: 0 }, // the requirement's own text
      { sheet: 0, row: 4, col: 4 }, // the department's Notes column
      { sheet: 0, row: 3, col: 2 }, // a section heading
      { sheet: 0, row: 2, col: 2 }, // the header row
      { sheet: 0, row: 1, col: 2 }, // a blank row
      { sheet: 3, row: 4, col: 2 },
    ]) {
      const res = await annotate(TRACK, id, { anchorType: "sheet_cell", anchor, status: "completed" });
      expect(res.status, JSON.stringify(anchor)).toBe(400);
    }
    // A spreadsheet has no pages, and no Word blocks.
    expect((await annotate(TRACK, id, { anchorType: "point", anchor: { page: 0, x: 0.5, y: 0.5 }, status: "planned" })).status).toBe(400);
    expect((await annotate(TRACK, id, { anchorType: "doc_cell", anchor: { block: 0, row: 1, col: 1 }, status: "planned" })).status).toBe(400);
  });

  it("refuses a value that does not belong in that column, or that is not a value at all", async () => {
    const bad: object[] = [
      { anchorType: "sheet_cell", anchor: STATUS_CELL, term: "fall", termYear: 2026 },
      { anchorType: "sheet_cell", anchor: TERM_CELL, status: "completed" },
      { anchorType: "sheet_cell", anchor: TERM_CELL, term: "fall" },
      { anchorType: "sheet_cell", anchor: TERM_CELL, termYear: 2026 },
      { anchorType: "sheet_cell", anchor: TERM_CELL, term: "autumn", termYear: 2026 },
      { anchorType: "sheet_cell", anchor: TERM_CELL, term: "fall", termYear: 1850 },
      { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "verified_complete" },
      { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "waived" },
      { anchorType: "sheet_cell", anchor: STATUS_CELL, note: "x".repeat(501) },
      { anchorType: "manual", status: "completed" },
      { anchorType: "manual", itemLabel: "   ", status: "completed" },
      { anchor: STATUS_CELL, status: "completed" },
    ];
    for (const body of bad) expect((await annotate(TRACK, id, body)).status, JSON.stringify(body)).toBe(400);
    expect((await annotations(TRACK, id)).body.annotations.map((a: any) => a.id)).toEqual([statusId]);
  });

  it("accepts past and future quarters, and every quarter of the year", async () => {
    const made: number[] = [];
    for (const [term, termYear] of [
      ["fall", 2019],
      ["winter", 2026],
      ["spring", 2031],
      ["summer", 2027],
    ] as const) {
      const res = await annotate(TRACK, id, { anchorType: "manual", itemLabel: `Item ${term}`, term, termYear });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ term, termYear, anchorType: "manual", field: null });
      made.push(res.body.id);
    }
    for (const entry of made) {
      await as(TRACK, request(app).delete(`/api/degree-checksheets/${id}/annotations/${entry}`));
    }
  });

  it("keeps a student's own list: label, status, quarter and note", async () => {
    const res = await annotate(TRACK, id, {
      anchorType: "manual",
      itemLabel: "  Widget  Ethics ",
      status: "planned",
      term: "spring",
      termYear: 2027,
      note: "Ask advisor about the overlap\nwith the sample Core area",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      itemLabel: "Widget Ethics",
      status: "planned",
      term: "spring",
      termYear: 2027,
      note: "Ask advisor about the overlap\nwith the sample Core area",
    });
    const renamed = await patch(TRACK, id, res.body.id, { itemLabel: "Widget Ethics (WIDG 130)", note: null });
    expect(renamed.body).toMatchObject({ itemLabel: "Widget Ethics (WIDG 130)", note: null, status: "planned" });
    expect((await patch(TRACK, id, res.body.id, { itemLabel: "" })).status).toBe(400);
  });

  it("refuses a save based on an older copy, and reports the current one", async () => {
    const current = (await annotations(TRACK, id)).body.annotations.find((a: any) => a.id === statusId);
    const first = await patch(TRACK, id, statusId, { status: "in_progress", expectedRevision: current.revision });
    expect(first.status).toBe(200);
    // A second tab, still holding the older revision:
    const stale = await patch(TRACK, id, statusId, { status: "not_started", expectedRevision: current.revision });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ id: statusId, status: "in_progress", revision: first.body.revision });
    const stored = (await annotations(TRACK, id)).body.annotations.find((a: any) => a.id === statusId);
    expect(stored.status).toBe("in_progress");
  });

  it("never changes the source: not the stored file, not its preview", async () => {
    expect(sha(await originalOf(TRACK, id))).toBe(sha(uploaded));
    // The bytes in storage, read straight from disk, are the uploaded bytes.
    expect(sha(readFileSync(await diskPathOf(id)))).toBe(sha(uploaded));

    const render = await as(TRACK, request(app).get(`/api/degree-checksheets/${id}/render`));
    const row = render.body.render.sheets[0].rows.find((r: any) => r.r === 4);
    // The tracked cells are still EMPTY in the source; the student's values live elsewhere.
    expect(row.cells.map((c: any) => c.c)).toEqual([0, 1, 4]);
    expect(JSON.stringify(render.body)).not.toMatch(/in_progress|Widget Ethics \(WIDG 130\)|Ask advisor/);
    const meta = await as(TRACK, request(app).get(`/api/degree-checksheets/${id}`));
    expect(meta.body).toMatchObject({ sourceVersion: 1, fileFingerprint: sha(uploaded).slice(0, 12) });
  });

  it("changes nothing else in CampusVal: no plan, plan item or APR is created or touched", async () => {
    const plans = await db.select().from(academicPlansTable).where(eq(academicPlansTable.userId, TRACK));
    const items = await db
      .select({ id: planItemsTable.id })
      .from(planItemsTable)
      .innerJoin(academicPlansTable, eq(planItemsTable.planId, academicPlansTable.id))
      .where(eq(academicPlansTable.userId, TRACK));
    const reports = await db.select().from(progressReportsTable).where(eq(progressReportsTable.userId, TRACK));
    expect([plans, items, reports]).toEqual([[], [], []]);
  });
});

describe("tracking a filled cell the student chose", () => {
  let id: number;
  let docxId: number;
  let uploaded: Buffer;
  /** "Widget Mathematics I", in the Requirement column of the major workbook. */
  const ITEM = { sheet: 0, row: 5, col: 0 };

  beforeAll(async () => {
    const major = await create(TRACK, "major-workbook", { title: "Major, tracked by cell" });
    id = major.res.body.id;
    uploaded = major.bytes;
    docxId = (await create(TRACK, "advising-docx", { title: "Guide, tracked by cell" })).res.body.id;
  });

  it("starts tracking a cell, named after what the cell says", async () => {
    const res = await annotate(TRACK, id, { anchorType: "sheet_item", anchor: ITEM });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      anchorType: "sheet_item",
      anchor: ITEM,
      field: null,
      itemLabel: "Widget Mathematics I",
      status: null,
      term: null,
      detached: false,
    });
  });

  it("holds BOTH a status and a quarter, unlike a Status or Quarter column", async () => {
    const [entry] = (await annotations(TRACK, id)).body.annotations;
    const res = await patch(TRACK, id, entry.id, { status: "completed", term: "fall", termYear: 2025 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "completed", term: "fall", termYear: 2025, itemLabel: "Widget Mathematics I" });
  });

  it("holds one entry per cell", async () => {
    const again = await annotate(TRACK, id, { anchorType: "sheet_item", anchor: ITEM, status: "in_progress" });
    expect(again.status).toBe(200);
    const all = (await annotations(TRACK, id)).body.annotations;
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: "in_progress", term: "fall", termYear: 2025 });
  });

  it("can sit in the same row as an entry in the department's Status column", async () => {
    const cell = await annotate(TRACK, id, { anchorType: "sheet_cell", anchor: { sheet: 0, row: 5, col: 2 }, status: "planned" });
    expect(cell.status).toBe(201);
    expect((await annotations(TRACK, id)).body.annotations.map((a: any) => [a.anchorType, a.status])).toEqual([
      ["sheet_item", "in_progress"],
      ["sheet_cell", "planned"],
    ]);
  });

  it("refuses an empty cell, a cell that does not exist, and the wrong document type", async () => {
    for (const anchor of [
      { sheet: 0, row: 5, col: 3 }, // empty
      { sheet: 0, row: 1, col: 0 }, // blank row
      { sheet: 0, row: 99, col: 0 },
      { sheet: 2, row: 5, col: 0 },
    ]) {
      expect((await annotate(TRACK, id, { anchorType: "sheet_item", anchor, status: "planned" })).status, JSON.stringify(anchor)).toBe(400);
    }
    expect((await annotate(TRACK, id, { anchorType: "doc_item", anchor: { block: 0, row: 0, col: 0 }, status: "planned" })).status).toBe(400);
    expect((await annotate(TRACK, docxId, { anchorType: "sheet_item", anchor: ITEM, status: "planned" })).status).toBe(400);
  });

  it("tracks a course cell of a Word table, and not a paragraph", async () => {
    const render = await as(TRACK, request(app).get(`/api/degree-checksheets/${docxId}/render`));
    const block = render.body.render.blocks.findIndex((b: any) => b.type === "table");
    const res = await annotate(TRACK, docxId, { anchorType: "doc_item", anchor: { block, row: 2, col: 0 }, status: "planned", term: "winter", termYear: 2027 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ anchorType: "doc_item", itemLabel: "WIDG 111 Widget Mathematics I", status: "planned", term: "winter" });
    expect((await annotate(TRACK, docxId, { anchorType: "doc_item", anchor: { block: 0, row: 0, col: 0 }, status: "planned" })).status).toBe(400);
    expect((await annotate(TRACK, docxId, { anchorType: "doc_item", anchor: { block, row: 2, col: 2 }, status: "planned" })).status).toBe(400);
  });

  it("leaves the source exactly as it was", async () => {
    expect(sha(await originalOf(TRACK, id))).toBe(sha(uploaded));
    const render = await as(TRACK, request(app).get(`/api/degree-checksheets/${id}/render`));
    const row = render.body.render.sheets[0].rows.find((r: any) => r.r === 5);
    expect(row.cells.map((c: any) => [c.c, c.text])).toEqual([
      [0, "Widget Mathematics I"],
      [1, "WIDG 111"],
      [4, "Prerequisite for WIDG 112"],
    ]);
    expect(JSON.stringify(render.body)).not.toMatch(/in_progress|sheet_item/);
  });

  it("after a replacement, stays on a cell that says the same and leaves one that does not", async () => {
    const doc = (await create(REPLACE, "major-workbook", { title: "chosen cells" })).res.body.id;
    // Row 4 is reworded by the replacement; row 5 is not.
    const changed = await annotate(REPLACE, doc, { anchorType: "sheet_item", anchor: { sheet: 0, row: 4, col: 0 }, status: "completed" });
    const same = await annotate(REPLACE, doc, { anchorType: "sheet_item", anchor: { sheet: 0, row: 5, col: 0 }, status: "planned" });
    const { res } = await replaceWith(REPLACE, doc, "major-workbook-reworded");
    expect(res.body.tracking).toEqual({ kept: 1, detached: 1, moved: 0 });
    const after = (await annotations(REPLACE, doc)).body.annotations;
    expect(after.find((a: any) => a.id === same.body.id)).toMatchObject({ detached: false, anchor: { sheet: 0, row: 5, col: 0 } });
    expect(after.find((a: any) => a.id === changed.body.id)).toMatchObject({
      detached: true,
      status: "completed",
      itemLabel: "Introduction to Widgetry",
    });
    // The student may start tracking what is there now; it is a new entry.
    const fresh = await annotate(REPLACE, doc, { anchorType: "sheet_item", anchor: { sheet: 0, row: 4, col: 0 } });
    expect(fresh.status).toBe(201);
    expect(fresh.body).toMatchObject({ itemLabel: "History of Widgets", status: null });
    expect(fresh.body.id).not.toBe(changed.body.id);
  });
});

describe("student tracking on a PDF, a picture and a Word document", () => {
  let pdfId: number;
  let pngId: number;
  let docxId: number;

  beforeAll(async () => {
    pdfId = (await create(TRACK, "major-pdf", { title: "Major (PDF)" })).res.body.id;
    pngId = (await create(TRACK, "flowchart-png", { title: "Flowchart", category: "flowchart" })).res.body.id;
    docxId = (await create(TRACK, "advising-docx", { title: "Advising guide" })).res.body.id;
  });

  it("places a marker on a PDF page by fractions of the page", async () => {
    const res = await annotate(TRACK, pdfId, {
      anchorType: "point",
      anchor: { page: 1, x: 0.10204, y: 0.33333 },
      status: "completed",
      term: "fall",
      termYear: 2026,
      note: "Took with lab",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      anchorType: "point",
      anchor: { page: 1, x: 0.102, y: 0.3333 },
      field: null,
      status: "completed",
      term: "fall",
      termYear: 2026,
    });
    const again = (await annotations(TRACK, pdfId)).body.annotations[0];
    expect(again.anchor).toEqual({ page: 1, x: 0.102, y: 0.3333 });
  });

  it("allows many markers on one page, moves one, and removes one", async () => {
    const second = await annotate(TRACK, pdfId, { anchorType: "point", anchor: { page: 1, x: 0.102, y: 0.3333 }, status: "planned" });
    expect(second.status).toBe(201);
    const moved = await patch(TRACK, pdfId, second.body.id, { anchor: { page: 0, x: 0.5, y: 0.25 } });
    expect(moved.status).toBe(200);
    expect(moved.body.anchor).toEqual({ page: 0, x: 0.5, y: 0.25 });
    expect(moved.body.status).toBe("planned");
    expect((await patch(TRACK, pdfId, second.body.id, { anchor: { page: 9, x: 0.5, y: 0.25 } })).status).toBe(400);
    expect((await patch(TRACK, pdfId, second.body.id, { anchor: { page: 0, x: 1.5, y: 0.25 } })).status).toBe(400);
    await as(TRACK, request(app).delete(`/api/degree-checksheets/${pdfId}/annotations/${second.body.id}`));
    expect((await annotations(TRACK, pdfId)).body.annotations).toHaveLength(1);
  });

  it("places a marker on a picture", async () => {
    const res = await annotate(TRACK, pngId, { anchorType: "point", anchor: { page: 0, x: 0.18, y: 0.18 }, status: "completed" });
    expect(res.status).toBe(201);
    expect((await annotate(TRACK, pngId, { anchorType: "point", anchor: { page: 1, x: 0.1, y: 0.1 }, status: "planned" })).status).toBe(400);
  });

  it("tracks in the empty cells of a Word table", async () => {
    const render = await as(TRACK, request(app).get(`/api/degree-checksheets/${docxId}/render`));
    const block = render.body.render.blocks.findIndex((b: any) => b.type === "table");
    const status = await annotate(TRACK, docxId, { anchorType: "doc_cell", anchor: { block, row: 1, col: 2 }, status: "completed" });
    expect(status.status, JSON.stringify(status.body)).toBe(201);
    expect(status.body.field).toBe("status");
    const term = await annotate(TRACK, docxId, { anchorType: "doc_cell", anchor: { block, row: 1, col: 3 }, term: "fall", termYear: 2025 });
    expect(term.body).toMatchObject({ field: "term", term: "fall", termYear: 2025 });
    // The course and units cells are the department's.
    expect((await annotate(TRACK, docxId, { anchorType: "doc_cell", anchor: { block, row: 1, col: 0 }, status: "completed" })).status).toBe(400);
    expect((await annotate(TRACK, docxId, { anchorType: "doc_cell", anchor: { block: 0, row: 0, col: 0 }, status: "completed" })).status).toBe(400);
  });

  it("caps the number of entries on one document", async () => {
    const doc = (await create(LIMIT, "four-year-plan-pdf", { title: "Plan" })).res.body.id;
    await db.insert(degreeChecksheetAnnotationsTable).values(
      Array.from({ length: 500 }, (_, i) => ({
        documentId: doc,
        userId: LIMIT,
        anchorType: "manual",
        anchor: {},
        itemLabel: `Item ${i}`,
        sortOrder: i,
      })),
    );
    const res = await annotate(LIMIT, doc, { anchorType: "manual", itemLabel: "One more", status: "planned" });
    expect(res.status).toBe(409);
  });
});

describe("renaming and editing details", () => {
  let id: number;
  beforeAll(async () => {
    id = (await create(OWNER, "minor-workbook", { title: "Minor", category: "minor_checksheet" })).res.body.id;
  });

  it("renames without touching the file or its upload date", async () => {
    const before = await as(OWNER, request(app).get(`/api/degree-checksheets/${id}`));
    const res = await as(OWNER, request(app).patch(`/api/degree-checksheets/${id}`)).send({ title: "Sprocket Studies Minor" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Sprocket Studies Minor");
    expect(res.body.uploadedAt).toBe(before.body.uploadedAt);
    expect(res.body.fileFingerprint).toBe(before.body.fileFingerprint);
    expect(res.body.sourceVersion).toBe(1);
    expect(res.body.category).toBe("minor_checksheet");
  });

  it("edits, and clears, each descriptive field", async () => {
    const set = await as(OWNER, request(app).patch(`/api/degree-checksheets/${id}`)).send({
      category: "advising_resource",
      programName: "Sprocket Studies",
      programRole: "additional_minor",
      school: "Sample College",
      academicYearLabel: "Prior to Fall 2025",
      sourceUrl: "https://www.example.edu/sprockets/minor",
    });
    expect(set.body).toMatchObject({
      category: "advising_resource",
      programName: "Sprocket Studies",
      programRole: "additional_minor",
      school: "Sample College",
      academicYearLabel: "Prior to Fall 2025",
      sourceUrl: "https://www.example.edu/sprockets/minor",
    });
    const cleared = await as(OWNER, request(app).patch(`/api/degree-checksheets/${id}`)).send({
      programName: null,
      programRole: null,
      school: "",
      academicYearLabel: null,
      sourceUrl: "",
    });
    expect(cleared.body).toMatchObject({
      title: "Sprocket Studies Minor",
      programName: null,
      programRole: null,
      school: null,
      academicYearLabel: null,
      sourceUrl: null,
    });
  });

  it("stores any version label as written, and draws no conclusion from it", async () => {
    for (const label of ["2026-27", "Fall 2025 and Later", "Spring 2024 and Earlier", "2024 Curriculum"]) {
      const res = await as(OWNER, request(app).patch(`/api/degree-checksheets/${id}`)).send({ academicYearLabel: label });
      expect(res.body.academicYearLabel).toBe(label);
    }
  });

  it("refuses an empty title or an unsafe link", async () => {
    const send = (body: object) => as(OWNER, request(app).patch(`/api/degree-checksheets/${id}`)).send(body);
    expect((await send({ title: "  " })).status).toBe(400);
    expect((await send({ sourceUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await send({ category: "bulletin" })).status).toBe(400);
    expect((await as(OWNER, request(app).get(`/api/degree-checksheets/${id}`))).body.title).toBe("Sprocket Studies Minor");
  });
});

describe("the library order", () => {
  it("lists checksheets first and other resources last, whatever order they were uploaded in", async () => {
    const user = `dcs-order-${RUN}`;
    USERS.push(user);
    for (const [name, title, category] of [
      ["flowchart-png", "Flowchart", "flowchart"],
      ["four-year-plan-pdf", "Four-year plan", "four_year_plan"],
      ["minor-workbook", "Minor", "minor_checksheet"],
      ["major-pdf", "Other resource", "other"],
      ["major-workbook", "Major", "major_checksheet"],
      ["second-major-workbook", "Second major", "major_checksheet"],
    ] as const) {
      expect((await create(user, name, { title, category })).res.status).toBe(201);
    }
    const res = await list(user);
    expect(res.body.documents.map((d: any) => d.title)).toEqual([
      "Major",
      "Second major",
      "Minor",
      "Four-year plan",
      "Flowchart",
      "Other resource",
    ]);
    // Within a group the student's own order wins.
    const second = res.body.documents[1];
    await as(user, request(app).patch(`/api/degree-checksheets/${second.id}`)).send({ sortOrder: 0 });
    const major = res.body.documents[0];
    await as(user, request(app).patch(`/api/degree-checksheets/${major.id}`)).send({ sortOrder: 1 });
    expect((await list(user)).body.documents.slice(0, 2).map((d: any) => d.title)).toEqual(["Second major", "Major"]);
    await db.delete(degreeChecksheetDocumentsTable).where(eq(degreeChecksheetDocumentsTable.userId, user));
  });
});

describe("replacing a document's file", () => {
  async function tracked(name: ChecksheetFixtureName) {
    const { res, bytes } = await create(REPLACE, name, { title: name, academicYearLabel: "2025-26" });
    expect(res.status).toBe(201);
    return { id: res.body.id as number, bytes, uploadedAt: res.body.uploadedAt as string };
  }

  it("compatible workbook: entries stay exactly where they were", async () => {
    const doc = await tracked("major-workbook");
    const status = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "completed" });
    const term = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: TERM_CELL, term: "fall", termYear: 2025 });
    const manual = await annotate(REPLACE, doc.id, { anchorType: "manual", itemLabel: "Study abroad", status: "planned" });
    await new Promise((r) => setTimeout(r, 15));
    const oldFile = await diskPathOf(doc.id);
    expect(sha(readFileSync(oldFile))).toBe(sha(doc.bytes));

    const { res, bytes } = await replaceWith(REPLACE, doc.id, "major-workbook-extended");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.tracking).toEqual({ kept: 3, detached: 0, moved: 0 });
    expect(res.body.document).toMatchObject({
      id: doc.id,
      title: "major-workbook",
      academicYearLabel: "2025-26",
      fileName: "applied-widgetry-major-extended.xlsx",
      sourceVersion: 2,
      fileFingerprint: sha(bytes).slice(0, 12),
    });
    expect(new Date(res.body.document.uploadedAt).getTime()).toBeGreaterThan(new Date(doc.uploadedAt).getTime());

    const after = (await annotations(REPLACE, doc.id)).body.annotations;
    expect(after.map((a: any) => [a.id, a.detached, a.anchorType, a.status, a.term])).toEqual([
      [status.body.id, false, "sheet_cell", "completed", null],
      [term.body.id, false, "sheet_cell", null, "fall"],
      [manual.body.id, false, "manual", "planned", null],
    ]);
    expect(after[0].anchor).toEqual(STATUS_CELL);

    // The preview and the original are the NEW file's; the old file is gone.
    expect(sha(await originalOf(REPLACE, doc.id))).toBe(sha(bytes));
    const render = await as(REPLACE, request(app).get(`/api/degree-checksheets/${doc.id}/render`));
    expect(JSON.stringify(render.body)).toContain("Widget Internship");
    expect(existsSync(oldFile)).toBe(false);
    expect(sha(readFileSync(await diskPathOf(doc.id)))).toBe(sha(bytes));
  });

  it("same layout, different requirement in a row: only that row's entries are detached", async () => {
    const doc = await tracked("major-workbook");
    const changedRow = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "completed" });
    const sameRow = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: NEXT_STATUS_CELL, status: "planned" });

    const { res } = await replaceWith(REPLACE, doc.id, "major-workbook-reworded");
    expect(res.body.tracking).toEqual({ kept: 1, detached: 1, moved: 0 });

    const after = (await annotations(REPLACE, doc.id)).body.annotations;
    const detached = after.find((a: any) => a.id === changedRow.body.id);
    // It is kept, named after what it referred to, and no longer placed on the document.
    expect(detached).toMatchObject({ detached: true, status: "completed", itemLabel: "Introduction to Widgetry" });
    expect(after.find((a: any) => a.id === sameRow.body.id)).toMatchObject({ detached: false, status: "planned" });

    // The cell is free: tracking "History of Widgets" starts a NEW entry, it does not inherit the old one.
    const fresh = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "not_started" });
    expect(fresh.status).toBe(201);
    expect(fresh.body.id).not.toBe(changedRow.body.id);
    expect((await annotations(REPLACE, doc.id)).body.annotations.find((a: any) => a.id === changedRow.body.id)).toMatchObject({
      detached: true,
      status: "completed",
    });
  });

  it("a detached entry can be kept as a list entry, or put back by the student", async () => {
    const doc = await tracked("major-workbook");
    const a = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "completed" });
    const b = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: TERM_CELL, term: "fall", termYear: 2025 });
    await replaceWith(REPLACE, doc.id, "major-workbook-reworded");

    const kept = await patch(REPLACE, doc.id, a.body.id, { keepAsListEntry: true });
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({
      anchorType: "manual",
      anchor: {},
      detached: false,
      status: "completed",
      itemLabel: "Introduction to Widgetry",
    });

    // The student decides it still belongs in that cell, against the new file.
    const relinked = await patch(REPLACE, doc.id, b.body.id, { anchor: TERM_CELL });
    expect(relinked.status).toBe(200);
    expect(relinked.body).toMatchObject({ anchorType: "sheet_cell", detached: false, term: "fall", termYear: 2025, field: "term" });
    // ...but never into a cell of the wrong kind, or one that is taken.
    const c = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: NEXT_TERM_CELL, term: "winter", termYear: 2026 });
    expect((await patch(REPLACE, doc.id, c.body.id, { anchor: TERM_CELL })).status).toBe(400);
    expect((await patch(REPLACE, doc.id, c.body.id, { anchor: STATUS_CELL })).status).toBe(400);
  });

  it("different PDF: a marker stays only on a page that still says the same thing", async () => {
    const doc = await tracked("major-pdf");
    const onSamePage = await annotate(REPLACE, doc.id, { anchorType: "point", anchor: { page: 0, x: 0.1, y: 0.2 }, status: "completed" });
    const onChangedPage = await annotate(REPLACE, doc.id, { anchorType: "point", anchor: { page: 1, x: 0.1, y: 0.2 }, status: "planned" });
    const manual = await annotate(REPLACE, doc.id, { anchorType: "manual", itemLabel: "Senior capstone", status: "planned" });

    const { res } = await replaceWith(REPLACE, doc.id, "major-pdf-revised");
    expect(res.body.tracking).toEqual({ kept: 2, detached: 1, moved: 0 });
    const after = (await annotations(REPLACE, doc.id)).body.annotations;
    expect(after.find((a: any) => a.id === onSamePage.body.id)).toMatchObject({ detached: false });
    expect(after.find((a: any) => a.id === onChangedPage.body.id)).toMatchObject({
      detached: true,
      itemLabel: "Marker on page 2",
      status: "planned",
    });
    expect(after.find((a: any) => a.id === manual.body.id)).toMatchObject({ detached: false, itemLabel: "Senior capstone" });
  });

  it("scanned PDF with a cover page added: every marker follows its page, keeping status, quarter and note", async () => {
    const doc = await tracked("scanned-pdf");
    const first = await annotate(REPLACE, doc.id, {
      anchorType: "point",
      anchor: { page: 0, x: 0.2, y: 0.3 },
      status: "completed",
      term: "fall",
      termYear: 2025,
      note: "Took it with Dr. Sprocket",
    });
    const third = await annotate(REPLACE, doc.id, { anchorType: "point", anchor: { page: 2, x: 0.6, y: 0.7 }, status: "planned" });
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    const { res } = await replaceWith(REPLACE, doc.id, "scanned-pdf-page-inserted");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.tracking).toEqual({ kept: 2, detached: 0, moved: 2 });
    const after = (await annotations(REPLACE, doc.id)).body.annotations;
    expect(after.find((a: any) => a.id === first.body.id)).toMatchObject({
      detached: false,
      anchor: { page: 1, x: 0.2, y: 0.3 },
      status: "completed",
      term: "fall",
      termYear: 2025,
      note: "Took it with Dr. Sprocket",
    });
    expect(after.find((a: any) => a.id === third.body.id)).toMatchObject({ detached: false, anchor: { page: 3, x: 0.6, y: 0.7 } });

    // A page removed: the marker on it is set aside; the student places it again, values intact.
    const removed = await replaceWith(REPLACE, doc.id, "scanned-pdf-page-removed");
    expect(removed.res.body.tracking).toEqual({ kept: 2, detached: 0, moved: 2 });
    const rescanned = await replaceWith(REPLACE, doc.id, "scanned-pdf-rescanned");
    expect(rescanned.res.body.tracking).toEqual({ kept: 0, detached: 2, moved: 0 });
    const aside = (await annotations(REPLACE, doc.id)).body.annotations.find((a: any) => a.id === first.body.id);
    expect(aside).toMatchObject({ detached: true, status: "completed", term: "fall", note: "Took it with Dr. Sprocket" });
    const placed = await patch(REPLACE, doc.id, first.body.id, { anchor: { page: 2, x: 0.5, y: 0.5 } });
    expect(placed.status, JSON.stringify(placed.body)).toBe(200);
    expect(placed.body).toMatchObject({
      detached: false,
      anchor: { page: 2, x: 0.5, y: 0.5 },
      status: "completed",
      term: "fall",
      termYear: 2025,
      note: "Took it with Dr. Sprocket",
    });
  });

  it("never sends a page's or a picture's fingerprint to the browser", async () => {
    for (const name of ["scanned-pdf", "flowchart-png", "major-pdf"] as const) {
      const doc = await tracked(name);
      const render = await as(REPLACE, request(app).get(`/api/degree-checksheets/${doc.id}/render`));
      expect(JSON.stringify(render.body.render), name).not.toMatch(/contentHash|textHash|fingerprint/i);
    }
  });

  it("unrelated PDF, and a change of format: every placed entry is detached, list entries stay", async () => {
    const doc = await tracked("major-pdf");
    await annotate(REPLACE, doc.id, { anchorType: "point", anchor: { page: 0, x: 0.1, y: 0.2 }, status: "completed" });
    await annotate(REPLACE, doc.id, { anchorType: "manual", itemLabel: "Mine", status: "planned" });
    const other = await replaceWith(REPLACE, doc.id, "four-year-plan-pdf");
    expect(other.res.body.tracking).toEqual({ kept: 1, detached: 1, moved: 0 });

    const sheet = await tracked("major-workbook");
    await annotate(REPLACE, sheet.id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "completed" });
    await annotate(REPLACE, sheet.id, { anchorType: "sheet_cell", anchor: TERM_CELL, term: "fall", termYear: 2025 });
    const toPdf = await replaceWith(REPLACE, sheet.id, "major-pdf");
    expect(toPdf.res.body.tracking).toEqual({ kept: 0, detached: 2, moved: 0 });
    expect(toPdf.res.body.document).toMatchObject({ sourceFormat: "pdf", previewKind: "pdf", inlineTracking: false });
    const after = (await annotations(REPLACE, sheet.id)).body.annotations;
    expect(after.every((a: any) => a.detached)).toBe(true);
    expect(after.map((a: any) => a.itemLabel)).toEqual(["Introduction to Widgetry", "Introduction to Widgetry"]);
    // A detached spreadsheet entry cannot be put onto a PDF page.
    expect((await patch(REPLACE, sheet.id, after[0].id, { anchor: { page: 0, x: 0.5, y: 0.5 } })).status).toBe(400);
  });

  it("unrelated workbook: nothing is left sitting on the wrong rows", async () => {
    const doc = await tracked("major-workbook");
    await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "completed" });
    await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: NEXT_STATUS_CELL, status: "planned" });
    const { res } = await replaceWith(REPLACE, doc.id, "second-major-workbook");
    expect(res.body.tracking).toEqual({ kept: 0, detached: 2, moved: 0 });
    const placed = (await annotations(REPLACE, doc.id)).body.annotations.filter((a: any) => !a.detached);
    expect(placed).toEqual([]);
  });

  it("the same file again: everything stays", async () => {
    const doc = await tracked("flowchart-png");
    await annotate(REPLACE, doc.id, { anchorType: "point", anchor: { page: 0, x: 0.2, y: 0.2 }, status: "completed" });
    const { res } = await replaceWith(REPLACE, doc.id, "flowchart-png");
    expect(res.body.tracking).toEqual({ kept: 1, detached: 0, moved: 0 });
    expect(res.body.document.sourceVersion).toBe(2);
  });

  it("a refused replacement changes nothing: file, preview, date and tracking are all kept", async () => {
    const doc = await tracked("major-workbook");
    const entry = await annotate(REPLACE, doc.id, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "completed" });
    const before = await as(REPLACE, request(app).get(`/api/degree-checksheets/${doc.id}`));

    const bad = Buffer.from("<!doctype html><p>not a workbook</p>");
    const objectPath = await putBytes(
      REPLACE,
      bad,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "bad.xlsx",
    );
    const res = await as(REPLACE, request(app).put(`/api/degree-checksheets/${doc.id}/file`)).send({
      objectPath,
      fileName: "bad.xlsx",
      fileSize: bad.length,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("type_mismatch");

    const after = await as(REPLACE, request(app).get(`/api/degree-checksheets/${doc.id}`));
    expect(after.body).toEqual(before.body);
    expect(sha(await originalOf(REPLACE, doc.id))).toBe(sha(doc.bytes));
    expect((await annotations(REPLACE, doc.id)).body.annotations).toEqual([
      expect.objectContaining({ id: entry.body.id, detached: false, status: "completed" }),
    ]);
    expect((await as(REPLACE, request(app).put(`/api/degree-checksheets/${doc.id}/file`)).send({})).status).toBe(400);
  });
});

describe("several documents stay independent", () => {
  const ids: Record<string, number> = {};
  const bytesOf: Record<string, Buffer> = {};

  it("holds a primary major, a second major, a minor and a flowchart side by side", async () => {
    for (const [key, name, title, category, role] of [
      ["major", "major-workbook", "Primary Major", "major_checksheet", "major"],
      ["second", "second-major-workbook", "Second Major", "major_checksheet", "additional_major"],
      ["minor", "minor-workbook", "Minor", "minor_checksheet", "minor"],
      ["flow", "flowchart-png", "Flowchart", "flowchart", "general"],
    ] as const) {
      const { res, bytes } = await create(MULTI, name, { title, category, programRole: role });
      expect(res.status).toBe(201);
      ids[key] = res.body.id;
      bytesOf[key] = bytes;
    }
    expect(new Set(Object.values(ids)).size).toBe(4);
    expect((await list(MULTI)).body.documents.map((d: any) => d.title)).toEqual([
      "Primary Major",
      "Second Major",
      "Minor",
      "Flowchart",
    ]);
  });

  it("the same file may be uploaded twice, as two separate documents", async () => {
    const again = await create(MULTI, "minor-workbook", { title: "Minor (tentative plan)", category: "minor_checksheet" });
    expect(again.res.status).toBe(201);
    expect(again.res.body.id).not.toBe(ids["minor"]);
    const docs = (await list(MULTI)).body.documents;
    const same = docs.filter((d: any) => d.fileFingerprint === again.res.body.fileFingerprint);
    expect(same.map((d: any) => d.title)).toEqual(["Minor", "Minor (tentative plan)"]);
    ids["minorCopy"] = again.res.body.id;
  });

  it("tracking one does not appear on another, even at the same cell", async () => {
    await annotate(MULTI, ids["major"]!, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "completed" });
    await annotate(MULTI, ids["minor"]!, { anchorType: "sheet_cell", anchor: STATUS_CELL, status: "planned" });
    const of = async (key: string) => (await annotations(MULTI, ids[key]!)).body.annotations.map((a: any) => a.status);
    expect(await of("major")).toEqual(["completed"]);
    expect(await of("minor")).toEqual(["planned"]);
    expect(await of("second")).toEqual([]);
    expect(await of("minorCopy")).toEqual([]);
    expect(await of("flow")).toEqual([]);
  });

  it("an entry cannot be reached through another document's address", async () => {
    const [entry] = (await annotations(MULTI, ids["major"]!)).body.annotations;
    expect((await patch(MULTI, ids["second"]!, entry.id, { status: "planned" })).status).toBe(404);
    const del = await as(MULTI, request(app).delete(`/api/degree-checksheets/${ids["second"]}/annotations/${entry.id}`));
    expect(del.status).toBe(404);
    expect((await annotations(MULTI, ids["major"]!)).body.annotations[0].status).toBe("completed");
  });

  it("renaming and replacing one leaves the others exactly as they were", async () => {
    const snapshot = async () =>
      (await list(MULTI)).body.documents.filter((d: any) => d.id !== ids["second"]);
    const before = await snapshot();
    await as(MULTI, request(app).patch(`/api/degree-checksheets/${ids["second"]}`)).send({ title: "Gadget Studies" });
    const { res } = await replaceWith(MULTI, ids["second"]!, "major-pdf");
    expect(res.status).toBe(200);
    expect(await snapshot()).toEqual(before);
    for (const key of ["major", "minor", "flow"]) {
      expect(sha(await originalOf(MULTI, ids[key]!)), key).toBe(sha(bytesOf[key]!));
    }
    expect((await annotations(MULTI, ids["major"]!)).body.annotations[0]).toMatchObject({ status: "completed", detached: false });
  });

  it("deleting one removes its file and its tracking, and nothing else", async () => {
    const files = filesOnDisk().length;
    const res = await as(MULTI, request(app).delete(`/api/degree-checksheets/${ids["minor"]}`));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });

    expect(filesOnDisk()).toHaveLength(files - 1);
    expect((await as(MULTI, request(app).get(`/api/degree-checksheets/${ids["minor"]}`))).status).toBe(404);
    expect((await as(MULTI, request(app).get(`/api/degree-checksheets/${ids["minor"]}/file`))).status).toBe(404);
    expect((await annotations(MULTI, ids["minor"]!)).status).toBe(404);
    const orphans = await db
      .select()
      .from(degreeChecksheetAnnotationsTable)
      .where(eq(degreeChecksheetAnnotationsTable.documentId, ids["minor"]!));
    expect(orphans).toEqual([]);

    // "Gadget Studies" is still what the student called a major checksheet: replacing
    // its file changed the file, not the student's description of it.
    expect((await list(MULTI)).body.documents.map((d: any) => d.title)).toEqual([
      "Primary Major",
      "Gadget Studies",
      "Minor (tentative plan)",
      "Flowchart",
    ]);
    // The identical file uploaded as a second document is untouched.
    expect(sha(await originalOf(MULTI, ids["minorCopy"]!))).toBe(sha(bytesOf["minor"]!));
    expect((await annotations(MULTI, ids["major"]!)).body.annotations).toHaveLength(1);
    expect((await as(MULTI, request(app).delete(`/api/degree-checksheets/${ids["minor"]}`))).status).toBe(404);
  });

  it("caps how many documents one student may keep", async () => {
    const docs = await db
      .select()
      .from(degreeChecksheetDocumentsTable)
      .where(eq(degreeChecksheetDocumentsTable.userId, MULTI));
    const template = docs[0]!;
    const { id: _id, ...rest } = template;
    await db.insert(degreeChecksheetDocumentsTable).values(
      Array.from({ length: 30 - docs.length }, (_, i) => ({
        ...rest,
        title: `Filler ${i}`,
        // Fillers share no storage object with a real document.
        objectPath: `/objects/uploads/0000000000000000/00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      })),
    );
    const { res } = await create(MULTI, "major-pdf", { title: "One too many" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/30/);
  });
});

describe("a checklist with ONE student column, as the real ones have", () => {
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  /** Requirements on the left with "Quarter Completed"; synthetic wording. */
  async function checklist(rows: string[]): Promise<Buffer> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Checklist");
    ws.addRow(["Requirements", "Quarter Completed"]);
    for (const row of rows) ws.addRow([row, null]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const ROW_1 = { sheet: 0, row: 1, col: 1 };
  const ROW_2 = { sheet: 0, row: 2, col: 1 };
  let id: number;

  it("offers the column for both a status and a quarter", async () => {
    const bytes = await checklist(["Introduction to Widgetry", "Widget Mathematics I", "Widget Ethics"]);
    const res = await createRaw(TRACK, bytes, "widgetry-checklist.xlsx", XLSX, { title: "Widgetry checklist" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.inlineTracking).toBe(true);
    id = res.body.id;
    const render = await as(TRACK, request(app).get(`/api/degree-checksheets/${id}/render`));
    expect(render.body.render.sheets[0].tracking.columns).toEqual([
      { c: 1, field: "both", header: "Quarter Completed", headerRow: 0 },
    ]);
  });

  it("holds a status AND a quarter in one cell, as one entry", async () => {
    const first = await annotate(TRACK, id, { anchorType: "sheet_cell", anchor: ROW_1, status: "completed" });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ field: "both", status: "completed", term: null });
    const second = await annotate(TRACK, id, { anchorType: "sheet_cell", anchor: ROW_1, term: "fall", termYear: 2025 });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ id: first.body.id, field: "both", status: "completed", term: "fall", termYear: 2025 });
    expect((await annotations(TRACK, id)).body.annotations).toHaveLength(1);
  });

  it("after a reworded replacement, the student can put the detached entry into a cell of the new file", async () => {
    const entry = (await annotations(TRACK, id)).body.annotations[0];
    const bytes = await checklist(["History of Widgets", "Widget Mathematics I", "Widget Ethics"]);
    const objectPath = await putBytes(TRACK, bytes, XLSX, "widgetry-checklist-2.xlsx");
    const replaced = await as(TRACK, request(app).put(`/api/degree-checksheets/${id}/file`)).send({
      objectPath,
      fileName: "widgetry-checklist-2.xlsx",
      fileSize: bytes.length,
      contentType: XLSX,
    });
    expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
    expect(replaced.body.tracking).toEqual({ kept: 0, detached: 1, moved: 0 });

    const detached = (await annotations(TRACK, id)).body.annotations[0];
    expect(detached).toMatchObject({
      id: entry.id,
      detached: true,
      field: "both",
      status: "completed",
      term: "fall",
      itemLabel: "Introduction to Widgetry",
    });

    // A cell that is taken is refused; a free one takes the entry with everything it held.
    const taken = await annotate(TRACK, id, { anchorType: "sheet_cell", anchor: ROW_2, status: "planned" });
    expect(taken.status).toBe(201);
    expect((await patch(TRACK, id, entry.id, { anchor: ROW_2 })).status).toBe(400);
    expect((await patch(TRACK, id, entry.id, { anchor: { sheet: 0, row: 0, col: 1 } })).status).toBe(400);

    const placed = await patch(TRACK, id, entry.id, { anchor: ROW_1 });
    expect(placed.status, JSON.stringify(placed.body)).toBe(200);
    expect(placed.body).toMatchObject({
      id: entry.id,
      anchorType: "sheet_cell",
      anchor: ROW_1,
      detached: false,
      field: "both",
      status: "completed",
      term: "fall",
      termYear: 2025,
    });

    // It now belongs to the new file: the same file again keeps it in place.
    const again = await putBytes(TRACK, bytes, XLSX, "widgetry-checklist-2.xlsx");
    const same = await as(TRACK, request(app).put(`/api/degree-checksheets/${id}/file`)).send({
      objectPath: again,
      fileName: "widgetry-checklist-2.xlsx",
      fileSize: bytes.length,
      contentType: XLSX,
    });
    expect(same.body.tracking).toEqual({ kept: 2, detached: 0, moved: 0 });
  });

  it("will not put an entry that holds a quarter into a Status-only column", async () => {
    const major = await create(TRACK, "major-workbook", { title: "Status and quarter columns" });
    const both = await annotate(TRACK, major.res.body.id, { anchorType: "sheet_cell", anchor: TERM_CELL, term: "fall", termYear: 2025 });
    await replaceWith(TRACK, major.res.body.id, "major-workbook-reworded");
    const refused = await patch(TRACK, major.res.body.id, both.body.id, { anchor: STATUS_CELL });
    expect(refused.status).toBe(400);
    expect((await annotations(TRACK, major.res.body.id)).body.annotations[0]).toMatchObject({ detached: true, term: "fall" });
  });
});

describe("what is written to the log", () => {
  it("records the events of a document's life", () => {
    const events = new Set(logged.map((entry) => (entry as any[])[0]?.event).filter(Boolean));
    for (const event of [
      "checksheet_upload_started",
      "checksheet_document_validated",
      "checksheet_preview_processed",
      "checksheet_annotation_saved",
      "checksheet_annotation_deleted",
      "checksheet_document_replaced",
      "checksheet_document_deleted",
      "checksheet_processing_failed",
      "checksheet_replacement_failed",
    ]) {
      expect(events, event).toContain(event);
    }
  });

  it("never records a title, a note, a label, a file name, a path or any document text", () => {
    const text = JSON.stringify(logged);
    for (const secret of [
      "Widget",
      "WIDG",
      "Sprocket",
      "Gadget",
      "Applied Widgetry",
      "Ask advisor",
      "Took with lab",
      "Study abroad",
      "Senior capstone",
      "applied-widgetry-major",
      ".xlsx",
      ".pdf",
      "/objects/",
      "scu.edu",
      "example.edu",
      OWNER,
      TRACK,
    ]) {
      expect(text, secret).not.toContain(secret);
    }
  });
});
