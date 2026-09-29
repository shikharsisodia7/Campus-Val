/**
 * Degree Checksheets — department advising documents a student uploads, and
 * the student's own tracking on top of them.
 *
 * DESIGN PRINCIPLE. The uploaded document is a reference and stays exactly as
 * it was uploaded. What the student records (status, quarter, notes) is stored
 * in a separate table and drawn over or beside the document. No handler here
 * writes to the stored file or to its display copy because of tracking.
 *
 * SCOPE. Nothing here reads or changes a plan, a schedule, the requirements
 * sidebar or an Academic Progress Report, and nothing decides which document
 * applies to a student. A checksheet is what the student says it is.
 *
 * PRIVACY. Every handler derives the owner from the authenticated session
 * (`req.userId`) and every query is scoped `WHERE user_id = <that id>`, so an
 * id belonging to someone else is indistinguishable from one that does not
 * exist (404). Responses never contain the storage path or the owner id, and
 * nothing here logs file content, titles, notes, file names or paths.
 */
import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  degreeChecksheetAnnotationsTable,
  degreeChecksheetDocumentsTable,
  type DegreeChecksheetAnnotationRow,
  type DegreeChecksheetDocumentRow,
} from "@workspace/db";
import {
  CreateDegreeChecksheetAnnotationBody,
  CreateDegreeChecksheetBody,
  ReplaceDegreeChecksheetFileBody,
  RequestDegreeChecksheetUploadUrlBody,
  UpdateDegreeChecksheetAnnotationBody,
  UpdateDegreeChecksheetBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getPrivateObjectStorage,
  isPrivateStorageConfigured,
  ObjectNotFoundError,
  type PrivateObjectStorage,
} from "../lib/storage";
import { describeAnchor, movedPage, reconcileAnchor, resolveAnchor, type ResolvedAnchor } from "../lib/checksheets/anchors";
import { sendChecksheetFile } from "../lib/checksheets/file-response";
import {
  CHECKSHEET_ACCEPTED_EXTENSIONS,
  canonicalContentType,
  resolveChecksheetFormat,
} from "../lib/checksheets/formats";
import { CHECKSHEET_LIMITS, checksheetMaxUploadBytes, checksheetMaxUploadLabel } from "../lib/checksheets/limits";
import {
  asCategory,
  asProgramRole,
  asStatus,
  asTerm,
  asTermYear,
  cleanLine,
  cleanNote,
  cleanSourceUrl,
} from "../lib/checksheets/metadata";
import {
  CHECKSHEET_CATEGORY_RANK,
  CHECKSHEET_ERROR_MESSAGE,
  ChecksheetError,
  type ChecksheetCategory,
  type ChecksheetErrorCode,
  type ChecksheetFormat,
  type ChecksheetRender,
  type TrackingField,
} from "../lib/checksheets/model";
import { buildChecksheetRender } from "../lib/checksheets/render";
import { clampPdfPageScale, renderChecksheetPdfPage } from "../lib/checksheets/pdf-render";

const router: IRouter = Router();

const FORMATS: readonly ChecksheetFormat[] = ["pdf", "xlsx", "xls", "docx", "png", "jpg"];
const NOT_FOUND = { error: "No such Degree Checksheet." };
const NO_ENTRY = { error: "No such tracking entry." };

/** Everything except the display copy — for lists and metadata. */
const META_COLUMNS = {
  id: degreeChecksheetDocumentsTable.id,
  userId: degreeChecksheetDocumentsTable.userId,
  title: degreeChecksheetDocumentsTable.title,
  category: degreeChecksheetDocumentsTable.category,
  programName: degreeChecksheetDocumentsTable.programName,
  programRole: degreeChecksheetDocumentsTable.programRole,
  school: degreeChecksheetDocumentsTable.school,
  academicYearLabel: degreeChecksheetDocumentsTable.academicYearLabel,
  sourceUrl: degreeChecksheetDocumentsTable.sourceUrl,
  sortOrder: degreeChecksheetDocumentsTable.sortOrder,
  originalFilename: degreeChecksheetDocumentsTable.originalFilename,
  fileSize: degreeChecksheetDocumentsTable.fileSize,
  mimeType: degreeChecksheetDocumentsTable.mimeType,
  sourceFormat: degreeChecksheetDocumentsTable.sourceFormat,
  fileHash: degreeChecksheetDocumentsTable.fileHash,
  objectPath: degreeChecksheetDocumentsTable.objectPath,
  sourceVersion: degreeChecksheetDocumentsTable.sourceVersion,
  renderStatus: degreeChecksheetDocumentsTable.renderStatus,
  renderNote: degreeChecksheetDocumentsTable.renderNote,
  trackingCellCount: degreeChecksheetDocumentsTable.trackingCellCount,
  uploadedAt: degreeChecksheetDocumentsTable.uploadedAt,
  createdAt: degreeChecksheetDocumentsTable.createdAt,
  updatedAt: degreeChecksheetDocumentsTable.updatedAt,
  previewKind: sql<string | null>`${degreeChecksheetDocumentsTable.render} ->> 'kind'`,
};

type MetaRow = Omit<DegreeChecksheetDocumentRow, "render"> & { previewKind: string | null };

