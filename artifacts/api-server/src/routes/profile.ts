import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  studentProfilesTable,
  conversations,
  progressReportsTable,
  progressReportMappingsTable,
  degreeChecksheetDocumentsTable,
  degreeChecksheetAnnotationsTable,
  academicPlansTable,
  planItemsTable,
  requirementCustomizationsTable,
  requirementCompletionsTable,
  quarterSchedulesTable,
  scheduleEventsTable,
  planSharesTable,
  feedbackTable,
  usageEventsTable,
} from "@workspace/db";
import { getPrivateObjectStorage, isPrivateStorageConfigured } from "../lib/storage";
import { UpsertProfileBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

function rowToDto(row: typeof studentProfilesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    studentId: row.studentId ?? null,
    studentType: row.studentType,
    college: row.college,
    major: row.major,
    secondMajor: row.secondMajor ?? null,
    minor: row.minor ?? null,
    additionalMajors: row.additionalMajors ?? [],
    additionalMinors: row.additionalMinors ?? [],
    startTerm: row.startTerm,
    startYear: row.startYear,
    expectedGradTerm: row.expectedGradTerm,
    expectedGradYear: row.expectedGradYear,
    unitsCompletedAtSCU: Number(row.unitsCompletedAtScu),
    unitsTransferredIn: Number(row.unitsTransferredIn),
    cumulativeGpa:
      row.cumulativeGpa === null ? null : Number(row.cumulativeGpa),
    majorGpa: row.majorGpa === null ? null : Number(row.majorGpa),
    completedCourseCodes: row.completedCourseCodes ?? [],
    priorityRegistration: row.priorityRegistration,
    currentTerm: row.currentTerm,
    currentYear: row.currentYear,
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/profile", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, req.userId!))
    .limit(1);
  if (rows.length === 0) {
    return res.status(404).json({ error: "No profile yet" });
  }
  res.json(rowToDto(rows[0]!));
});

router.put("/profile", requireAuth, async (req, res) => {
  const parsed = UpsertProfileBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error:
        "Invalid profile. Check student type, terms, college, major, and numeric fields.",
      details: parsed.error.flatten(),
    });
  }
  const body = parsed.data;
  const existing = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, req.userId!))
    .limit(1);

  const values = {
    userId: req.userId!,
    email: req.userEmail ?? null,
    name: body.name,
    studentId: body.studentId?.trim() || null,
    studentType: body.studentType,
    college: body.college,
    major: body.major,
    secondMajor: body.secondMajor ?? null,
    minor: body.minor ?? null,
    additionalMajors: body.additionalMajors ?? [],
    additionalMinors: body.additionalMinors ?? [],
    startTerm: body.startTerm,
    startYear: body.startYear,
    expectedGradTerm: body.expectedGradTerm,
    expectedGradYear: body.expectedGradYear,
    unitsCompletedAtScu: String(body.unitsCompletedAtSCU),
    unitsTransferredIn: String(body.unitsTransferredIn),
    cumulativeGpa:
      body.cumulativeGpa == null ? null : String(body.cumulativeGpa),
    majorGpa: body.majorGpa == null ? null : String(body.majorGpa),
    completedCourseCodes: body.completedCourseCodes,
    priorityRegistration: body.priorityRegistration,
    currentTerm: body.currentTerm,
    currentYear: body.currentYear,
    updatedAt: new Date(),
  };

  if (existing.length === 0) {
    const [created] = await db
      .insert(studentProfilesTable)
      .values(values)
      .returning();
    return res.json(rowToDto(created!));
  }
  const [updated] = await db
    .update(studentProfilesTable)
    .set(values)
    .where(
      and(
        eq(studentProfilesTable.id, existing[0]!.id),
        eq(studentProfilesTable.userId, req.userId!),
      ),
    )
    .returning();
  res.json(rowToDto(updated!));
});

/**
 * "Delete account": removes EVERY row this student owns and every stored file
 * (APR originals and degree checksheets), then the client signs out.
 *
 * Rows go first, in one transaction, so a student's records can never be left
 * half-deleted. Files are removed afterwards (storage is not transactional):
 * a file that cannot be removed is logged by count only, for an operator to
 * clear, and the student's view is already empty. Not deleted here: the
 * identity-provider account itself (Clerk today), and other students' share
 * grants that name this student as an advisor. See docs/security/DATA_RETENTION.md.
 */
router.delete("/profile", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const objectPaths: string[] = [];

  await db.transaction(async (tx) => {
    const reports = await tx
      .delete(progressReportsTable)
      .where(eq(progressReportsTable.userId, userId))
      .returning({ objectPath: progressReportsTable.objectPath });
    const checksheets = await tx
      .delete(degreeChecksheetDocumentsTable) // annotations cascade
      .where(eq(degreeChecksheetDocumentsTable.userId, userId))
      .returning({ objectPath: degreeChecksheetDocumentsTable.objectPath });
    objectPaths.push(...reports.map((r) => r.objectPath), ...checksheets.map((c) => c.objectPath));
    await tx.delete(degreeChecksheetAnnotationsTable).where(eq(degreeChecksheetAnnotationsTable.userId, userId));
    await tx.delete(progressReportMappingsTable).where(eq(progressReportMappingsTable.userId, userId));

    const plans = await tx
      .select({ id: academicPlansTable.id })
      .from(academicPlansTable)
      .where(eq(academicPlansTable.userId, userId));
    if (plans.length > 0) {
      const planIds = plans.map((p) => p.id);
      await tx.delete(planItemsTable).where(inArray(planItemsTable.planId, planIds));
      await tx.delete(academicPlansTable).where(inArray(academicPlansTable.id, planIds)); // customizations cascade
    }
    await tx.delete(requirementCustomizationsTable).where(eq(requirementCustomizationsTable.userId, userId));
    await tx.delete(requirementCompletionsTable).where(eq(requirementCompletionsTable.userId, userId));

    const schedules = await tx
      .select({ id: quarterSchedulesTable.id })
      .from(quarterSchedulesTable)
      .where(eq(quarterSchedulesTable.userId, userId));
    if (schedules.length > 0) {
      const scheduleIds = schedules.map((s) => s.id);
      await tx.delete(scheduleEventsTable).where(inArray(scheduleEventsTable.scheduleId, scheduleIds));
      await tx.delete(quarterSchedulesTable).where(inArray(quarterSchedulesTable.id, scheduleIds));
    }

    await tx.delete(planSharesTable).where(eq(planSharesTable.studentUserId, userId));
    await tx.delete(conversations).where(eq(conversations.userId, userId)); // messages cascade
    await tx.delete(feedbackTable).where(eq(feedbackTable.userId, userId));
    await tx.delete(usageEventsTable).where(eq(usageEventsTable.userId, userId));
    await tx.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, userId));
  });

  if (objectPaths.length > 0 && isPrivateStorageConfigured()) {
    const storage = await getPrivateObjectStorage();
    let orphaned = 0;
    for (const objectPath of objectPaths) {
      try {
        await storage.deleteObject(objectPath);
      } catch {
        orphaned++;
      }
    }
    if (orphaned > 0) {
      req.log.error({ event: "account_delete_orphaned_objects", count: orphaned }, "Account deleted but some stored files could not be removed");
    }
  }
  req.log.info({ event: "account_deleted", files: objectPaths.length }, "Student account data deleted");
  res.status(204).end();
});

export default router;
