import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, progressReportsTable, studentProfilesTable, type ProgressReportRow } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getPrivateObjectStorage, isPrivateStorageConfigured, ObjectNotFoundError } from "../lib/storage";
import { parseProgressReport, APR_PARSER_VERSION } from "../lib/progress-report-parser";
import { sendPrivateFile } from "../lib/private-file-response";
import { planningProjection } from "../lib/progress-report-view";

const router: IRouter = Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".xlsx"]);

function isStorageAvailable(): boolean {
  return isPrivateStorageConfigured();
}

type ReportView = "full" | "planning";

/**
 * The client DTO. Deliberately omits `userId` (always the caller) and
 * `objectPath` (an internal storage location): neither is needed by any
 * client and neither should ever appear in a response body or log.
 */
function reportDto(row: ProgressReportRow, view: ReportView = "full") {
  return {
    id: row.id,
    fileName: row.fileName,
    fileSize: row.fileSize,
    contentType: row.contentType,
    uploadedAt: row.uploadedAt.toISOString(),
    parsed: view === "planning" ? planningProjection(row.parsed) ?? null : row.parsed ?? null,
    parseStatus: row.parseStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function unavailableEnvelope() {
  return { available: false, report: null };
}

function reportEnvelope(
  row: ProgressReportRow | null | undefined,
  view: ReportView = "full",
  sourceFile?: "available" | "missing" | "unknown",
) {
  return {
    available: true,
    report: row ? { ...reportDto(row, view), ...(sourceFile ? { sourceFile } : {}) } : null,
  };
}

/** Can the stored original still be read? Never throws, never reads the bytes. */
async function probeSourceFile(row: ProgressReportRow): Promise<"available" | "missing" | "unknown"> {
  try {
    const storage = await getPrivateObjectStorage();
    await storage.getMetadata(row.objectPath);
    return "available";
  } catch (err) {
    return err instanceof ObjectNotFoundError ? "missing" : "unknown";
  }
}

async function getUserReport(userId: string): Promise<ProgressReportRow | null> {
  const rows = await db
    .select()
    .from(progressReportsTable)
    .where(eq(progressReportsTable.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * A stored report parsed by an older parser version (e.g. before the
 * hierarchical-groups structure existed) is transparently reparsed from the
 * still-stored original file on next read, so existing users aren't stuck
 * with stale flat output. Best-effort: on any failure, the stale row is
 * returned as-is rather than surfacing an error for what is just a read.
 */
async function reparseIfStale(
  row: ProgressReportRow,
  log?: { warn: (obj: object, msg: string) => void },
): Promise<ProgressReportRow> {
  if (row.parseStatus !== "parsed") return row;
  const parsedVersion = (row.parsed as { parserVersion?: string } | null)?.parserVersion;
  if (parsedVersion === APR_PARSER_VERSION) return row;

  try {
    const storage = await getPrivateObjectStorage();
    const { stream } = await storage.downloadObject(row.objectPath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const fileBuf = Buffer.concat(chunks);
    const { result, status } = await parseProgressReport(fileBuf, row.contentType, row.fileName);

    const rows = await db
      .update(progressReportsTable)
      .set({ parsed: result as any, parseStatus: status, updatedAt: new Date() })
      .where(eq(progressReportsTable.userId, row.userId))
      .returning();
    return rows[0] ?? row;
  } catch (err) {
    // Reason only — never file contents, parsed data, or the object path.
    log?.warn(
      { reason: err instanceof ObjectNotFoundError ? "source_missing" : "reparse_failed" },
      "Could not reparse stored progress report; serving previous parse",
    );
    return row;
  }
}

/**
 * GET /progress-report
 * Returns the user's progress report, or 404 if none.
 * Returns { available: false } if object storage is not configured.
 */
router.get("/progress-report", requireAuth, async (req, res): Promise<void> => {
  if (!isStorageAvailable()) {
    res.json(unavailableEnvelope());
    return;
  }

  const userId = req.userId!;
  const report = await getUserReport(userId);
  if (!report) {
    res.status(404).json({ error: "No progress report found." });
    return;
  }
  const view: ReportView = req.query["view"] === "planning" ? "planning" : "full";
  const current = await reparseIfStale(report, req.log);
  const sourceFile = req.query["checkSource"] === "true" ? await probeSourceFile(current) : undefined;
  res.json(reportEnvelope(current, view, sourceFile));
});

/**
 * PUT /progress-report
 * Register an uploaded progress report and parse it synchronously.
 * Body: { objectPath, fileName, fileSize, contentType }
 */
router.put("/progress-report", requireAuth, async (req, res): Promise<void> => {
  if (!isStorageAvailable()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }

  const userId = req.userId!;
  const body = req.body as {
    objectPath?: unknown;
    fileName?: unknown;
    fileSize?: unknown;
    contentType?: unknown;
  };

  // Validate inputs
  if (typeof body.objectPath !== "string" || !body.objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "objectPath must be a string starting with /objects/." });
    return;
  }
  if (typeof body.fileName !== "string" || body.fileName.trim().length === 0) {
    res.status(400).json({ error: "fileName is required." });
    return;
  }
  if (typeof body.fileSize !== "number" || !Number.isInteger(body.fileSize) || body.fileSize <= 0) {
    res.status(400).json({ error: "fileSize must be a positive integer." });
    return;
  }
  if (typeof body.contentType !== "string") {
    res.status(400).json({ error: "contentType is required." });
    return;
  }

  const fileName = (body.fileName as string).trim();
  const fileSize = body.fileSize as number;
  const contentType = (body.contentType as string).trim();
  const objectPath = (body.objectPath as string).trim();

  // Validate file size
  if (fileSize > MAX_FILE_SIZE) {
    res.status(400).json({ error: "File size exceeds the 10 MB limit." });
    return;
  }

  // Validate content type / extension
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  if (!ALLOWED_CONTENT_TYPES.has(contentType) && !ALLOWED_EXTENSIONS.has(ext)) {
    res.status(400).json({
      error: "Only PDF (application/pdf) and Excel (.xlsx) files are supported.",
    });
    return;
  }

  const storage = await getPrivateObjectStorage();

  // Enforce ownership BEFORE touching contents. The path itself is
  // owner-bound at mint time (see uploadPath.ts), so this also rejects any
  // attempt to register a path minted for a different user.
  if (!storage.isUploadPathOwnedBy(objectPath, userId)) {
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  // Validate authoritative storage-backend metadata rather than trusting the client.
  let actualSize = 0;
  try {
    const meta = await storage.getMetadata(objectPath);
    actualSize = meta.size;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Uploaded file not found. Upload the file first, then register it." });
      return;
    }
    req.log.error({ err: (err as Error).message }, "Failed to read metadata of progress report object");
    res.status(500).json({ error: "Could not verify the uploaded file." });
    return;
  }
  if (!actualSize || actualSize > MAX_FILE_SIZE) {
    res.status(400).json({ error: "File size exceeds the 10 MB limit (or the file is empty)." });
    return;
  }

  // Finalize (e.g. set ACL on providers that need one). Fail closed on errors.
  try {
    await storage.finalizeUpload(objectPath, userId);
  } catch (err) {
    req.log.error({ err: (err as Error).message }, "Failed to finalize progress report object");
    res.status(500).json({ error: "Could not secure the uploaded file. Try again." });
    return;
  }

  // If a previous report exists, best-effort delete its old object.
  const existing = await getUserReport(userId);
  if (existing && existing.objectPath !== objectPath) {
    try {
      await storage.deleteObject(existing.objectPath);
    } catch {
      // Best effort — ignore errors
    }
  }

  // Download the file buffer for parsing (size verified above).
  let fileBuf: Buffer;
  try {
    const { stream } = await storage.downloadObject(objectPath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    fileBuf = Buffer.concat(chunks);
    if (fileBuf.length > MAX_FILE_SIZE) {
      res.status(400).json({ error: "File size exceeds the 10 MB limit." });
      return;
    }
  } catch (err) {
    req.log.error({ err: (err as Error).message }, "Failed to download progress report for parsing");
    res.status(400).json({ error: "Could not access the uploaded file. Verify the object path is correct." });
    return;
  }

  // Parse the file — NEVER log file contents or parsed student data
  const { result: parsedResult, status: parseStatus } = await parseProgressReport(
    fileBuf,
    contentType,
    fileName,
  );

  // Identity/ownership validation (beyond storage ACL): if the document
  // confidently exposes a student ID AND this student's trusted profile has
  // one on record, a mismatch means the report belongs to someone else.
  // Reject WITHOUT saving, and never replace an existing valid report.
  // A report with no confidently extractable ID is NOT rejected — the parser
  // already records an honest "identity could not be verified" note.
  if (parsedResult.reportStudentId) {
    const profRows = await db
      .select({ studentId: studentProfilesTable.studentId })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, userId))
      .limit(1);
    const profileStudentId = profRows[0]?.studentId?.trim() || null;
    if (
      profileStudentId &&
      parsedResult.reportStudentId.toUpperCase() !== profileStudentId.toUpperCase()
    ) {
      // Do not echo the document's ID back — it may identify another student.
      res.status(422).json({
        error:
          "This report appears to belong to a different student. Please upload your own Academic Progress Report.",
      });
      return;
    }
  }

  // Upsert the report row (one per user)
  let row: ProgressReportRow;
  if (existing) {
    const rows = await db
      .update(progressReportsTable)
      .set({
        fileName,
        fileSize: actualSize,
        contentType,
        objectPath,
        uploadedAt: new Date(),
        parsed: parsedResult as any,
        parseStatus,
        updatedAt: new Date(),
      })
      .where(eq(progressReportsTable.userId, userId))
      .returning();
    row = rows[0]!;
  } else {
    const rows = await db
      .insert(progressReportsTable)
      .values({
        userId,
        fileName,
        fileSize: actualSize,
        contentType,
        objectPath,
        parsed: parsedResult as any,
        parseStatus,
      })
      .returning();
    row = rows[0]!;
  }

  res.json(reportEnvelope(row));
});

/**
 * DELETE /progress-report
 * Deletes the user's progress report row and best-effort deletes the GCS object.
 */
router.delete("/progress-report", requireAuth, async (req, res): Promise<void> => {
  if (!isStorageAvailable()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }

  const userId = req.userId!;
  const report = await getUserReport(userId);
  if (!report) {
    res.status(404).json({ error: "No progress report found." });
    return;
  }

  // Best-effort delete the underlying object
  try {
    await (await getPrivateObjectStorage()).deleteObject(report.objectPath);
  } catch {
    // Best effort — ignore errors
  }

  await db
    .delete(progressReportsTable)
    .where(eq(progressReportsTable.userId, userId));

  // A 204 (empty body) response has been observed intermittently arriving at
  // the client as a platform-level 503 even though this handler completed
  // and the row was deleted (confirmed via matching Vercel runtime logs
  // showing the request finishing with statusCode 204). Returning a small
  // JSON body on 200 avoids that empty-body response shape.
  res.status(200).json({ deleted: true });
});

/**
 * GET /progress-report/file
 * Stream the user's own progress report file.
 */
router.get("/progress-report/file", requireAuth, async (req, res): Promise<void> => {
  if (!isStorageAvailable()) {
    res.status(503).json({ error: "Object storage is not configured." });
    return;
  }

  const userId = req.userId!;
  const report = await getUserReport(userId);
  if (!report) {
    res.status(404).json({ error: "No progress report found." });
    return;
  }

  try {
    const storage = await getPrivateObjectStorage();

    const canAccess = await storage.canRead(report.objectPath, userId);
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const obj = await storage.downloadObject(report.objectPath);
    sendPrivateFile(res, obj, (err) =>
      req.log.error({ err }, "Failed to stream progress report file"),
    );
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "File not found in storage." });
      return;
    }
    req.log.error({ err }, "Failed to stream progress report file");
    res.status(500).json({ error: "Failed to serve file." });
  }
});

export default router;
