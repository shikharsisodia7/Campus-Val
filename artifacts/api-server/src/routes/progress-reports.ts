/**
 * Academic Progress Report documents — many per student.
 *
 * DESIGN PRINCIPLE. The Workday APR is the source of truth. CampusVal stores
 * the file, keeps a structural copy of the workbook, and shows it. It does not
 * match courses, judge requirements, or produce an audit of its own.
 *
 * PRIVACY. Every handler derives the owner from the authenticated session
 * (`req.userId`) and every query is scoped `WHERE user_id = <that id>`, so a
 * document id belonging to someone else is indistinguishable from one that
 * does not exist (404). Responses never contain the storage path or the owner
 * id, and nothing here logs file content, cell text, file names or paths.
 */
import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  progressReportsTable,
  progressReportMappingsTable,
  studentProfilesTable,
  type ProgressReportRow,
} from "@workspace/db";
import {
  CreateProgressReportBody,
  ReplaceProgressReportFileBody,
  UpdateProgressReportDocumentBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { isAdminUser } from "../lib/admin";
import {
  getPrivateObjectStorage,
  isPrivateStorageConfigured,
  ObjectNotFoundError,
  type PrivateObjectStorage,
} from "../lib/storage";
import { sendPrivateFile } from "../lib/private-file-response";
import { aprMaxUploadBytes, aprMaxUploadLabel, APR_MAX_DOCUMENTS_PER_USER } from "../lib/apr/limits";
import { readAprWorkbook, workbookPlainText } from "../lib/apr/workbook-reader";
import { readAprPdf } from "../lib/apr/pdf-table-reader";
import { projectForSidebar, projectionStats } from "../lib/apr/sidebar-projection";
import { assessWorkbook, ASSESSMENT_RULE_VERSION } from "../lib/degree-completion/engine";
import {
  ASSESSMENT_DISCLAIMER,
  AssessmentError,
  assessmentEnabled,
  assessmentOptions,
  deleteCorrection,
  findItem,
  listCorrections,
  mergeCorrections,
  saveCorrection,
} from "../lib/degree-completion/service";
import { z } from "zod/v4";
import { extractStudentId } from "../lib/apr/identity";
import {
  APR_IMPORT_ERROR_MESSAGE,
  AprImportError,
  type AprImportErrorCode,
  type AprWorkbook,
} from "../lib/apr/workbook-model";

const router: IRouter = Router();

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_TYPE = "application/pdf";
/** Browsers on some systems report no type, or a generic one, for .xlsx. */
const GENERIC_TYPES = new Set(["", "application/octet-stream", "application/zip", "application/x-zip-compressed"]);

const CATEGORY_RANK: Record<string, number> = {
  primary_major: 0,
  second_major: 1,
  additional_major: 2,
  minor: 3,
  additional_minor: 4,
  other: 5,
};

type SourceFormat = "xlsx" | "pdf";
type ImportStatus = "processing" | "ready" | "unsupported" | "failed";

/** Everything except the two large JSON columns — for lists and metadata. */
const META_COLUMNS = {
  id: progressReportsTable.id,
  userId: progressReportsTable.userId,
  label: progressReportsTable.label,
  category: progressReportsTable.category,
  displayOrder: progressReportsTable.displayOrder,
  fileName: progressReportsTable.fileName,
  fileSize: progressReportsTable.fileSize,
  contentType: progressReportsTable.contentType,
  sourceFormat: progressReportsTable.sourceFormat,
  fileHash: progressReportsTable.fileHash,
  objectPath: progressReportsTable.objectPath,
  uploadedAt: progressReportsTable.uploadedAt,
  importError: progressReportsTable.importError,
  parseStatus: progressReportsTable.parseStatus,
  createdAt: progressReportsTable.createdAt,
  updatedAt: progressReportsTable.updatedAt,
  sheetCount: sql<number>`coalesce(jsonb_array_length(${progressReportsTable.workbook} -> 'sheets'), 0)`,
  hasWorkbook: sql<boolean>`${progressReportsTable.workbook} is not null`,
};

type MetaRow = Omit<ProgressReportRow, "workbook" | "parsed"> & { sheetCount: number; hasWorkbook: boolean };

function importStatusOf(row: Pick<MetaRow, "parseStatus">): ImportStatus {
  switch (row.parseStatus) {
    case "parsed":
      return "ready";
    case "unsupported":
      return "unsupported";
    case "failed":
      return "failed";
    default:
      return "processing";
  }
}

function isImportErrorCode(code: string | null): code is AprImportErrorCode {
  return !!code && code in APR_IMPORT_ERROR_MESSAGE;
}

/**
 * The client DTO. Deliberately has no `userId` (always the caller) and no
 * `objectPath` (an internal storage location).
 */
function documentDto(row: MetaRow) {
  const status = importStatusOf(row);
  const errorCode = status === "failed" || status === "unsupported" ? (row.importError ?? "processing_failed") : null;
  return {
    id: row.id,
    label: row.label,
    category: row.category in CATEGORY_RANK ? row.category : "other",
    displayOrder: row.displayOrder,
    fileName: row.fileName,
    fileSize: row.fileSize,
    contentType: row.contentType,
    sourceFormat: (row.sourceFormat === "xlsx" ? "xlsx" : "pdf") as SourceFormat,
    uploadedAt: row.uploadedAt.toISOString(),
    importStatus: status,
    importErrorCode: errorCode,
    importErrorMessage: errorCode
      ? APR_IMPORT_ERROR_MESSAGE[isImportErrorCode(errorCode) ? errorCode : "processing_failed"]
      : null,
    sheetCount: Number(row.sheetCount) || 0,
    /** The structural copy was recovered from a PDF's text positions. */
    tableFromPdf: row.sourceFormat !== "xlsx" && row.hasWorkbook,
    fileFingerprint: row.fileHash ? row.fileHash.slice(0, 12) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sortDocuments<T extends { category: string; displayOrder: number; id: number }>(rows: T[]): T[] {
  const rank = (c: string) => CATEGORY_RANK[c] ?? CATEGORY_RANK["other"]!;
  return [...rows].sort(
    (a, b) => rank(a.category) - rank(b.category) || a.displayOrder - b.displayOrder || a.id - b.id,
  );
}

function parseId(req: Request): number | null {
  const id = Number(req.params["id"]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function listOwned(userId: string): Promise<MetaRow[]> {
  const rows = await db
    .select(META_COLUMNS)
    .from(progressReportsTable)
    .where(eq(progressReportsTable.userId, userId))
    .orderBy(asc(progressReportsTable.displayOrder), asc(progressReportsTable.id));
  return sortDocuments(rows);
}

/** One document, only if the caller owns it. */
async function findOwned(userId: string, id: number): Promise<MetaRow | null> {
  const rows = await db
    .select(META_COLUMNS)
    .from(progressReportsTable)
    .where(and(eq(progressReportsTable.id, id), eq(progressReportsTable.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

async function workbookOf(userId: string, id: number): Promise<AprWorkbook | null> {
  const rows = await db
    .select({ workbook: progressReportsTable.workbook })
    .from(progressReportsTable)
    .where(and(eq(progressReportsTable.id, id), eq(progressReportsTable.userId, userId)))
    .limit(1);
  return (rows[0]?.workbook as AprWorkbook | null | undefined) ?? null;
}

// ─── file intake ─────────────────────────────────────────────────────────────

interface FileInput {
  objectPath: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

type Intake =
  | {
      ok: true;
      sourceFormat: SourceFormat;
      contentType: string;
      fileName: string;
      size: number;
      hash: string;
      workbook: AprWorkbook | null;
      /** Why there is no structural copy, when the file itself was accepted. */
      note: AprImportErrorCode | null;
    }
  | { ok: false; status: number; error: string; code?: string };

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

/** Extension AND declared type must agree on a supported format. */
export function resolveSourceFormat(fileName: string, contentType: string): SourceFormat | null {
  const ext = extensionOf(fileName);
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  if (ext === ".xlsx" && (type === XLSX_TYPE || GENERIC_TYPES.has(type))) return "xlsx";
  if (ext === ".pdf" && (type === PDF_TYPE || GENERIC_TYPES.has(type))) return "pdf";
  return null;
}

async function readAll(stream: NodeJS.ReadableStream, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    total += buf.length;
    if (total > limit) throw new AprImportError("too_large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function discard(storage: PrivateObjectStorage, objectPath: string, log: Request["log"], reason: string) {
  try {
    await storage.deleteObject(objectPath);
  } catch {
    // Category only: the path and file name are private.
    log.warn({ event: "apr_object_cleanup_failed", reason }, "Could not remove an APR object");
  }
}

/**
 * Validates, downloads and processes an uploaded file WITHOUT touching the
 * database. The caller commits only on success, so a bad upload can never
 * displace a good document.
 */
async function intake(req: Request, userId: string, input: FileInput): Promise<Intake> {
  const maxBytes = aprMaxUploadBytes();
  const fileName = input.fileName.trim();
  const objectPath = input.objectPath.trim();

  if (!objectPath.startsWith("/objects/")) {
    return { ok: false, status: 400, error: "objectPath must be a string starting with /objects/." };
  }
  if (!fileName) return { ok: false, status: 400, error: "fileName is required." };
  if (input.fileSize > maxBytes) {
    return { ok: false, status: 400, error: `File size exceeds the ${aprMaxUploadLabel()} limit.` };
  }
  const sourceFormat = resolveSourceFormat(fileName, input.contentType);
  if (!sourceFormat) {
    return {
      ok: false,
      status: 400,
      code: "unsupported_type",
      error: APR_IMPORT_ERROR_MESSAGE.unsupported_type,
    };
  }

  const storage = await getPrivateObjectStorage();

  // Ownership BEFORE contents: the path is owner-bound when it is minted, so a
  // path minted for another student is refused here.
  if (!storage.isUploadPathOwnedBy(objectPath, userId)) {
    return { ok: false, status: 403, error: "Forbidden." };
  }

  let actualSize = 0;
  try {
    actualSize = (await storage.getMetadata(objectPath)).size;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return { ok: false, status: 400, error: "Uploaded file not found. Upload the file first, then register it." };
    }
    req.log.error({ event: "apr_processing_failed", category: "storage_failure" }, "Could not read APR object metadata");
    return { ok: false, status: 500, error: "Could not verify the uploaded file." };
  }
  if (!actualSize || actualSize > maxBytes) {
    await discard(storage, objectPath, req.log, "oversize_or_empty");
    return {
      ok: false,
      status: 400,
      error: `File size exceeds the ${aprMaxUploadLabel()} limit (or the file is empty).`,
    };
  }

  try {
    await storage.finalizeUpload(objectPath, userId);
  } catch {
    req.log.error({ event: "apr_processing_failed", category: "storage_failure" }, "Could not finalize APR object");
    return { ok: false, status: 500, error: "Could not secure the uploaded file. Try again." };
  }

  let bytes: Buffer;
  try {
    const { stream } = await storage.downloadObject(objectPath);
    bytes = await readAll(stream, maxBytes);
  } catch (err) {
    await discard(storage, objectPath, req.log, "download_failed");
    if (err instanceof AprImportError) {
      return { ok: false, status: 400, error: `File size exceeds the ${aprMaxUploadLabel()} limit.` };
    }
    req.log.error({ event: "apr_processing_failed", category: "storage_failure" }, "Could not download APR object");
    return { ok: false, status: 400, error: "Could not access the uploaded file. Try uploading it again." };
  }

  let workbook: AprWorkbook | null = null;
  let note: AprImportErrorCode | null = null;
  let plainText = "";
  try {
    if (sourceFormat === "xlsx") {
      workbook = await readAprWorkbook(bytes);
      plainText = workbookPlainText(workbook);
    } else {
      const read = await readPdfTable(bytes);
      workbook = read.workbook;
      note = read.note;
      if (workbook) plainText = workbookPlainText(workbook);
      if (note) req.log.warn({ event: "apr_structure_warning", warning: note, sourceFormat }, "PDF kept as an original only");
    }
  } catch (err) {
    const code: AprImportErrorCode = err instanceof AprImportError ? err.code : "processing_failed";
    req.log.warn({ event: "apr_processing_failed", category: code, sourceFormat }, "APR file rejected");
    await discard(storage, objectPath, req.log, "rejected");
    return { ok: false, status: 422, code, error: APR_IMPORT_ERROR_MESSAGE[code] };
  }
  req.log.info({ event: "apr_workbook_validated", sourceFormat }, "APR file validated");

  // Identity guard (not an academic judgment): when the file states a student
  // ID and the student's profile has one on record, a mismatch means the file
  // belongs to someone else. A file with no stated ID is accepted.
  const statedId = plainText ? extractStudentId(plainText) : undefined;
  if (statedId) {
    const profile = await db
      .select({ studentId: studentProfilesTable.studentId })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, userId))
      .limit(1);
    const onRecord = profile[0]?.studentId?.trim() || null;
    if (onRecord && onRecord.toUpperCase() !== statedId.toUpperCase()) {
      await discard(storage, objectPath, req.log, "identity_mismatch");
      // The document's ID is never echoed: it may identify another student.
      return {
        ok: false,
        status: 422,
        code: "identity_mismatch",
        error:
          "This report appears to belong to a different student. Please upload your own Academic Progress Report.",
      };
    }
  }

  return {
    ok: true,
    sourceFormat,
    contentType: sourceFormat === "xlsx" ? XLSX_TYPE : PDF_TYPE,
    fileName,
    size: actualSize,
    hash: createHash("sha256").update(bytes).digest("hex"),
    workbook,
    note,
  };
}

/**
 * A PDF is always kept as an original. Its table is read when it can be
 * (pdf-table-reader.ts); when it cannot, the PDF is still accepted and simply
 * has no structural copy. Only bytes that are not a PDF at all are refused.
 */
async function readPdfTable(bytes: Buffer): Promise<{ workbook: AprWorkbook | null; note: AprImportErrorCode | null }> {
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AprImportError("unsupported_type");
  try {
    return { workbook: await readAprPdf(bytes), note: null };
  } catch (err) {
    if (err instanceof AprImportError && err.code === "too_large") throw err;
    return { workbook: null, note: "unrecognized_pdf" };
  }
}

/**
 * A document uploaded before workbooks were stored (or whose import never ran)
 * has a file but no structural copy. It is imported from the stored original
 * the first time it is read. Best effort: on failure the document is marked
 * failed and the others are unaffected.
 */
async function importIfNeeded(req: Request, row: MetaRow): Promise<MetaRow> {
  if (row.hasWorkbook) return row;
  if (row.parseStatus === "failed" || row.parseStatus === "unsupported") return row;
  // A PDF whose table could not be read has been tried already.
  if (row.sourceFormat !== "xlsx" && row.importError === "unrecognized_pdf") return row;

  let outcome: { workbook: AprWorkbook | null; status: string; error: string | null; hash: string | null };
  try {
    const storage = await getPrivateObjectStorage();
    const { stream } = await storage.downloadObject(row.objectPath);
    const bytes = await readAll(stream, aprMaxUploadBytes());
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (row.sourceFormat === "xlsx") {
      outcome = { workbook: await readAprWorkbook(bytes), status: "parsed", error: null, hash };
    } else {
      const read = await readPdfTable(bytes);
      outcome = { workbook: read.workbook, status: "parsed", error: read.note, hash };
    }
  } catch (err) {
    const code: AprImportErrorCode =
      err instanceof AprImportError
        ? err.code
        : err instanceof ObjectNotFoundError
          ? "storage_failure"
          : "processing_failed";
    req.log.warn({ event: "apr_processing_failed", category: code, reportId: row.id }, "Stored APR could not be imported");
    outcome = { workbook: null, status: "failed", error: code, hash: null };
  }

  await db
    .update(progressReportsTable)
    .set({
      workbook: outcome.workbook,
      parseStatus: outcome.status,
      importError: outcome.error,
      ...(outcome.hash ? { fileHash: outcome.hash } : {}),
      // The file did not change, so its upload date does not either.
    })
    .where(and(eq(progressReportsTable.id, row.id), eq(progressReportsTable.userId, row.userId)));
  return (await findOwned(row.userId, row.id)) ?? row;
}

function noStore(res: { setHeader(name: string, value: string): void }) {
  // An APR is a student record: it must not linger in a shared machine's cache.
  res.setHeader("Cache-Control", "private, no-store");
}

// ─── routes ──────────────────────────────────────────────────────────────────

router.get("/progress-reports", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const limits = { maxUploadBytes: aprMaxUploadBytes(), maxDocuments: APR_MAX_DOCUMENTS_PER_USER };
  if (!isPrivateStorageConfigured()) {
    res.json({ available: false, reports: [], ...limits });
    return;
  }
  const userId = req.userId!;
  const rows = await listOwned(userId);
  const current = await Promise.all(rows.map((row) => importIfNeeded(req, row)));
  res.json({ available: true, reports: current.map(documentDto), ...limits });
});

router.post("/progress-reports", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const parsed = CreateProgressReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A label, file name, size, type and object path are required." });
    return;
  }
  const label = parsed.data.label.trim();
  if (!label) {
    res.status(400).json({ error: "Give this APR a label, for example “Finance Major”." });
    return;
  }

  const existing = await listOwned(userId);
  if (existing.length >= APR_MAX_DOCUMENTS_PER_USER) {
    res.status(409).json({
      error: `You can keep up to ${APR_MAX_DOCUMENTS_PER_USER} APR documents. Remove one before adding another.`,
    });
    return;
  }

  req.log.info({ event: "apr_upload_started", kind: "create" }, "APR upload started");
  const result = await intake(req, userId, parsed.data);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, ...(result.code ? { code: result.code } : {}) });
    return;
  }

  const nextOrder = existing.reduce((max, row) => Math.max(max, row.displayOrder), -1) + 1;
  const inserted = await db
    .insert(progressReportsTable)
    .values({
      userId,
      label,
      category: parsed.data.category ?? "other",
      displayOrder: nextOrder,
      fileName: result.fileName,
      fileSize: result.size,
      contentType: result.contentType,
      sourceFormat: result.sourceFormat,
      fileHash: result.hash,
      objectPath: parsed.data.objectPath.trim(),
      workbook: result.workbook,
      parseStatus: "parsed",
      importError: result.note,
    })
    .returning({ id: progressReportsTable.id });

  const row = await findOwned(userId, inserted[0]!.id);
  req.log.info(
    {
      event: "apr_workbook_processed",
      reportId: row!.id,
      sourceFormat: result.sourceFormat,
      ...(result.workbook ? projectionStats(projectForSidebar(result.workbook)) : {}),
    },
    "APR document created",
  );
  res.status(201).json(documentDto(row!));
});

router.get("/progress-reports/sidebar", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.json({ available: false, documents: [] });
    return;
  }
  const userId = req.userId!;
  const rows = await listOwned(userId);

  const documents = [];
  for (const listed of rows) {
    // Each document stands alone: a problem with one is reported for that one only.
    try {
      const row = await importIfNeeded(req, listed);
      const report = documentDto(row);
      if (report.importStatus === "failed" || report.importStatus === "unsupported") {
        documents.push({ report, state: "import_failed" as const, sheets: [] });
        continue;
      }
      if (report.importStatus === "processing") {
        documents.push({ report, state: "processing" as const, sheets: [] });
        continue;
      }
      const workbook = await workbookOf(userId, row.id);
      if (!workbook) {
        // A PDF whose table could not be read is still a good original.
        const state = report.sourceFormat === "pdf" ? ("original_only" as const) : ("import_failed" as const);
        documents.push({ report, state, sheets: [] });
        continue;
      }
      const projection = projectForSidebar(workbook);
      const anyStructured = projection.sheets.some((s) => s.structured);
      if (!anyStructured) {
        req.log.warn({ event: "apr_structure_warning", reportId: row.id, warning: "header_not_found" }, "APR layout not recognised");
      }
      documents.push({
        report,
        state: anyStructured ? ("ready" as const) : ("unrecognized_layout" as const),
        sheets: projection.sheets,
      });
    } catch {
      req.log.error({ event: "apr_processing_failed", category: "processing_failed", reportId: listed.id }, "APR sidebar projection failed");
      documents.push({
        report: { ...documentDto(listed), importStatus: "failed" as const, importErrorCode: "processing_failed", importErrorMessage: APR_IMPORT_ERROR_MESSAGE.processing_failed },
        state: "import_failed" as const,
        sheets: [],
      });
    }
  }
  res.json({ available: true, documents });
});

