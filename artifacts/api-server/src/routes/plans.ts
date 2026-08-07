import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import {
  db,
  academicPlansTable,
  planItemsTable,
  studentProfilesTable,
  type AcademicPlanRow,
  type PlanItemRow,
} from "@workspace/db";
import {
  CreatePlanBody,
  UpdatePlanBody,
  DuplicatePlanBody,
  AddPlanItemBody,
  UpdatePlanItemBody,
  ReplacePlanPlaceholderBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { findCourse } from "../data/courses";
import { OFFERED_TERMS, isTentativeTerm, OFFERED_SECTIONS } from "../data/offered-sections";
import { courseSectionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const TERMS = new Set(["fall", "winter", "spring", "summer"]);
const MIN_ACADEMIC_YEAR = 2000;
const MAX_ACADEMIC_YEAR = 2100;

function validAcademicYear(y: unknown): y is number {
  return (
    typeof y === "number" &&
    Number.isInteger(y) &&
    y >= MIN_ACADEMIC_YEAR &&
    y <= MAX_ACADEMIC_YEAR
  );
}
const TERM_ORDER: Record<string, number> = { fall: 0, winter: 1, spring: 2, summer: 3 };

const COMPLETION_SOURCES = new Set([
  "prior_to_scu",
  "transfer_credit",
  "ap_ib_test_credit",
  "previously_completed_scu",
  "other_institution",
  "manually_marked",
]);

const COMPLETION_SOURCE_LABELS: Record<string, string> = {
  prior_to_scu: "Prior to SCU",
  transfer_credit: "Transfer Credit",
  ap_ib_test_credit: "AP/IB/Test Credit",
  previously_completed_scu: "Previously Completed at SCU",
  other_institution: "Other Institution",
  manually_marked: "Manually Marked Completed",
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

function planDto(row: AcademicPlanRow, itemCount: number) {
  return {
    id: row.id,
    name: row.name,
    planType: row.planType as "degree" | "tentative",
    sourcePlanId: row.sourcePlanId ?? null,
    metadata: row.metadata ?? {},
    itemCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function itemDto(row: PlanItemRow) {
  return {
    id: row.id,
    planId: row.planId,
    itemType: row.itemType as "course" | "requirement_placeholder",
    courseCode: row.courseCode ?? null,
    courseTitle: row.courseTitle ?? null,
    units: row.units === null ? null : Number(row.units),
    requirementId: row.requirementId ?? null,
    requirementCategory: row.requirementCategory ?? null,
    requirementLabel: row.requirementLabel ?? null,
    academicYear: row.academicYear,
    term: row.term as "fall" | "winter" | "spring" | "summer",
    bucket: (row.bucket ?? "planned") as "planned" | "completed",
    completionSource: row.completionSource ?? null,
    position: row.position,
    note: row.note ?? null,
  };
}

/**
 * Validate bucket/completionSource pairing. Completed items must carry a
 * provenance source; planned items must not.
 */
function bucketError(
  bucket: string | undefined,
  completionSource: string | null | undefined,
): string | null {
  const b = bucket ?? "planned";
  if (b !== "planned" && b !== "completed") return "Invalid bucket.";
  if (b === "completed") {
    if (!completionSource || !COMPLETION_SOURCES.has(completionSource)) {
      return "Completed items need a valid completion source (how it was completed).";
    }
  } else if (completionSource) {
    return "Only completed items can carry a completion source.";
  }
  return null;
}

/** Load a plan and verify the requesting user owns it. */
async function ownedPlan(
  planId: number,
  userId: string,
): Promise<AcademicPlanRow | null> {
  if (!Number.isInteger(planId) || planId <= 0) return null;
  const rows = await db
    .select()
    .from(academicPlansTable)
    .where(
      and(
        eq(academicPlansTable.id, planId),
        eq(academicPlansTable.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function itemsOf(planId: number): Promise<PlanItemRow[]> {
  return db
    .select()
    .from(planItemsTable)
    .where(eq(planItemsTable.planId, planId))
    .orderBy(
      asc(planItemsTable.academicYear),
      asc(planItemsTable.position),
      asc(planItemsTable.id),
    );
}

async function copyItems(fromPlanId: number, toPlanId: number): Promise<void> {
  const items = await itemsOf(fromPlanId);
  if (items.length === 0) return;
  await db.insert(planItemsTable).values(
    items.map((i) => ({
      planId: toPlanId,
      itemType: i.itemType,
      courseCode: i.courseCode,
      courseTitle: i.courseTitle,
      units: i.units,
      requirementId: i.requirementId,
      requirementCategory: i.requirementCategory,
      requirementLabel: i.requirementLabel,
      academicYear: i.academicYear,
      term: i.term,
      bucket: i.bucket,
      completionSource: i.completionSource,
      position: i.position,
      note: i.note,
    })),
  );
}

/** Ensure the user has exactly one Degree Plan; create it if missing. */
async function ensureDegreePlan(userId: string): Promise<void> {
  const existing = await db
    .select({ id: academicPlansTable.id })
    .from(academicPlansTable)
    .where(
      and(
        eq(academicPlansTable.userId, userId),
        eq(academicPlansTable.planType, "degree"),
      ),
    )
    .limit(1);
  if (existing.length === 0) {
    await db.insert(academicPlansTable).values({
      userId,
      name: "Degree Plan",
      planType: "degree",
    });
  }
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

router.get("/plans", requireAuth, async (req, res) => {
  const userId = req.userId!;
  await ensureDegreePlan(userId);
  const plans = await db
    .select()
    .from(academicPlansTable)
    .where(eq(academicPlansTable.userId, userId))
    .orderBy(asc(academicPlansTable.createdAt), asc(academicPlansTable.id));
  const counts = await db
    .select({
      planId: planItemsTable.planId,
      count: sql<number>`count(*)::int`,
    })
    .from(planItemsTable)
    .groupBy(planItemsTable.planId);
  const countMap = new Map(counts.map((c) => [c.planId, c.count]));
  // Degree plan first, then tentative plans by creation date.
  const sorted = [...plans].sort((a, b) => {
    if (a.planType !== b.planType) return a.planType === "degree" ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  res.json({ plans: sorted.map((p) => planDto(p, countMap.get(p.id) ?? 0)) });
});

router.post("/plans", requireAuth, async (req, res) => {
  const parsed = CreatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a plan name (1–80 characters)." });
  }
  const userId = req.userId!;
  const { name, copyFromPlanId } = parsed.data;

  let sourcePlanId: number | null = null;
  if (copyFromPlanId !== undefined && copyFromPlanId !== null) {
    const source = await ownedPlan(copyFromPlanId, userId);
    if (!source) return res.status(404).json({ error: "Source plan not found." });
    sourcePlanId = source.id;
  }

  const [created] = await db
    .insert(academicPlansTable)
    .values({
      userId,
      name: name.trim(),
      planType: "tentative",
      sourcePlanId,
      metadata: sourcePlanId
        ? (await ownedPlan(sourcePlanId, userId))?.metadata ?? {}
        : {},
    })
    .returning();
  if (sourcePlanId !== null) await copyItems(sourcePlanId, created!.id);
  const items = await itemsOf(created!.id);
  res.status(201).json(planDto(created!, items.length));
});

router.get("/plans/:id", requireAuth, async (req, res) => {
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const items = await itemsOf(plan.id);
  res.json({
    id: plan.id,
    name: plan.name,
    planType: plan.planType,
    sourcePlanId: plan.sourcePlanId ?? null,
    metadata: plan.metadata ?? {},
    items: items.map(itemDto),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  });
});

router.patch("/plans/:id", requireAuth, async (req, res) => {
  const parsed = UpdatePlanBody.safeParse(req.body);
  if (!parsed.success || (!parsed.data.name && !parsed.data.metadata)) {
    return res.status(400).json({ error: "Provide a valid plan name or plan settings." });
  }
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const [updated] = await db
    .update(academicPlansTable)
    .set({
      ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.metadata
        ? {
            metadata: {
              addedYears: Array.from(
                new Set(
                  (parsed.data.metadata.addedYears ?? []).filter(validAcademicYear),
                ),
              ).sort((a, b) => a - b),
              summerYears: Array.from(
                new Set(
                  (parsed.data.metadata.summerYears ?? []).filter(validAcademicYear),
                ),
              ).sort((a, b) => a - b),
              scenarioMajors: Array.from(
                new Set(
                  (parsed.data.metadata.scenarioMajors ?? [])
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0)
                    .map((value) => value.slice(0, 120)),
                ),
              ),
              scenarioMinors: Array.from(
                new Set(
                  (parsed.data.metadata.scenarioMinors ?? [])
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0)
                    .map((value) => value.slice(0, 120)),
                ),
              ),
            },
          }
        : {}),
    })
    .where(eq(academicPlansTable.id, plan.id))
    .returning();
  const items = await itemsOf(plan.id);
  res.json(planDto(updated!, items.length));
});

router.delete("/plans/:id", requireAuth, async (req, res) => {
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  if (plan.planType === "degree") {
    return res
      .status(400)
      .json({ error: "The Degree Plan cannot be deleted." });
  }
  await db.delete(planItemsTable).where(eq(planItemsTable.planId, plan.id));
  await db.delete(academicPlansTable).where(eq(academicPlansTable.id, plan.id));
  res.status(204).end();
});

router.post("/plans/:id/duplicate", requireAuth, async (req, res) => {
  const parsed = DuplicatePlanBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a plan name (1–80 characters)." });
  }
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const [created] = await db
    .insert(academicPlansTable)
    .values({
      userId: req.userId!,
      name: parsed.data.name.trim(),
      planType: "tentative",
      sourcePlanId: plan.id,
      metadata: plan.metadata ?? {},
    })
    .returning();
  await copyItems(plan.id, created!.id);
  const items = await itemsOf(created!.id);
  res.status(201).json(planDto(created!, items.length));
});

router.post("/plans/:id/promote", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const plan = await ownedPlan(Number(req.params.id), userId);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  if (plan.planType === "degree") {
    return res
      .status(400)
      .json({ error: "This plan is already your Degree Plan." });
  }
  // Demote the current degree plan to a clearly-named tentative backup.
  const current = await db
    .select()
    .from(academicPlansTable)
    .where(
      and(
        eq(academicPlansTable.userId, userId),
        eq(academicPlansTable.planType, "degree"),
      ),
    );
  const stamp = new Date().toISOString().slice(0, 10);
  for (const c of current) {
    await db
      .update(academicPlansTable)
      .set({
        planType: "tentative",
        name: `${c.name} (previous, ${stamp})`.slice(0, 80),
      })
      .where(eq(academicPlansTable.id, c.id));
  }
  const [promoted] = await db
    .update(academicPlansTable)
    .set({ planType: "degree" })
    .where(eq(academicPlansTable.id, plan.id))
    .returning();
  const items = await itemsOf(plan.id);
  res.json(planDto(promoted!, items.length));
});

// ---------------------------------------------------------------------------
// Plan items
// ---------------------------------------------------------------------------

router.post("/plans/:id/items", requireAuth, async (req, res) => {
  const parsed = AddPlanItemBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid plan item." });
  }
  const body = parsed.data;
  if (!TERMS.has(body.term)) {
    return res.status(400).json({ error: "Invalid term." });
  }
  if (!validAcademicYear(body.academicYear)) {
    return res.status(400).json({ error: "Invalid academic year." });
  }
  const addBucketErr = bucketError(body.bucket, body.completionSource ?? null);
  if (addBucketErr) return res.status(400).json({ error: addBucketErr });
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  let values: typeof planItemsTable.$inferInsert;
  if (body.itemType === "course") {
    if (!body.courseCode) {
      return res.status(400).json({ error: "courseCode is required for course items." });
    }
    const course = findCourse(normalizeCode(body.courseCode));
    if (!course) {
      return res.status(400).json({
        error: `${normalizeCode(body.courseCode)} is not in the SCU catalog.`,
      });
    }
    if (!body.allowDuplicate) {
      const existing = await db
        .select({ id: planItemsTable.id })
        .from(planItemsTable)
        .where(
          and(
            eq(planItemsTable.planId, plan.id),
            eq(planItemsTable.courseCode, course.code),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        return res.status(409).json({
          error: `${course.code} is already in this plan.`,
          duplicate: true,
        });
      }
    }
    values = {
      planId: plan.id,
      itemType: "course",
      courseCode: course.code,
      courseTitle: course.title,
      units: String(course.units),
      academicYear: body.academicYear,
      term: body.term,
      note: body.note ?? null,
      position: 0,
    };
  } else {
    if (!body.requirementLabel) {
      return res.status(400).json({
        error: "requirementLabel is required for requirement placeholders.",
      });
    }
    values = {
      planId: plan.id,
      itemType: "requirement_placeholder",
      requirementId: body.requirementId ?? null,
      requirementCategory: body.requirementCategory ?? null,
      requirementLabel: body.requirementLabel,
      academicYear: body.academicYear,
      term: body.term,
      note: body.note ?? null,
      position: 0,
    };
  }

  values.bucket = body.bucket ?? "planned";
  values.completionSource =
    values.bucket === "completed" ? (body.completionSource ?? null) : null;

  // Append at the end of the target group. Completed items form a single
  // group regardless of year/term; planned items group per year+term.
  const groupWhere =
    values.bucket === "completed"
      ? and(
          eq(planItemsTable.planId, plan.id),
          eq(planItemsTable.bucket, "completed"),
        )
      : and(
          eq(planItemsTable.planId, plan.id),
          eq(planItemsTable.bucket, "planned"),
          eq(planItemsTable.academicYear, values.academicYear),
          eq(planItemsTable.term, values.term),
        );
  const [{ max }] = (await db
    .select({ max: sql<number>`coalesce(max(${planItemsTable.position}), -1)::int` })
    .from(planItemsTable)
    .where(groupWhere)) as [{ max: number }];
  values.position = max + 1;

  const [created] = await db.insert(planItemsTable).values(values).returning();
  await touchPlan(plan.id);
  res.status(201).json(itemDto(created!));
});

router.patch("/plans/:id/items/:itemId", requireAuth, async (req, res) => {
  const parsed = UpdatePlanItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update." });
  const body = parsed.data;
  if (body.term !== undefined && !TERMS.has(body.term)) {
    return res.status(400).json({ error: "Invalid term." });
  }
  if (body.academicYear !== undefined && !validAcademicYear(body.academicYear)) {
    return res.status(400).json({ error: "Invalid academic year." });
  }
  if (
    body.position !== undefined &&
    (!Number.isInteger(body.position) || body.position < 0)
  ) {
    return res.status(400).json({ error: "Invalid position." });
  }
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const item = await ownedItem(plan.id, Number(req.params.itemId));
  if (!item) return res.status(404).json({ error: "Plan item not found." });

  const targetYear = body.academicYear ?? item.academicYear;
  const targetTerm = body.term ?? item.term;
  const itemBucket = (item.bucket ?? "planned") as "planned" | "completed";
  const targetBucket = body.bucket ?? itemBucket;
  const targetSource =
    body.completionSource !== undefined
      ? body.completionSource
      : targetBucket === "completed"
        ? item.completionSource
        : null;
  const moveBucketErr = bucketError(targetBucket, targetSource);
  if (moveBucketErr) return res.status(400).json({ error: moveBucketErr });
  const bucketChanged = targetBucket !== itemBucket;
  const termChanged =
    !bucketChanged &&
    targetBucket === "planned" &&
    (targetYear !== item.academicYear || targetTerm !== item.term);
  const positionChanged = body.position !== undefined;

  /** Group an item belongs to for ordering: completed is one flat group. */
  const groupKey = (i: {
    bucket: string | null;
    academicYear: number;
    term: string;
  }) =>
    (i.bucket ?? "planned") === "completed"
      ? "completed"
      : `planned:${i.academicYear}:${i.term}`;
  const targetGroupKey =
    targetBucket === "completed"
      ? "completed"
      : `planned:${targetYear}:${targetTerm}`;
  const sourceGroupKey = groupKey(item);
  const groupMoved = bucketChanged || termChanged;

  let updated: PlanItemRow;
  if (groupMoved || positionChanged) {
    // Move with deterministic, contiguous reindexing of both affected groups.
    updated = await db.transaction(async (tx) => {
      const all = await tx
        .select()
        .from(planItemsTable)
        .where(eq(planItemsTable.planId, plan.id))
        .orderBy(asc(planItemsTable.position), asc(planItemsTable.id));

      const target = all.filter(
        (i) => i.id !== item.id && groupKey(i) === targetGroupKey,
      );
      const insertAt = Math.min(
        Math.max(body.position ?? target.length, 0),
        target.length,
      );
      target.splice(insertAt, 0, item);

      // Reindex target group.
      for (let idx = 0; idx < target.length; idx++) {
        const t = target[idx]!;
        const patch: Partial<typeof planItemsTable.$inferInsert> = {
          position: idx,
        };
        if (t.id === item.id) {
          patch.academicYear = targetYear;
          patch.term = targetTerm;
          patch.bucket = targetBucket;
          patch.completionSource =
            targetBucket === "completed" ? targetSource : null;
          if (body.note !== undefined) patch.note = body.note;
        }
        await tx
          .update(planItemsTable)
          .set(patch)
          .where(eq(planItemsTable.id, t.id));
      }

      // Reindex the source group the item left, closing any gap.
      if (groupMoved) {
        const source = all.filter(
          (i) => i.id !== item.id && groupKey(i) === sourceGroupKey,
        );
        for (let idx = 0; idx < source.length; idx++) {
          if (source[idx]!.position !== idx) {
            await tx
              .update(planItemsTable)
              .set({ position: idx })
              .where(eq(planItemsTable.id, source[idx]!.id));
          }
        }
      }

      const rows = await tx
        .select()
        .from(planItemsTable)
        .where(eq(planItemsTable.id, item.id))
        .limit(1);
      return rows[0]!;
    });
  } else {
    const patch: Partial<typeof planItemsTable.$inferInsert> = {};
    if (body.note !== undefined) patch.note = body.note;
    if (
      body.completionSource !== undefined &&
      itemBucket === "completed"
    ) {
      patch.completionSource = targetSource;
    }
    if (Object.keys(patch).length === 0) {
      return res.json(itemDto(item));
    }
    const rows = await db
      .update(planItemsTable)
      .set(patch)
      .where(eq(planItemsTable.id, item.id))
      .returning();
    updated = rows[0]!;
  }
  await touchPlan(plan.id);
  res.json(itemDto(updated));
});

router.delete("/plans/:id/items/:itemId", requireAuth, async (req, res) => {
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const item = await ownedItem(plan.id, Number(req.params.itemId));
  if (!item) return res.status(404).json({ error: "Plan item not found." });
  await db.delete(planItemsTable).where(eq(planItemsTable.id, item.id));
  await touchPlan(plan.id);
  res.status(204).end();
});

router.post(
  "/plans/:id/items/:itemId/replace",
  requireAuth,
  async (req, res) => {
    const parsed = ReplacePlanPlaceholderBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose a course." });
    const plan = await ownedPlan(Number(req.params.id), req.userId!);
    if (!plan) return res.status(404).json({ error: "Plan not found." });
    const item = await ownedItem(plan.id, Number(req.params.itemId));
    if (!item) return res.status(404).json({ error: "Plan item not found." });
    if (item.itemType !== "requirement_placeholder") {
      return res
        .status(400)
        .json({ error: "Only requirement placeholders can be replaced." });
    }
    const course = findCourse(normalizeCode(parsed.data.courseCode));
    if (!course) {
      return res.status(400).json({
        error: `${normalizeCode(parsed.data.courseCode)} is not in the SCU catalog.`,
      });
    }
    // Same plan, same term/year, same slot: swap placeholder for the course.
    const [updated] = await db
      .update(planItemsTable)
      .set({
        itemType: "course",
        courseCode: course.code,
        courseTitle: course.title,
        units: String(course.units),
        // Keep the requirement link so progress views know what this fulfills.
        requirementId: item.requirementId,
        requirementCategory: item.requirementCategory,
        requirementLabel: item.requirementLabel,
      })
      .where(eq(planItemsTable.id, item.id))
      .returning();
    await touchPlan(plan.id);
    res.json(itemDto(updated!));
  },
);

async function ownedItem(
  planId: number,
  itemId: number,
): Promise<PlanItemRow | null> {
  if (!Number.isInteger(itemId) || itemId <= 0) return null;
  const rows = await db
    .select()
    .from(planItemsTable)
    .where(
      and(eq(planItemsTable.id, itemId), eq(planItemsTable.planId, planId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function touchPlan(planId: number): Promise<void> {
  await db
    .update(academicPlansTable)
    .set({ updatedAt: new Date() })
    .where(eq(academicPlansTable.id, planId));
}

// ---------------------------------------------------------------------------
// Advisor export (.xlsx)
// ---------------------------------------------------------------------------

router.get("/plans/:id/export", requireAuth, async (req, res) => {
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const items = await itemsOf(plan.id);

  const profileRows = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, req.userId!))
    .limit(1);
  const profile = profileRows[0];

  const wb = new ExcelJS.Workbook();
  wb.creator = "CampusVal";
  const ws = wb.addWorksheet("Academic Plan");

  ws.columns = [
    { header: "Academic Year", key: "year", width: 14 },
    { header: "Term", key: "term", width: 18 },
    { header: "Item Type", key: "type", width: 22 },
    { header: "Course Code", key: "code", width: 14 },
    { header: "Course Title / Requirement", key: "title", width: 48 },
    { header: "Units", key: "units", width: 8 },
    { header: "Requirement Category", key: "category", width: 26 },
    { header: "Notes", key: "notes", width: 32 },
  ];

  // Header block
  ws.insertRow(1, []);
  ws.insertRow(1, [
    "Student",
    profile?.name ?? "—",
    "",
    "College",
    profile?.college ?? "—",
  ]);
  ws.insertRow(2, [
    "Plan",
    plan.name,
    "",
    "Major",
    profile?.major ?? "—",
  ]);
  ws.insertRow(3, [
    "Plan Type",
    plan.planType === "degree" ? "Degree Plan" : "Tentative Plan",
    "",
    "Exported",
    new Date().toISOString().slice(0, 10),
  ]);
  const headerRowIdx = 5;
  ws.getRow(headerRowIdx).font = { bold: true };
  for (let r = 1; r <= 3; r++) {
    ws.getRow(r).getCell(1).font = { bold: true };
    ws.getRow(r).getCell(4).font = { bold: true };
  }

  // Completed-before-plan items first (with provenance), then planned terms.
  const isCompleted = (i: PlanItemRow) => (i.bucket ?? "planned") === "completed";
  const sorted = [...items].sort(
    (a, b) =>
      Number(isCompleted(b)) - Number(isCompleted(a)) ||
      a.academicYear - b.academicYear ||
      (TERM_ORDER[a.term] ?? 9) - (TERM_ORDER[b.term] ?? 9) ||
      a.position - b.position,
  );
  let lastKey = "";
  for (const item of sorted) {
    const completedItem = isCompleted(item);
    const key = completedItem
      ? "completed"
      : `${item.academicYear}-${item.term}`;
    const isNewGroup = key !== lastKey;
    lastKey = key;
    const row = ws.addRow({
      year: completedItem
        ? "Completed / Prior"
        : `${item.academicYear}–${item.academicYear + 1}`,
      term: completedItem
        ? (COMPLETION_SOURCE_LABELS[item.completionSource ?? ""] ??
          "Completed (source unspecified)")
        : item.term.charAt(0).toUpperCase() + item.term.slice(1),
      type:
        item.itemType === "course" ? "Course" : "Requirement Placeholder",
      code: item.itemType === "course" ? (item.courseCode ?? "") : "",
      title:
        item.itemType === "course"
          ? (item.courseTitle ?? "")
          : [item.requirementCategory, item.requirementLabel]
              .filter(Boolean)
              .join(": "),
      units: item.units === null ? "" : Number(item.units),
      category: item.requirementCategory ?? "",
      notes: item.note ?? "",
    });
    if (isNewGroup) {
      row.border = { top: { style: "thin", color: { argb: "FF999999" } } };
    }
    if (item.itemType === "requirement_placeholder") {
      row.font = { italic: true };
    }
  }
  if (sorted.length === 0) {
    ws.addRow({ year: "", term: "", type: "No items planned yet." });
  }

  const safeName = plan.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "plan";
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="CampusVal - ${safeName}.xlsx"`,
  );
  const buffer = await wb.xlsx.writeBuffer();
  res.end(Buffer.from(buffer));
});

// ---------------------------------------------------------------------------
// Schedule availability (single source of truth for published vs tentative)
// ---------------------------------------------------------------------------

router.get("/schedule-availability", requireAuth, async (_req, res) => {
  const officialCounts = new Map<string, number>();
  const officialCodes = new Map<string, Set<string>>();
  for (const s of OFFERED_SECTIONS) {
    const key = `${s.term}-${s.year}`;
    officialCounts.set(key, (officialCounts.get(key) ?? 0) + 1);
    const code = s.courseCode.toUpperCase().replace(/\s+/g, " ").trim();
    let set = officialCodes.get(key);
    if (!set) {
      set = new Set();
      officialCodes.set(key, set);
    }
    set.add(code);
  }
  const synced = await db
    .select({
      term: courseSectionsTable.term,
      year: courseSectionsTable.year,
      count: sql<number>`count(*)::int`,
    })
    .from(courseSectionsTable)
    .groupBy(courseSectionsTable.term, courseSectionsTable.year);
  const syncedMap = new Map(synced.map((s) => [`${s.term}-${s.year}`, s.count]));

  res.json({
    terms: OFFERED_TERMS.map(({ term, year }) => ({
      term,
      year,
      status: isTentativeTerm(term, year) ? "tentative" : "published",
      officialSectionCount: officialCounts.get(`${term}-${year}`) ?? 0,
      syncedSectionCount: syncedMap.get(`${term}-${year}`) ?? 0,
      offeredCourseCodes: Array.from(
        officialCodes.get(`${term}-${year}`) ?? [],
      ).sort(),
    })),
    note: "Quarters not listed here have no official SCU schedule published yet. Course sections, instructors, and times for those terms are unknown — plan with courses and requirement placeholders instead.",
  });
});

export default router;
