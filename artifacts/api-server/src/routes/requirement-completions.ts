import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, requirementCompletionsTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const SetBody = z.object({
  collegeCode: z.string().min(1),
  groupId: z.string().min(1),
  requirementId: z.string().min(1),
  completed: z.boolean(),
});

function rowToDto(row: typeof requirementCompletionsTable.$inferSelect) {
  return {
    collegeCode: row.collegeCode,
    groupId: row.groupId,
    requirementId: row.requirementId,
    source: row.source,
    completedAt: row.completedAt.toISOString(),
  };
}

async function listFor(userId: string, collegeCode: string) {
  const rows = await db
    .select()
    .from(requirementCompletionsTable)
    .where(
      and(
        eq(requirementCompletionsTable.userId, userId),
        eq(requirementCompletionsTable.collegeCode, collegeCode),
      ),
    );
  return rows.map(rowToDto);
}

router.get("/requirements/completions", requireAuth, async (req, res) => {
  const collegeCode = String(req.query.collegeCode ?? "");
  if (!collegeCode) {
    return res.status(400).json({ error: "collegeCode is required" });
  }
  res.json(await listFor(req.userId!, collegeCode));
});

router.put("/requirements/completions", requireAuth, async (req, res) => {
  const body = SetBody.parse(req.body);
  const scope = and(
    eq(requirementCompletionsTable.userId, req.userId!),
    eq(requirementCompletionsTable.collegeCode, body.collegeCode),
    eq(requirementCompletionsTable.groupId, body.groupId),
    eq(requirementCompletionsTable.requirementId, body.requirementId),
  );
  if (body.completed) {
    await db
      .insert(requirementCompletionsTable)
      .values({
        userId: req.userId!,
        collegeCode: body.collegeCode,
        groupId: body.groupId,
        requirementId: body.requirementId,
        source: "manual",
      })
      .onConflictDoNothing();
  } else {
    await db.delete(requirementCompletionsTable).where(scope);
  }
  res.json(await listFor(req.userId!, body.collegeCode));
});

router.delete("/requirements/completions", requireAuth, async (req, res) => {
  const collegeCode = String(req.query.collegeCode ?? "");
  if (!collegeCode) {
    return res.status(400).json({ error: "collegeCode is required" });
  }
  await db
    .delete(requirementCompletionsTable)
    .where(
      and(
        eq(requirementCompletionsTable.userId, req.userId!),
        eq(requirementCompletionsTable.collegeCode, collegeCode),
      ),
    );
  res.status(204).end();
});

export default router;