// ─── Degree Completion Assessment ────────────────────────────────────────────
//
// CampusVal's planning interpretation of the student's OWN APRs (see
// lib/degree-completion). Owner-only, exactly like the APR it derives from:
// every query below is scoped to req.userId and a document id is only ever
// accepted for a document that user owns. Nothing here is reachable through a
// plan share. It never writes to progress_reports.

/**
 * Degree Completion Assessment is private R&D, not a normal APR capability.
 * Keep this server-side check next to every endpoint so hiding a page or nav
 * item can never expose a derived academic claim to a pilot student.
 */
function requireAssessmentRndAccess(req: Request, res: Response): boolean {
  if (assessmentEnabled() && req.userEmail && isAdminUser(req.userEmail)) return true;
  noStore(res);
  // Do not advertise an internal route to a signed-in non-admin user.
  res.status(404).json({ error: "Not found." });
  return false;
}

router.get("/progress-reports/assessment", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!requireAssessmentRndAccess(req, res)) return;
  const base = { enabled: assessmentEnabled(), disclaimer: ASSESSMENT_DISCLAIMER, ruleVersion: ASSESSMENT_RULE_VERSION };
  if (!isPrivateStorageConfigured()) {
    res.json({ ...base, available: false, documents: [] });
    return;
  }
  const userId = req.userId!;
  const options = assessmentOptions();
  const rows = await listOwned(userId);
  const corrections = await listCorrections(userId, rows.map((r) => r.id));
  type Merged = ReturnType<typeof mergeCorrections>;
  const documents: {
    report: ReturnType<typeof documentDto>;
    state: "ready" | "unrecognized_layout" | "unavailable";
    programs: Merged["programs"];
    unassessableSheets: ReturnType<typeof assessWorkbook>["unassessableSheets"];
    orphaned: Merged["orphaned"];
    summary: Merged["summary"] | null;
  }[] = [];
  for (const listed of rows) {
    const report = documentDto(listed);
    const mine = corrections.filter((c) => c.aprDocumentId === listed.id);
    try {
      const row = await importIfNeeded(req, listed);
      const workbook = row.hasWorkbook ? await workbookOf(userId, row.id) : null;
      if (!workbook) {
        documents.push({ report: documentDto(row), state: "unavailable", programs: [], unassessableSheets: [], orphaned: [], summary: null });
        continue;
      }
      const assessment = assessWorkbook(workbook, options);
      const merged = mergeCorrections(assessment, mine);
      documents.push({
        report: documentDto(row),
        state: merged.programs.length > 0 ? "ready" : "unrecognized_layout",
        programs: merged.programs,
        unassessableSheets: assessment.unassessableSheets,
        orphaned: merged.orphaned,
        summary: merged.summary,
      });
    } catch {
      req.log.error({ event: "degree_completion_failed", reportId: listed.id }, "Degree Completion Assessment failed");
      documents.push({ report, state: "unavailable", programs: [], unassessableSheets: [], orphaned: [], summary: null });
    }
  }
  req.log.info(
    { event: "degree_completion_assessed", documents: documents.length, items: documents.reduce((n, d) => n + d.programs.reduce((m, p) => m + p.items.length, 0), 0) },
    "Degree Completion Assessment built",
  );
  res.json({ ...base, available: true, options, documents });
});

