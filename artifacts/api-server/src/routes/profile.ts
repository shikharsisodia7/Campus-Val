import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, studentProfilesTable, conversations } from "@workspace/db";
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
    cumulativeGpa: row.cumulativeGpa === null ? null : Number(row.cumulativeGpa),
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
  const body = UpsertProfileBody.parse(req.body);
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
    cumulativeGpa: body.cumulativeGpa == null ? null : String(body.cumulativeGpa),
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

router.delete("/profile", requireAuth, async (req, res) => {
  // Wipe everything tied to this user. Messages cascade-delete from conversations.
  await db.transaction(async (tx) => {
    await tx
      .delete(conversations)
      .where(eq(conversations.userId, req.userId!));
    await tx
      .delete(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, req.userId!));
  });
  res.status(204).end();
});

export default router;