const isFormat = (value: string): value is ChecksheetFormat => (FORMATS as readonly string[]).includes(value);
const isErrorCode = (code: string | null): code is ChecksheetErrorCode => !!code && code in CHECKSHEET_ERROR_MESSAGE;

/**
 * The client DTO. Deliberately has no `userId` (always the caller), no
 * `objectPath` (an internal storage location) and no full file hash.
 */
function documentDto(row: MetaRow) {
  const status = row.renderStatus === "ready" || row.renderStatus === "original_only" ? row.renderStatus : "failed";
  const noteCode = status === "ready" ? null : (row.renderNote ?? "preview_unavailable");
  const kind = row.previewKind;
  return {
    id: row.id,
    title: row.title,
    category: asCategory(row.category) ?? "other",
    programName: row.programName,
    programRole: asProgramRole(row.programRole),
    school: row.school,
    academicYearLabel: row.academicYearLabel,
    sourceUrl: row.sourceUrl,
    sortOrder: row.sortOrder,
    fileName: row.originalFilename,
    fileSize: row.fileSize,
    mimeType: row.mimeType,
    sourceFormat: isFormat(row.sourceFormat) ? row.sourceFormat : "pdf",
    sourceVersion: row.sourceVersion,
    uploadedAt: row.uploadedAt.toISOString(),
    renderStatus: status,
    renderNoteCode: noteCode,
    renderNoteMessage: noteCode
      ? CHECKSHEET_ERROR_MESSAGE[isErrorCode(noteCode) ? noteCode : "preview_unavailable"]
      : null,
    previewKind:
      status === "ready" && (kind === "spreadsheet" || kind === "pdf" || kind === "image" || kind === "document")
        ? kind
        : null,
    inlineTracking: status === "ready" && row.trackingCellCount > 0,
    fileFingerprint: row.fileHash.slice(0, 12),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function annotationDto(row: DegreeChecksheetAnnotationRow, field: TrackingField | null) {
  const type =
    row.anchorType === "sheet_cell" ||
    row.anchorType === "doc_cell" ||
    row.anchorType === "sheet_item" ||
    row.anchorType === "doc_item" ||
    row.anchorType === "point"
      ? row.anchorType
      : "manual";
  return {
    id: row.id,
    documentId: row.documentId,
    anchorType: type,
    anchor: (row.anchor ?? {}) as Record<string, number>,
    field,
    detached: row.detachedAt !== null,
    itemLabel: row.itemLabel,
    status: asStatus(row.status),
    term: asTerm(row.term),
    termYear: row.termYear,
    note: row.note,
    sortOrder: row.sortOrder,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Which value a cell entry holds, read from the document's own layout. */
function fieldOf(render: ChecksheetRender | null, row: DegreeChecksheetAnnotationRow): TrackingField | null {
  if (row.anchorType !== "sheet_cell" && row.anchorType !== "doc_cell") return null;
  const placed = row.detachedAt === null ? resolveAnchor(render, row.anchorType, row.anchor) : null;
  if (placed?.field) return placed.field;
  // A detached cell entry keeps whichever values it was given.
  if (row.term && row.status) return "both";
  return row.term ? "term" : row.status ? "status" : null;
}

function sortDocuments<T extends { category: string; sortOrder: number; id: number }>(rows: T[]): T[] {
  const rank = (c: string) => CHECKSHEET_CATEGORY_RANK[(asCategory(c) ?? "other") as ChecksheetCategory];
  return [...rows].sort((a, b) => rank(a.category) - rank(b.category) || a.sortOrder - b.sortOrder || a.id - b.id);
}

function parseParam(req: Request, name: string): number | null {
  const id = Number(req.params[name]);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

async function listOwned(userId: string): Promise<MetaRow[]> {
  const rows = await db
    .select(META_COLUMNS)
    .from(degreeChecksheetDocumentsTable)
    .where(eq(degreeChecksheetDocumentsTable.userId, userId))
    .orderBy(asc(degreeChecksheetDocumentsTable.sortOrder), asc(degreeChecksheetDocumentsTable.id));
  return sortDocuments(rows);
}

/** One document, only if the caller owns it. */
async function findOwned(userId: string, id: number): Promise<MetaRow | null> {
  const rows = await db
    .select(META_COLUMNS)
    .from(degreeChecksheetDocumentsTable)
    .where(and(eq(degreeChecksheetDocumentsTable.id, id), eq(degreeChecksheetDocumentsTable.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

async function renderOf(userId: string, id: number): Promise<ChecksheetRender | null> {
  const rows = await db
    .select({ render: degreeChecksheetDocumentsTable.render })
    .from(degreeChecksheetDocumentsTable)
    .where(and(eq(degreeChecksheetDocumentsTable.id, id), eq(degreeChecksheetDocumentsTable.userId, userId)))
    .limit(1);
  return (rows[0]?.render as ChecksheetRender | null | undefined) ?? null;
}

async function annotationsOf(userId: string, documentId: number): Promise<DegreeChecksheetAnnotationRow[]> {
  return db
    .select()
    .from(degreeChecksheetAnnotationsTable)
    .where(
      and(
        eq(degreeChecksheetAnnotationsTable.documentId, documentId),
        eq(degreeChecksheetAnnotationsTable.userId, userId),
      ),
    )
    .orderBy(asc(degreeChecksheetAnnotationsTable.sortOrder), asc(degreeChecksheetAnnotationsTable.id));
}

async function findAnnotation(
  userId: string,
  documentId: number,
  id: number,
): Promise<DegreeChecksheetAnnotationRow | null> {
  const rows = await db
    .select()
    .from(degreeChecksheetAnnotationsTable)
    .where(
      and(
        eq(degreeChecksheetAnnotationsTable.id, id),
        eq(degreeChecksheetAnnotationsTable.documentId, documentId),
        eq(degreeChecksheetAnnotationsTable.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function countTrackingCells(render: ChecksheetRender | null): number {
  if (render?.kind === "spreadsheet") return render.sheets.reduce((n, sheet) => n + sheet.tracking.cells.length, 0);
  if (render?.kind === "document") {
    return render.blocks.reduce((n, block) => n + (block.type === "table" ? block.tracking.cells.length : 0), 0);
  }
  return 0;
}

/** The copy sent to a browser: fingerprints are for the server's own checks. */
function renderForClient(render: ChecksheetRender): unknown {
  const withoutFingerprints = <T extends { cells: { r: number; c: number; field: string }[] }>(tracking: T) => ({
    ...tracking,
    cells: tracking.cells.map(({ r, c, field }) => ({ r, c, field })),
  });
  if (render.kind === "spreadsheet") {
    return {
      ...render,
      sheets: render.sheets.map((sheet) => ({ ...sheet, tracking: withoutFingerprints(sheet.tracking) })),
    };
  }
  if (render.kind === "document") {
    return {
      ...render,
      blocks: render.blocks.map((block) =>
        block.type === "table" ? { ...block, tracking: withoutFingerprints(block.tracking) } : block,
      ),
    };
  }
  if (render.kind === "pdf") {
    return { ...render, pages: render.pages.map(({ width, height }) => ({ width, height })) };
  }
  if (render.kind === "image") {
    const { version, kind, width, height } = render;
    return { version, kind, width, height };
  }
  return render;
}

function noStore(res: Response) {
  // A student's planning document must not linger in a shared machine's cache.
  res.setHeader("Cache-Control", "private, no-store");
}

function fail(res: Response, status: number, code: ChecksheetErrorCode) {
  res.status(status).json({ error: CHECKSHEET_ERROR_MESSAGE[code], code });
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
      format: ChecksheetFormat;
      fileName: string;
      size: number;
      hash: string;
      status: "ready" | "original_only";
      note: ChecksheetErrorCode | null;
      render: ChecksheetRender | null;
    }
  | { ok: false; status: number; error: string; code?: string };

async function readAll(stream: NodeJS.ReadableStream, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
    total += buf.length;
    if (total > limit) throw new ChecksheetError("too_large");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function discard(storage: PrivateObjectStorage, objectPath: string, log: Request["log"], reason: string) {
  try {
    await storage.deleteObject(objectPath);
  } catch {
    // Category only: the path and file name are private.
    log.warn({ event: "checksheet_object_cleanup_failed", reason }, "Could not remove a checksheet object");
  }
}

/**
 * Validates, downloads and processes an uploaded file WITHOUT touching the
 * database. The caller commits only on success, so a bad upload can never
 * displace a good document.
 */
async function intake(req: Request, userId: string, input: FileInput): Promise<Intake> {
  const maxBytes = checksheetMaxUploadBytes();
  const fileName = cleanLine(input.fileName, 255);
  const objectPath = input.objectPath.trim();
  const tooLarge = `File size exceeds the ${checksheetMaxUploadLabel()} limit.`;

  if (!objectPath.startsWith("/objects/")) {
    return { ok: false, status: 400, error: "objectPath must be a string starting with /objects/." };
  }
  if (!fileName) return { ok: false, status: 400, error: "fileName is required." };
  if (input.fileSize > maxBytes) return { ok: false, status: 400, error: tooLarge };

  const format = resolveChecksheetFormat(fileName, input.contentType);
  if (!format) {
    return { ok: false, status: 400, code: "unsupported_type", error: CHECKSHEET_ERROR_MESSAGE.unsupported_type };
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
    req.log.error({ event: "checksheet_processing_failed", category: "storage_failure" }, "Could not read object metadata");
    return { ok: false, status: 500, error: "Could not verify the uploaded file." };
  }
  if (!actualSize) {
    await discard(storage, objectPath, req.log, "empty");
    return { ok: false, status: 422, code: "empty_file", error: CHECKSHEET_ERROR_MESSAGE.empty_file };
  }
  if (actualSize > maxBytes) {
    await discard(storage, objectPath, req.log, "oversize");
    return { ok: false, status: 400, error: tooLarge };
  }

  try {
    await storage.finalizeUpload(objectPath, userId);
  } catch {
    req.log.error({ event: "checksheet_processing_failed", category: "storage_failure" }, "Could not finalize object");
    return { ok: false, status: 500, error: "Could not secure the uploaded file. Try again." };
  }

  let bytes: Buffer;
  try {
    const { stream } = await storage.downloadObject(objectPath);
    bytes = await readAll(stream, maxBytes);
  } catch (err) {
    await discard(storage, objectPath, req.log, "download_failed");
    if (err instanceof ChecksheetError) return { ok: false, status: 400, error: tooLarge };
    req.log.error({ event: "checksheet_processing_failed", category: "storage_failure" }, "Could not download object");
    return { ok: false, status: 400, error: "Could not access the uploaded file. Try uploading it again." };
  }

  try {
    const outcome = await buildChecksheetRender(bytes, format);
    req.log.info({ event: "checksheet_document_validated", format, preview: outcome.status }, "Checksheet file validated");
    return {
      ok: true,
      format,
      fileName,
      size: actualSize,
      hash: createHash("sha256").update(bytes).digest("hex"),
      ...outcome,
    };
  } catch (err) {
    const code: ChecksheetErrorCode = err instanceof ChecksheetError ? err.code : "processing_failed";
    req.log.warn({ event: "checksheet_processing_failed", category: code, format }, "Checksheet file rejected");
    await discard(storage, objectPath, req.log, "rejected");
    return { ok: false, status: 422, code, error: CHECKSHEET_ERROR_MESSAGE[code] };
  }
}

// ─── descriptive metadata ────────────────────────────────────────────────────

interface MetadataInput {
  title?: string;
  category?: string;
  programName?: string | null;
  programRole?: string | null;
  school?: string | null;
  academicYearLabel?: string | null;
  sourceUrl?: string | null;
  sortOrder?: number;
}

type MetadataChanges = Partial<
  Pick<
    typeof degreeChecksheetDocumentsTable.$inferInsert,
    "title" | "category" | "programName" | "programRole" | "school" | "academicYearLabel" | "sourceUrl" | "sortOrder"
  >
>;

/** Only the fields that were sent are changed; `null` clears an optional one. */
function readMetadata(input: MetadataInput): { ok: true; changes: MetadataChanges } | { ok: false; error: string } {
  const changes: MetadataChanges = {};
  const max = CHECKSHEET_LIMITS.metadataMaxLength;

  if (input.title !== undefined) {
    const title = cleanLine(input.title, CHECKSHEET_LIMITS.titleMaxLength);
    if (!title) return { ok: false, error: "Give this document a title, for example “Finance Major Checksheet”." };
    changes.title = title;
  }
  if (input.category !== undefined) {
    const category = asCategory(input.category);
    if (!category) return { ok: false, error: "Unknown document type." };
    changes.category = category;
  }
  if (input.programRole !== undefined) {
    if (input.programRole !== null && !asProgramRole(input.programRole)) {
      return { ok: false, error: "Unknown program association." };
    }
    changes.programRole = asProgramRole(input.programRole);
  }
  if (input.programName !== undefined) changes.programName = cleanLine(input.programName, max);
  if (input.school !== undefined) changes.school = cleanLine(input.school, max);
  if (input.academicYearLabel !== undefined) changes.academicYearLabel = cleanLine(input.academicYearLabel, max);
  if (input.sourceUrl !== undefined) {
    const url = cleanSourceUrl(input.sourceUrl);
    if (!url.ok) return { ok: false, error: "The source link must be a web address starting with http:// or https://." };
    changes.sourceUrl = url.url;
  }
  if (input.sortOrder !== undefined) changes.sortOrder = input.sortOrder;
  return { ok: true, changes };
}

// ─── tracking values ─────────────────────────────────────────────────────────

interface TrackingInput {
  itemLabel?: string | null;
  status?: string | null;
  term?: string | null;
  termYear?: number | null;
  note?: string | null;
}

interface TrackingValues {
  itemLabel: string | null;
  status: string | null;
  term: string | null;
  termYear: number | null;
  note: string | null;
}

/**
 * Applies what was sent on top of what is stored, then checks the result as a
 * whole. A quarter is a term AND a year: one without the other is refused
 * rather than guessed.
 */
function readTracking(
  input: TrackingInput,
  base: TrackingValues,
  anchor: Pick<ResolvedAnchor, "type" | "field">,
): { ok: true; values: TrackingValues } | { ok: false; error: string } {
  // Named one by one: `base` may be a whole stored row.
  const values: TrackingValues = {
    itemLabel: base.itemLabel,
    status: base.status,
    term: base.term,
    termYear: base.termYear,
    note: base.note,
  };

  if (input.status !== undefined) {
    if (input.status !== null && !asStatus(input.status)) return { ok: false, error: "Unknown status." };
    values.status = asStatus(input.status);
  }
  if (input.term !== undefined) {
    if (input.term !== null && !asTerm(input.term)) return { ok: false, error: "Unknown quarter." };
    values.term = asTerm(input.term);
  }
  if (input.termYear !== undefined) {
    if (input.termYear !== null && asTermYear(input.termYear) === null) return { ok: false, error: "Unknown year." };
    values.termYear = asTermYear(input.termYear);
  }
  if (input.note !== undefined) values.note = cleanNote(input.note, CHECKSHEET_LIMITS.noteMaxLength);
  if (input.itemLabel !== undefined) values.itemLabel = cleanLine(input.itemLabel, CHECKSHEET_LIMITS.itemLabelMaxLength);

  if ((values.term === null) !== (values.termYear === null)) {
    return { ok: false, error: "Choose both a quarter and a year, or clear both." };
  }
  // A cell holds the one value its column is for.
  if (anchor.field === "status" && values.term !== null) {
    return { ok: false, error: "This column holds a status, not a quarter." };
  }
  if (anchor.field === "term" && values.status !== null) {
    return { ok: false, error: "This column holds a quarter, not a status." };
  }
  if (anchor.type === "manual" && !values.itemLabel) {
    return { ok: false, error: "Name the requirement or item this entry is for." };
  }
  return { ok: true, values };
}

const EMPTY_TRACKING: TrackingValues = { itemLabel: null, status: null, term: null, termYear: null, note: null };

// ─── documents ───────────────────────────────────────────────────────────────

function limitsBody() {
  return {
    maxUploadBytes: checksheetMaxUploadBytes(),
    maxDocuments: CHECKSHEET_LIMITS.maxDocumentsPerUser,
    acceptedExtensions: CHECKSHEET_ACCEPTED_EXTENSIONS,
  };
}

router.get("/degree-checksheets", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.json({ available: false, documents: [], ...limitsBody() });
    return;
  }
  const userId = req.userId!;
  const rows = await listOwned(userId);
  res.json({ available: true, documents: rows.map(documentDto), ...limitsBody() });
});

router.post("/degree-checksheets/upload-url", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const parsed = RequestDegreeChecksheetUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A file name, size and type are required." });
    return;
  }
  const format = resolveChecksheetFormat(parsed.data.name, parsed.data.contentType);
  if (!format) {
    fail(res, 400, "unsupported_type");
    return;
  }
  if (parsed.data.size > checksheetMaxUploadBytes()) {
    res.status(400).json({ error: `File size exceeds the ${checksheetMaxUploadLabel()} limit.`, code: "too_large" });
    return;
  }
  try {
    // The link is bound to the caller, to one content type and to the size
    // limit, so it cannot be reused for another student or another kind of file.
    const contentType = canonicalContentType(format);
    const storage = await getPrivateObjectStorage();
    const target = await storage.createUploadTarget(userId, { contentType, maxSizeBytes: checksheetMaxUploadBytes() });
    res.json({ uploadURL: target.uploadURL, objectPath: target.objectPath, contentType });
  } catch {
    req.log.error({ event: "checksheet_upload_link_failed" }, "Could not create an upload link");
    res.status(500).json({ error: "Could not prepare the upload. Try again." });
  }
});

router.post("/degree-checksheets", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const parsed = CreateDegreeChecksheetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A title, file name, size, type and object path are required." });
    return;
  }
  const metadata = readMetadata(parsed.data);
  if (!metadata.ok) {
    res.status(400).json({ error: metadata.error });
    return;
  }

  const existing = await listOwned(userId);
  if (existing.length >= CHECKSHEET_LIMITS.maxDocumentsPerUser) {
    res.status(409).json({
      error: `You can keep up to ${CHECKSHEET_LIMITS.maxDocumentsPerUser} documents. Remove one before adding another.`,
    });
    return;
  }

  req.log.info({ event: "checksheet_upload_started", kind: "create" }, "Checksheet upload started");
  const result = await intake(req, userId, parsed.data);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error, ...(result.code ? { code: result.code } : {}) });
    return;
  }

  const nextOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const inserted = await db
    .insert(degreeChecksheetDocumentsTable)
    .values({
      userId,
      title: metadata.changes.title!,
      category: metadata.changes.category ?? "other",
      programName: metadata.changes.programName ?? null,
      programRole: metadata.changes.programRole ?? null,
      school: metadata.changes.school ?? null,
      academicYearLabel: metadata.changes.academicYearLabel ?? null,
      sourceUrl: metadata.changes.sourceUrl ?? null,
      sortOrder: nextOrder,
      originalFilename: result.fileName,
      fileSize: result.size,
      mimeType: canonicalContentType(result.format),
      sourceFormat: result.format,
      fileHash: result.hash,
      objectPath: parsed.data.objectPath.trim(),
      renderStatus: result.status,
      renderNote: result.note,
      render: result.render,
      trackingCellCount: countTrackingCells(result.render),
    })
    .returning({ id: degreeChecksheetDocumentsTable.id });

  const row = await findOwned(userId, inserted[0]!.id);
  req.log.info(
    { event: "checksheet_preview_processed", documentId: row!.id, format: result.format, preview: result.status },
    "Checksheet document created",
  );
  res.status(201).json(documentDto(row!));
});

router.get("/degree-checksheets/:id", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  res.json(documentDto(row));
});

router.patch("/degree-checksheets/:id", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const parsed = UpdateDegreeChecksheetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid title or details." });
    return;
  }
  const metadata = readMetadata(parsed.data);
  if (!metadata.ok) {
    res.status(400).json({ error: metadata.error });
    return;
  }
  if (Object.keys(metadata.changes).length > 0) {
    await db
      .update(degreeChecksheetDocumentsTable)
      .set(metadata.changes)
      .where(and(eq(degreeChecksheetDocumentsTable.id, row.id), eq(degreeChecksheetDocumentsTable.userId, userId)));
  }
  res.json(documentDto((await findOwned(userId, row.id))!));
});

router.put("/degree-checksheets/:id/file", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const parsed = ReplaceDegreeChecksheetFileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A file name, size, type and object path are required." });
    return;
  }

  req.log.info({ event: "checksheet_upload_started", kind: "replace", documentId: row.id }, "Checksheet replacement started");
  // Validate and process the NEW file first. Until this succeeds the document
  // is not modified, so a failed replacement leaves the last good file in place.
  const result = await intake(req, userId, parsed.data);
  if (!result.ok) {
    req.log.warn(
      { event: "checksheet_replacement_failed", documentId: row.id, category: result.code ?? "validation" },
      "Checksheet replacement rejected",
    );
    res.status(result.status).json({ error: result.error, ...(result.code ? { code: result.code } : {}) });
    return;
  }

  const newPath = parsed.data.objectPath.trim();
  const previousPath = row.objectPath;
  const previousRender = await renderOf(userId, row.id);
  const sameFile = result.hash === row.fileHash;
  const nextVersion = row.sourceVersion + 1;
  // `moved` counts the kept markers that followed their page to a new page number.
  const tally = { kept: 0, detached: 0, moved: 0 };

  // The file, its display copy and every entry's position change together, so
  // an entry can never be left pointing into a file it was not made against.
  await db.transaction(async (tx) => {
    await tx
      .update(degreeChecksheetDocumentsTable)
      .set({
        originalFilename: result.fileName,
        fileSize: result.size,
        mimeType: canonicalContentType(result.format),
        sourceFormat: result.format,
        fileHash: result.hash,
        objectPath: newPath,
        sourceVersion: nextVersion,
        renderStatus: result.status,
        renderNote: result.note,
        render: result.render,
        trackingCellCount: countTrackingCells(result.render),
        uploadedAt: new Date(),
      })
      .where(and(eq(degreeChecksheetDocumentsTable.id, row.id), eq(degreeChecksheetDocumentsTable.userId, userId)));

    const placed = await tx
      .select()
      .from(degreeChecksheetAnnotationsTable)
      .where(
        and(
          eq(degreeChecksheetAnnotationsTable.documentId, row.id),
          eq(degreeChecksheetAnnotationsTable.userId, userId),
          isNull(degreeChecksheetAnnotationsTable.detachedAt),
        ),
      );

    for (const entry of placed) {
      const still = reconcileAnchor(entry, result.render, sameFile);
      const own = and(
        eq(degreeChecksheetAnnotationsTable.id, entry.id),
        eq(degreeChecksheetAnnotationsTable.userId, userId),
      );
      if (still) {
        tally.kept += 1;
        if (movedPage(entry, still)) tally.moved += 1;
        await tx
          .update(degreeChecksheetAnnotationsTable)
          .set({
            sourceVersion: nextVersion,
            anchor: still.anchor,
            anchorFingerprint: still.fingerprint,
            anchorKey: still.key,
          })
          .where(own);
      } else {
        tally.detached += 1;
        await tx
          .update(degreeChecksheetAnnotationsTable)
          .set({
            detachedAt: new Date(),
            // The place is free again for an entry made against the new file.
            anchorKey: null,
            itemLabel: entry.itemLabel ?? describeAnchor(previousRender, entry),
          })
          .where(own);
      }
    }
  });

  if (previousPath !== newPath) {
    await discard(await getPrivateObjectStorage(), previousPath, req.log, "replaced");
  }
  req.log.info(
    { event: "checksheet_document_replaced", documentId: row.id, format: result.format, ...tally },
    "Checksheet replaced",
  );
  res.json({ document: documentDto((await findOwned(userId, row.id))!), tracking: tally });
});

