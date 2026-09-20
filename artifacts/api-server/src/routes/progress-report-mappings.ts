import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, progressReportMappingsTable, type ProgressReportMappingRow } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { findCatalogCourse, normalizeReportCode } from "../lib/progress-report-parser";
import { getUserReport } from "./progress-report";

/**
 * A student's own mapping of an unrecognized APR item to a catalog course.
 *
 * An ANNOTATION kept beside the report (see the table's doc comment): it never
 * edits the uploaded file or its parse, never changes what counts as completed,
 * and is never shared. The API only accepts a mapping for a code the student's
 * CURRENT report actually lists as unmatched, onto a real catalog course, so a
 * client cannot use it to store arbitrary text or to "complete" anything.
 * The user is always the authenticated one.
 */
const router: IRouter = Router();

function mappingDto(row: ProgressReportMappingRow) {
  const course = findCatalogCourse(row.courseCode);
  return {
    rawCode: row.rawCode,
    courseCode: row.courseCode,
    // A course later removed from the catalog still shows its code, never a made-up title.
    courseTitle: course?.title ?? null,
    courseUnits: course?.units ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The codes the current report lists as unmatched to the catalog. */
function unmatchedCodesOf(parsed: unknown): Set<string> {
  const raws = (parsed as { possibleCourses?: { raw?: unknown }[] } | null)?.possibleCourses ?? [];
  const out = new Set<string>();
  for (const p of raws) {
    const code = typeof p?.raw === "string" ? normalizeReportCode(p.raw) : null;
    if (code) out.add(code);
  }
  return out;
}

/** GET /progress-report/mappings — the caller's mappings. */
router.get("/progress-report/mappings", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(progressReportMappingsTable)
    .where(eq(progressReportMappingsTable.userId, req.userId!));
  res.json({ mappings: rows.map(mappingDto).sort((a, b) => a.rawCode.localeCompare(b.rawCode)) });
});

/**
 * PUT /progress-report/mappings/:rawCode   body: { courseCode }
 * Create or change the mapping for one unmatched code on the caller's report.
 */
router.put("/progress-report/mappings/:rawCode", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rawCode = normalizeReportCode(String(req.params["rawCode"] ?? ""));
  if (!rawCode) {
    res.status(400).json({ error: "That is not a course code." });
    return;
  }
  const requested = (req.body as { courseCode?: unknown } | undefined)?.courseCode;
  if (typeof requested !== "string" || requested.length > 20) {
    res.status(400).json({ error: "courseCode is required." });
    return;
  }
  const course = findCatalogCourse(requested);
  if (!course) {
    res.status(400).json({ error: "That course is not in the CampusVal catalog." });
    return;
  }

  const report = await getUserReport(userId);
  if (!report) {
    res.status(404).json({ error: "No progress report found." });
    return;
  }
  if (!unmatchedCodesOf(report.parsed).has(rawCode)) {
    res.status(400).json({ error: "That code is not one of the unmatched items on your report." });
    return;
  }

  const [row] = await db
    .insert(progressReportMappingsTable)
    .values({ userId, rawCode, courseCode: course.code })
    .onConflictDoUpdate({
      target: [progressReportMappingsTable.userId, progressReportMappingsTable.rawCode],
      set: { courseCode: course.code, updatedAt: new Date() },
    })
    .returning();
  res.json(mappingDto(row!));
});

/** DELETE /progress-report/mappings/:rawCode — remove one of the caller's mappings. */
router.delete("/progress-report/mappings/:rawCode", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rawCode = normalizeReportCode(String(req.params["rawCode"] ?? ""));
  if (!rawCode) {
    res.status(400).json({ error: "That is not a course code." });
    return;
  }
  const removed = await db
    .delete(progressReportMappingsTable)
    .where(and(eq(progressReportMappingsTable.userId, userId), eq(progressReportMappingsTable.rawCode, rawCode)))
    .returning({ id: progressReportMappingsTable.id });
  if (removed.length === 0) {
    res.status(404).json({ error: "No such mapping." });
    return;
  }
  // Small JSON body rather than 204 (see the note on DELETE /progress-report).
  res.status(200).json({ deleted: true });
});

export default router;