const CorrectionBody = z
  .object({
    status: z.enum(["remaining", "complete"]).nullable().optional(),
    hidden: z.boolean().optional(),
    note: z.string().max(4000).nullable().optional(),
  })
  .strict()
  .refine((b) => b.status !== undefined || b.hidden !== undefined || b.note !== undefined, { message: "Nothing to change." });

const ITEM_KEY_RE = /^[0-9a-f]{16}$/;

router.put("/progress-reports/:id/assessment/items/:itemKey", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!requireAssessmentRndAccess(req, res)) return;
  const id = parseId(req);
  const itemKey = String(req.params["itemKey"] ?? "");
  const parsed = CorrectionBody.safeParse(req.body);
  if (id === null || !ITEM_KEY_RE.test(itemKey) || !parsed.success) {
    res.status(400).json({ error: "Invalid correction." });
    return;
  }
  const userId = req.userId!;
  // Ownership first: someone else's document is "not found", the same as a missing one.
  const row = await findOwned(userId, id);
  if (!row) {
    res.status(404).json({ error: "APR not found." });
    return;
  }
  try {
    const workbook = row.hasWorkbook ? await workbookOf(userId, id) : null;
    const item = workbook ? findItem(assessWorkbook(workbook, assessmentOptions()), itemKey) : null;
    if (!item) {
      res.status(404).json({ error: "That requirement is no longer in this APR. You can reset the correction instead." });
      return;
    }
    const saved = await saveCorrection(userId, id, item, parsed.data);
    res.json({ saved: saved !== null, itemKey });
  } catch (error) {
    if (error instanceof AssessmentError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ event: "degree_completion_correction_failed", reportId: id }, "Correction could not be saved");
    res.status(500).json({ error: "The correction could not be saved." });
  }
});