router.delete("/degree-checksheets/:id", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  // Record first: it holds the display copy, and its tracking entries go with
  // it (ON DELETE CASCADE). Then the file. If the file cannot be removed the
  // student's view is still correct; the failure is logged by document id so
  // an operator can clear the orphaned object.
  await db
    .delete(degreeChecksheetDocumentsTable)
    .where(and(eq(degreeChecksheetDocumentsTable.id, row.id), eq(degreeChecksheetDocumentsTable.userId, userId)));

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
    req.log.error({ event: "checksheet_orphaned_object", documentId: row.id }, "Record deleted but its file could not be removed");
  }
  req.log.info({ event: "checksheet_document_deleted", documentId: row.id }, "Checksheet deleted");

  // A small JSON body rather than 204 (see routes/progress-reports.ts).
  res.status(200).json({ deleted: true });
});

router.get("/degree-checksheets/:id/render", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const render = row.renderStatus === "ready" ? await renderOf(userId, row.id) : null;
  res.json({ document: documentDto(row), render: render ? renderForClient(render) : null });
});

router.get("/degree-checksheets/:id/file", requireAuth, async (req, res): Promise<void> => {
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row || !isFormat(row.sourceFormat)) {
    res.status(404).json(NOT_FOUND);
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
    sendChecksheetFile(res, obj, row.sourceFormat, () =>
      req.log.error({ event: "checksheet_file_stream_failed", documentId: row.id }, "Failed to stream checksheet file"),
    );
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage." });
      return;
    }
    req.log.error({ event: "checksheet_file_stream_failed", documentId: row.id }, "Failed to serve checksheet file");
    res.status(500).json({ error: "Failed to serve file." });
  }
});

