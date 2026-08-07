import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, progressReportsTable, type ProgressReportRow } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";
import { isUploadPathOwnedBy } from "../lib/uploadPath";
import { parseProgressReport } from "../lib/progress-report-parser";
import { Readable } from "stream";

const router: IRouter = Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".xlsx"]);

function isStorageAvailable(): boolean {
  return !!(process.env.PRIVATE_OBJECT_DIR);
}

function reportDto(row: ProgressReportRow) {
  return {
    id: row.id,
    userId: row.userId,
    fileName: row.fileName,
    fileSize: row.fileSize,
    contentType: row.contentType,
    objectPath: row.objectPath,
    uploadedAt: row.uploadedAt.toISOString(),
    parsed: row.parsed ?? null,
    parseStatus: row.parseStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function unavailableEnvelope() {
  return { available: false, report: null };
}

function reportEnvelope(row: ProgressReportRow | null | undefined) {
  return {
    available: true,
    report: row ? reportDto(row) : null,
  };
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
  res.json(reportEnvelope(report));
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

  const storageService = new ObjectStorageService();

  // Resolve the object and enforce ownership BEFORE touching its ACL or
  // contents. A freshly uploaded object has no ACL policy yet; an object
  // with an existing policy may only be (re-)registered by its owner.
  let objectFile;
  try {
    objectFile = await storageService.getObjectEntityFile(objectPath);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Uploaded file not found. Upload the file first, then register it." });
      return;
    }
    req.log.error({ err: (err as Error).message }, "Failed to access progress report object");
    res.status(500).json({ error: "Could not access the uploaded file." });
    return;
  }

  try {
    const existingAcl = await getObjectAclPolicy(objectFile);
    if (existingAcl && existingAcl.owner) {
      // Never allow claiming an object owned by someone else.
      if (existingAcl.owner !== userId) {
        res.status(403).json({ error: "Forbidden." });
        return;
      }
    } else if (!isUploadPathOwnedBy(objectPath, userId)) {
      // Fresh objects (no ACL yet) may only be registered through an upload
      // path minted for this user by /storage/uploads/request-url.
      res.status(403).json({ error: "Forbidden." });
      return;
    }
  } catch (err) {
    // Fail closed: if ownership can't be verified, refuse registration.
    req.log.error({ err: (err as Error).message }, "Failed to read ACL of progress report object");
    res.status(500).json({ error: "Could not verify file ownership." });
    return;
  }

  // Validate authoritative GCS metadata rather than trusting the client.
  let actualSize = 0;
  try {
    const [meta] = await objectFile.getMetadata();
    actualSize = Number(meta.size ?? 0);
  } catch (err) {
    req.log.error({ err: (err as Error).message }, "Failed to read metadata of progress report object");
    res.status(500).json({ error: "Could not verify the uploaded file." });
    return;
  }
  if (!actualSize || actualSize > MAX_FILE_SIZE) {
    res.status(400).json({ error: "File size exceeds the 10 MB limit (or the file is empty)." });
    return;
  }

  // Set ACL: owner = userId, private. Fail closed on errors.
  try {
    await storageService.trySetObjectEntityAclPolicy(objectPath, {
      owner: userId,
      visibility: "private",
    });
  } catch (err) {
    req.log.error({ err: (err as Error).message }, "Failed to set ACL on progress report object");
    res.status(500).json({ error: "Could not secure the uploaded file. Try again." });
    return;
  }

  // If a previous report exists, best-effort delete its GCS object
  const existing = await getUserReport(userId);
  if (existing && existing.objectPath !== objectPath) {
    try {
      const oldFile = await storageService.getObjectEntityFile(existing.objectPath);
      await oldFile.delete();
    } catch {
      // Best effort — ignore errors
    }
  }

  // Download the file buffer for parsing (size verified above).
  let fileBuf: Buffer;
  try {
    const [fileContents] = await objectFile.download();
    fileBuf = fileContents;
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

  // Best-effort delete the GCS object
  try {
    const storageService = new ObjectStorageService();
    const file = await storageService.getObjectEntityFile(report.objectPath);
    await file.delete();
  } catch {
    // Best effort — ignore errors
  }

  await db
    .delete(progressReportsTable)
    .where(eq(progressReportsTable.userId, userId));

  res.status(204).end();
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
    const storageService = new ObjectStorageService();
    const objectFile = await storageService.getObjectEntityFile(report.objectPath);

    // Verify ownership via ACL
    const canAccess = await storageService.canAccessObjectEntity({
      userId,
      objectFile,
    });
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden." });
      return;
    }

    const response = await storageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value: string, key: string) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
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