router.delete("/progress-reports/:id/assessment/items/:itemKey", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!requireAssessmentRndAccess(req, res)) return;
  const id = parseId(req);
  const itemKey = String(req.params["itemKey"] ?? "");
  if (id === null || !ITEM_KEY_RE.test(itemKey)) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }
  const userId = req.userId!;
  if (!(await findOwned(userId, id))) {
    res.status(404).json({ error: "APR not found." });
    return;
  }
  await deleteCorrection(userId, id, itemKey);
  res.status(204).end();
});

router.get("/progress-reports/:id", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseId(req);
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json({ error: "No such Academic Progress Report." });
    return;
  }
  res.json(documentDto(await importIfNeeded(req, row)));
});

router.patch("/progress-reports/:id", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseId(req);
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json({ error: "No such Academic Progress Report." });
    return;
  }
  const parsed = UpdateProgressReportDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid label, category or order." });
    return;
  }
  const changes: Partial<typeof progressReportsTable.$inferInsert> = {};
  if (parsed.data.label !== undefined) {
    const label = parsed.data.label.trim();
    if (!label) {
      res.status(400).json({ error: "The label cannot be empty." });
      return;
    }
    changes.label = label;
  }
  if (parsed.data.category !== undefined) changes.category = parsed.data.category;
  if (parsed.data.displayOrder !== undefined) changes.displayOrder = parsed.data.displayOrder;
  if (Object.keys(changes).length > 0) {
    await db
      .update(progressReportsTable)
      .set(changes)
      .where(and(eq(progressReportsTable.id, row.id), eq(progressReportsTable.userId, userId)));
  }
  res.json(documentDto((await findOwned(userId, row.id))!));
});