/**
 * One PDF page, drawn to a PNG — for a client with no PDF renderer of its own
 * (the mobile app; the web app draws pages itself, in the browser). Owner-only,
 * like every other route here: ownership is checked before the file is even
 * downloaded, and the response is never cached by a shared cache.
 */
router.get("/degree-checksheets/:id/pages/:page/image", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row || row.sourceFormat !== "pdf") {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const pageParam = Number(req.params["page"]);
  const render = row.renderStatus === "ready" ? await renderOf(userId, row.id) : null;
  const pageCount = render?.kind === "pdf" ? render.pages.length : 0;
  if (!Number.isInteger(pageParam) || pageParam < 1 || pageParam > pageCount) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  try {
    const storage = await getPrivateObjectStorage();
    if (!(await storage.canRead(row.objectPath, userId))) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    const { stream } = await storage.downloadObject(row.objectPath);
    const bytes = await readAll(stream, checksheetMaxUploadBytes());
    const png = await renderChecksheetPdfPage(bytes, pageParam - 1, clampPdfPageScale(req.query["scale"]));
    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // A generated PNG buffer, not text: res.end (not res.send) writes it as
    // raw bytes, matching the pattern already used for the plan-export route.
    res.end(png);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage." });
      return;
    }
    if (err instanceof ChecksheetError) {
      res.status(422).json({ error: "This page could not be drawn." });
      return;
    }
    req.log.error({ event: "checksheet_processing_failed", documentId: row.id, category: "processing_failed" }, "Failed to render a PDF page");
    res.status(500).json({ error: "Failed to draw this page." });
  }
});

