import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { eq } from "drizzle-orm";
import { db, progressReportsTable, type ProgressReportRow } from "@workspace/db";
import { RegisterProgressReportBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { parseProgressReportText } from "../lib/progress-report-parser";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["application/pdf", "text/plain"]);

function reportDto(row: ProgressReportRow) {
  return {
    id: row.id,
    fileName: row.fileName,
    fileSize: row.fileSize,
    contentType: row.contentType,
    status: row.status as "stored" | "parsed" | "error",
    parseError: row.parseError ?? null,
    uploadedAt: row.uploadedAt.toISOString(),
    extracted: row.extracted,
  };
}

async function extractTextFromObject(
  objectPath: string,
  contentType: string,
): Promise<string> {
  const file = await objectStorage.getObjectEntityFile(objectPath);
  const [buf] = await file.download();
  if (contentType === "text/plain") {
    return buf.toString("utf8");
  }
  const { extractText } = await import("unpdf");
  const { text } = await extractText(new Uint8Array(buf), {
    mergePages: true,
  });
  return Array.isArray(text) ? text.join("\n") : text;
}

// GET /progress-report — current user's report metadata (or null)
router.get("/progress-report", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(progressReportsTable)
    .where(eq(progressReportsTable.userId, req.userId!));
  res.json({ report: rows[0] ? reportDto(rows[0]) : null });
});

// POST /progress-report — register an uploaded file (replaces any prior one)
router.post(
  "/progress-report",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = RegisterProgressReportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid fields" });
      return;
    }
    const { objectPath, fileName, fileSize, contentType } = parsed.data;
    if (!ALLOWED_TYPES.has(contentType)) {
      res.status(400).json({
        error:
          "Unsupported file type. Upload the Academic Progress Report as a PDF (or plain-text export).",
      });
      return;
    }
    if (fileSize > MAX_SIZE_BYTES) {
      res
        .status(400)
        .json({ error: "File is larger than the 10 MB limit." });
      return;
    }

    // The upload URL endpoint assigned the owner before it handed the browser
    // an opaque object path. Verify that ownership here; never reassign an
    // existing object's ACL based on caller-provided data.
    let normalizedPath: string;
    try {
      normalizedPath = objectStorage.normalizeObjectEntityPath(objectPath);
      const uploadedFile =
        await objectStorage.getObjectEntityFile(normalizedPath);
      const ownsUpload = await objectStorage.canAccessObjectEntity({
        userId: req.userId!,
        objectFile: uploadedFile,
        requestedPermission: ObjectPermission.WRITE,
      });
      if (!ownsUpload) {
        res.status(403).json({ error: "This upload does not belong to you." });
        return;
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res
          .status(400)
          .json({ error: "Uploaded file was not found in storage." });
        return;
      }
      throw err;
    }

    // Conservative parse. Failure to parse is recorded honestly, never hidden.
    let status = "stored";
    let parseError: string | null = null;
    let extracted: ProgressReportRow["extracted"] = {
      courses: [],
      notes: [],
    };
    try {
      const text = await extractTextFromObject(normalizedPath, contentType);
      const result = parseProgressReportText(text);
      extracted = result;
      status = result.courses.length > 0 ? "parsed" : "stored";
    } catch (err) {
      status = "error";
      parseError =
        "The file could not be read for extraction. The original is still stored and viewable.";
      // Never log report contents; log only that parsing failed.
      req.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Progress report parse failed",
      );
    }

    // Replace any prior report (one per user). Delete the old stored object.
    const prior = await db
      .select()
      .from(progressReportsTable)
      .where(eq(progressReportsTable.userId, req.userId!));
    if (prior[0]) {
      try {
        const oldFile = await objectStorage.getObjectEntityFile(
          prior[0].objectPath,
        );
        await oldFile.delete();
      } catch {
        // Old object already gone — metadata replacement proceeds.
      }
      await db
        .delete(progressReportsTable)
        .where(eq(progressReportsTable.id, prior[0].id));
    }

    const inserted = await db
      .insert(progressReportsTable)
      .values({
        userId: req.userId!,
        objectPath: normalizedPath,
        fileName,
        fileSize,
        contentType,
        status,
        parseError,
        extracted,
      })
      .returning();

    res.status(201).json(reportDto(inserted[0]!));
  },
);

// DELETE /progress-report — remove metadata and the stored file
router.delete("/progress-report", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(progressReportsTable)
    .where(eq(progressReportsTable.userId, req.userId!));
  if (!rows[0]) {
    res.status(404).json({ error: "No report on file" });
    return;
  }
  try {
    const file = await objectStorage.getObjectEntityFile(rows[0].objectPath);
    await file.delete();
  } catch {
    // Object already gone; still remove metadata.
  }
  await db
    .delete(progressReportsTable)
    .where(eq(progressReportsTable.id, rows[0].id));
  res.status(204).end();
});

// GET /progress-report/file — stream the original upload (owner only)
router.get("/progress-report/file", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(progressReportsTable)
    .where(eq(progressReportsTable.userId, req.userId!));
  if (!rows[0]) {
    res.status(404).json({ error: "No report on file" });
    return;
  }
  try {
    const file = await objectStorage.getObjectEntityFile(rows[0].objectPath);
    const canAccess = await objectStorage.canAccessObjectEntity({
      userId: req.userId,
      objectFile: file,
      requestedPermission: ObjectPermission.READ,
    });
    if (!canAccess) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const response = await objectStorage.downloadObject(file, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${rows[0].fileName.replace(/[^\w. -]/g, "_")}"`,
    );
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Stored file is missing" });
      return;
    }
    throw err;
  }
});

export default router;