router.put("/progress-reports/:id/file", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const id = parseId(req);
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json({ error: "No such Academic Progress Report." });
    return;
  }
  const parsed = ReplaceProgressReportFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A file name, size, type and object path are required." });
    return;
  }

  req.log.info({ event: "apr_upload_started", kind: "replace", reportId: row.id }, "APR replacement started");
  // Validate and process the NEW file first. Until this succeeds the document
  // is not modified, so a failed replacement leaves the last good file in place.
  const result = await intake(req, userId, parsed.data);
  if (!result.ok) {
    req.log.warn({ event: "apr_replacement_failed", reportId: row.id, category: result.code ?? "validation" }, "APR replacement rejected");
    res.status(result.status).json({ error: result.error, ...(result.code ? { code: result.code } : {}) });
    return;
  }

  const newPath = parsed.data.objectPath.trim();
  const previousPath = row.objectPath;
  // One statement switches the file, its structural copy, its hash and its date
  // together — the old workbook can never stay attached to the new file.
  await db
    .update(progressReportsTable)
    .set({
      fileName: result.fileName,
      fileSize: result.size,
      contentType: result.contentType,
      sourceFormat: result.sourceFormat,
      fileHash: result.hash,
      objectPath: newPath,
      workbook: result.workbook,
      parsed: null,
      parseStatus: "parsed",
      importError: result.note,
      uploadedAt: new Date(),
    })
    .where(and(eq(progressReportsTable.id, row.id), eq(progressReportsTable.userId, userId)));

  if (previousPath !== newPath) {
    await discard(await getPrivateObjectStorage(), previousPath, req.log, "replaced");
  }
  req.log.info({ event: "apr_replacement_succeeded", reportId: row.id, sourceFormat: result.sourceFormat }, "APR replaced");
  res.json(documentDto((await findOwned(userId, row.id))!));
});