// ─── tracking entries ────────────────────────────────────────────────────────

router.get("/degree-checksheets/:id/annotations", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const render = await renderOf(userId, row.id);
  const entries = await annotationsOf(userId, row.id);
  res.json({
    maxAnnotations: CHECKSHEET_LIMITS.maxAnnotationsPerDocument,
    annotations: entries.map((entry) => annotationDto(entry, fieldOf(render, entry))),
  });
});

router.post("/degree-checksheets/:id/annotations", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const row = id ? await findOwned(userId, id) : null;
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const parsed = CreateDegreeChecksheetAnnotationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tracking entry." });
    return;
  }
  const render = await renderOf(userId, row.id);
  const anchor = resolveAnchor(render, parsed.data.anchorType, parsed.data.anchor ?? {});
  if (!anchor) {
    res.status(400).json({ error: "This document has no such place to track." });
    return;
  }

  const entries = await annotationsOf(userId, row.id);
  const existing = anchor.key ? entries.find((entry) => entry.anchorKey === anchor.key) : undefined;
  const tracking = readTracking(parsed.data, existing ?? EMPTY_TRACKING, anchor);
  if (!tracking.ok) {
    res.status(400).json({ error: tracking.error });
    return;
  }
  // An item the student chose is named after the cell it sits in, so it can be
  // read in a list and recognised if a replacement detaches it.
  if ((anchor.type === "sheet_item" || anchor.type === "doc_item") && !tracking.values.itemLabel) {
    tracking.values.itemLabel = describeAnchor(render, { anchorType: anchor.type, anchor: anchor.anchor, anchorFingerprint: null });
  }

  if (existing) {
    const updated = await db
      .update(degreeChecksheetAnnotationsTable)
      .set({ ...tracking.values, revision: sql`${degreeChecksheetAnnotationsTable.revision} + 1` })
      .where(
        and(eq(degreeChecksheetAnnotationsTable.id, existing.id), eq(degreeChecksheetAnnotationsTable.userId, userId)),
      )
      .returning();
    req.log.info({ event: "checksheet_annotation_saved", documentId: row.id, kind: anchor.type }, "Tracking saved");
    res.status(200).json(annotationDto(updated[0]!, anchor.field));
    return;
  }

  if (entries.length >= CHECKSHEET_LIMITS.maxAnnotationsPerDocument) {
    res.status(409).json({
      error: `A document can hold up to ${CHECKSHEET_LIMITS.maxAnnotationsPerDocument} tracking entries.`,
    });
    return;
  }

  const nextOrder = entries.reduce((max, entry) => Math.max(max, entry.sortOrder), -1) + 1;
  const inserted = await db
    .insert(degreeChecksheetAnnotationsTable)
    .values({
      documentId: row.id,
      userId,
      anchorType: anchor.type,
      anchor: anchor.anchor,
      anchorKey: anchor.key,
      anchorFingerprint: anchor.fingerprint,
      sourceVersion: row.sourceVersion,
      sortOrder: nextOrder,
      ...tracking.values,
    })
    // Two saves for one cell arriving together: the second becomes an update.
    .onConflictDoUpdate({
      target: [degreeChecksheetAnnotationsTable.documentId, degreeChecksheetAnnotationsTable.anchorKey],
      set: { ...tracking.values, revision: sql`${degreeChecksheetAnnotationsTable.revision} + 1` },
      setWhere: eq(degreeChecksheetAnnotationsTable.userId, userId),
    })
    .returning();
  if (!inserted[0]) {
    res.status(400).json({ error: "This document has no such place to track." });
    return;
  }
  req.log.info({ event: "checksheet_annotation_saved", documentId: row.id, kind: anchor.type }, "Tracking saved");
  res.status(201).json(annotationDto(inserted[0], anchor.field));
});

router.patch("/degree-checksheets/:id/annotations/:annotationId", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const annotationId = parseParam(req, "annotationId");
  const row = id ? await findOwned(userId, id) : null;
  const entry = row && annotationId ? await findAnnotation(userId, row.id, annotationId) : null;
  if (!row || !entry) {
    res.status(404).json(row ? NO_ENTRY : NOT_FOUND);
    return;
  }
  const parsed = UpdateDegreeChecksheetAnnotationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tracking entry." });
    return;
  }
  const render = await renderOf(userId, row.id);

  // Where the entry will sit after this change.
  let placement: Partial<typeof degreeChecksheetAnnotationsTable.$inferInsert> = {};
  let anchor: Pick<ResolvedAnchor, "type" | "field">;
  if (parsed.data.keepAsListEntry) {
    placement = {
      anchorType: "manual",
      anchor: {},
      anchorKey: null,
      anchorFingerprint: null,
      detachedAt: null,
      sourceVersion: row.sourceVersion,
    };
    anchor = { type: "manual", field: null };
  } else if (parsed.data.anchor !== undefined) {
    // Moving a marker, or putting a detached entry back on the current file.
    const next = resolveAnchor(render, entry.anchorType, parsed.data.anchor);
    if (!next || next.type === "manual") {
      res.status(400).json({ error: "This document has no such place to track." });
      return;
    }
    if (next.key) {
      const others = await annotationsOf(userId, row.id);
      if (others.some((other) => other.id !== entry.id && other.anchorKey === next.key)) {
        res.status(400).json({ error: "That place already has a tracking entry." });
        return;
      }
    }
    placement = {
      anchor: next.anchor,
      anchorKey: next.key,
      anchorFingerprint: next.fingerprint,
      detachedAt: null,
      sourceVersion: row.sourceVersion,
    };
    anchor = next;
  } else {
    anchor = {
      type: entry.anchorType === "manual" ? "manual" : (entry.anchorType as ResolvedAnchor["type"]),
      field: entry.detachedAt === null ? fieldOf(render, entry) : null,
    };
  }

  const tracking = readTracking(parsed.data, entry, anchor);
  if (!tracking.ok) {
    res.status(400).json({ error: tracking.error });
    return;
  }

  const expected = parsed.data.expectedRevision;
  const updated = await db
    .update(degreeChecksheetAnnotationsTable)
    .set({ ...placement, ...tracking.values, revision: sql`${degreeChecksheetAnnotationsTable.revision} + 1` })
    .where(
      and(
        eq(degreeChecksheetAnnotationsTable.id, entry.id),
        eq(degreeChecksheetAnnotationsTable.documentId, row.id),
        eq(degreeChecksheetAnnotationsTable.userId, userId),
        // The check and the write are one statement: a save based on an older
        // copy matches no row and changes nothing.
        ...(expected !== undefined ? [eq(degreeChecksheetAnnotationsTable.revision, expected)] : []),
      ),
    )
    .returning();

  if (!updated[0]) {
    const current = await findAnnotation(userId, row.id, entry.id);
    if (!current) {
      res.status(404).json(NO_ENTRY);
      return;
    }
    res.status(409).json({
      error: "This entry was changed somewhere else. The latest version is shown.",
      current: annotationDto(current, fieldOf(render, current)),
    });
    return;
  }
  req.log.info({ event: "checksheet_annotation_saved", documentId: row.id, kind: updated[0].anchorType }, "Tracking saved");
  res.json(annotationDto(updated[0], fieldOf(render, updated[0])));
});

router.delete("/degree-checksheets/:id/annotations/:annotationId", requireAuth, async (req, res): Promise<void> => {
  noStore(res);
  const userId = req.userId!;
  const id = parseParam(req, "id");
  const annotationId = parseParam(req, "annotationId");
  const row = id ? await findOwned(userId, id) : null;
  const entry = row && annotationId ? await findAnnotation(userId, row.id, annotationId) : null;
  if (!row || !entry) {
    res.status(404).json(row ? NO_ENTRY : NOT_FOUND);
    return;
  }
  await db
    .delete(degreeChecksheetAnnotationsTable)
    .where(
      and(
        eq(degreeChecksheetAnnotationsTable.id, entry.id),
        eq(degreeChecksheetAnnotationsTable.documentId, row.id),
        eq(degreeChecksheetAnnotationsTable.userId, userId),
      ),
    );
  req.log.info({ event: "checksheet_annotation_deleted", documentId: row.id }, "Tracking entry removed");
  res.status(200).json({ deleted: true });
});

export default router;