router.delete("/progress-reports/:id", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const id = parseId(req);
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json({ error: "No such Academic Progress Report." });
    return;
  }

  // Record first (it holds the workbook copy), then the file. If the file
  // cannot be removed the student's view is still correct; the failure is
  // logged by document id so an operator can clear the orphaned object.
  await db.transaction(async (tx) => {
    await tx
      .delete(progressReportsTable)
      .where(and(eq(progressReportsTable.id, row.id), eq(progressReportsTable.userId, userId)));
    const remaining = await tx
      .select({ id: progressReportsTable.id })
      .from(progressReportsTable)
      .where(eq(progressReportsTable.userId, userId))
      .limit(1);
    // LEGACY: notes from the retired course-mapping feature described the
    // student's report; they go when the last report does.
    if (remaining.length === 0) {
      await tx.delete(progressReportMappingsTable).where(eq(progressReportMappingsTable.userId, userId));
    }
  });

  const storage = await getPrivateObjectStorage();
  let removed = false;
  for (let attempt = 0; attempt < 2 && !removed; attempt++) {
    try {
      await storage.deleteObject(row.objectPath);
      removed = true;
    } catch {
      removed = false;
    }
  }
  if (!removed) {
    req.log.error({ event: "apr_orphaned_object", reportId: row.id }, "APR record deleted but its file could not be removed");
  }

  // A small JSON body rather than 204: an empty-body response has been seen
  // arriving at the client as a platform-level 503.
  res.status(200).json({ deleted: true });
});

router.get("/progress-reports/:id/workbook", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseId(req);
  const found = id ? await findOwned(userId, id) : null;
  if (!found) {
    res.status(404).json({ error: "No such Academic Progress Report." });
    return;
  }
  const row = await importIfNeeded(req, found);
  const ready = importStatusOf(row) === "ready";
  res.json({ report: documentDto(row), workbook: ready ? await workbookOf(userId, row.id) : null });
});

router.get("/progress-reports/:id/file", requireAuth, async (req, res): Promise<void> => {
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const id = parseId(req);
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json({ error: "No such Academic Progress Report." });
    return;
  }
  try {
    const storage = await getPrivateObjectStorage();
    // Second, independent check: the storage layer's own owner binding.
    if (!(await storage.canRead(row.objectPath, userId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const obj = await storage.downloadObject(row.objectPath);
    sendPrivateFile(res, obj, () =>
      req.log.error({ event: "apr_file_stream_failed", reportId: row.id }, "Failed to stream APR file"),
    );
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage." });
      return;
    }
    req.log.error({ event: "apr_file_stream_failed", reportId: row.id }, "Failed to serve APR file");
    res.status(500).json({ error: "Failed to serve file." });
  }
});

export default router;
