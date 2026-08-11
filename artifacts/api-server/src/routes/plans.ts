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
import { OFFERED_TERMS, OFFERED_SECTIONS, scheduleFreshness } from "../data/offered-sections";
import { courseSectionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { buildRequirementsResponse } from "./requirements";

const router: IRouter = Router();

const TERMS = new Set(["fall", "winter", "spring", "summer"]);
const PLAN_TERMS = new Set(["fall", "winter", "spring", "summer", "completed"]);
const MIN_ACADEMIC_YEAR = 2000;
const MAX_ACADEMIC_YEAR = 2100;
const COMPLETED_YEAR = 0; // academicYear used for the "completed" term bucket

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

const MAX_PROGRAMS_ENTRIES = 8;
const MAX_PROGRAM_LABEL_LEN = 50;

type PlanPrograms = {
  additionalMajors: string[];
  minors: string[];
  professionalGoals: ProfessionalGoal[];
};

type ProfessionalGoal = {
  id: string;
  name: string;
  notes: string;
  courseCodes: string[];
  placeholders: string[];
};

function goalId(value: string, index: number): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
  return `legacy-${slug || "goal"}-${index + 1}`;
}

function normalizeProfessionalGoals(raw: unknown): ProfessionalGoal[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return "programs.professionalGoals must be an array.";
  if (raw.length > MAX_PROGRAMS_ENTRIES) {
    return `programs.professionalGoals must have at most ${MAX_PROGRAMS_ENTRIES} entries.`;
  }

  const seenNames = new Set<string>();
  const goals: ProfessionalGoal[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    const legacyName = typeof entry === "string" ? entry : null;
    const candidate = legacyName
      ? {
          id: goalId(legacyName, index),
          name: legacyName,
          notes: "",
          courseCodes: [],
          placeholders: [],
        }
      : entry;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return "programs.professionalGoals entries must be a legacy name or a goal object.";
    }
    const goal = candidate as Record<string, unknown>;
    const name = typeof goal.name === "string" ? goal.name.trim() : "";
    const id = typeof goal.id === "string" ? goal.id.trim() : "";
    if (!name || name.length > MAX_PROGRAM_LABEL_LEN) {
      return `programs.professionalGoals names must be 1-${MAX_PROGRAM_LABEL_LEN} characters.`;
    }
    if (!id || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(id)) {
      return "programs.professionalGoals ids must contain only letters, numbers, and hyphens.";
    }
    const normalizedName = name.toLocaleLowerCase();
    if (seenNames.has(normalizedName)) continue;
    seenNames.add(normalizedName);

    const notes = typeof goal.notes === "string" ? goal.notes.trim().slice(0, 1000) : "";
    const readList = (key: "courseCodes" | "placeholders", maxLength: number) => {
      const list = goal[key] ?? [];
      if (!Array.isArray(list) || list.some((value) => typeof value !== "string")) return null;
      return Array.from(
        new Set(
          list
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => value.slice(0, maxLength)),
        ),
      );
    };
    const courseCodes = readList("courseCodes", 32);
    const placeholders = readList("placeholders", 120);
    if (!courseCodes || !placeholders) {
      return "programs.professionalGoals courseCodes and placeholders must be string arrays.";
    }
    const invalidCourse = courseCodes.find((courseCode) => !findCourse(normalizeCode(courseCode)));
    if (invalidCourse) {
      return `${invalidCourse} is not in the SCU catalog.`;
    }
    goals.push({
      id,
      name,
      notes,
      courseCodes: courseCodes.map(normalizeCode),
      placeholders,
    });
  }
  return goals;
}

function validatePrograms(raw: unknown): { ok: true; value: PlanPrograms } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, value: { additionalMajors: [], minors: [], professionalGoals: [] } };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "programs must be an object." };
  }
  const obj = raw as Record<string, unknown>;

  function validateArray(key: keyof PlanPrograms): string[] | string {
    const arr = obj[key];
    if (arr === undefined || arr === null) return [];
    if (!Array.isArray(arr)) return `programs.${key} must be an array.`;
    if (arr.length > MAX_PROGRAMS_ENTRIES)
      return `programs.${key} must have at most ${MAX_PROGRAMS_ENTRIES} entries.`;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of arr) {
      if (typeof item !== "string") return `programs.${key} must contain only strings.`;
      const trimmed = item.trim();
      if (trimmed.length === 0) return `programs.${key} must not contain empty strings.`;
      if (trimmed.length > MAX_PROGRAM_LABEL_LEN)
        return `programs.${key} entries must not exceed ${MAX_PROGRAM_LABEL_LEN} characters.`;
      const lower = trimmed.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(trimmed);
      }
    }
    return result;
  }

  const majorsResult = validateArray("additionalMajors");
  if (typeof majorsResult === "string") return { ok: false, error: majorsResult };
  const minorsResult = validateArray("minors");
  if (typeof minorsResult === "string") return { ok: false, error: minorsResult };
  const goalsResult = normalizeProfessionalGoals(obj.professionalGoals);
  if (typeof goalsResult === "string") return { ok: false, error: goalsResult };

  return {
    ok: true,
    value: {
      additionalMajors: majorsResult,
      minors: minorsResult,
      professionalGoals: goalsResult,
    },
  };
}


function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, " ");
}

function planDto(row: AcademicPlanRow, itemCount: number) {
  const programsValidation = validatePrograms(row.programs);
  return {
    id: row.id,
    name: row.name,
    planType: row.planType as "degree" | "tentative",
    sourcePlanId: row.sourcePlanId ?? null,
    metadata: row.metadata ?? {},
    programs: programsValidation.ok ? programsValidation.value : null,
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
    term: row.term as "fall" | "winter" | "spring" | "summer" | "completed",
    bucket: (row.bucket ?? "planned") as "planned" | "completed",
    completionSource: row.completionSource ?? null,
    position: row.position,
    note: row.note ?? null,
    provenance: row.provenance ?? null,
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
      provenance: i.provenance,
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

  const sourcePlan = sourcePlanId !== null ? await ownedPlan(sourcePlanId, userId) : null;
  const [created] = await db
    .insert(academicPlansTable)
    .values({
      userId,
      name: name.trim(),
      planType: "tentative",
      sourcePlanId,
      metadata: sourcePlan?.metadata ?? {},
      // Plan-scoped programs travel with the scenario copy.
      programs: sourcePlan?.programs ?? { additionalMajors: [], minors: [], professionalGoals: [] },
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
  const programsValidation = validatePrograms(plan.programs);
  res.json({
    id: plan.id,
    name: plan.name,
    planType: plan.planType,
    sourcePlanId: plan.sourcePlanId ?? null,
    metadata: plan.metadata ?? {},
    programs: programsValidation.ok ? programsValidation.value : null,
    items: items.map(itemDto),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  });
});

router.patch("/plans/:id", requireAuth, async (req, res) => {
  // The generated OpenAPI input uses the normalized goal object. Accept
  // persisted/legacy string goals at this boundary, normalize them first,
  // then keep the rest of the request under the generated zod contract.
  const rawPrograms = req.body?.programs;
  const normalizedGoals =
    rawPrograms && typeof rawPrograms === "object" && !Array.isArray(rawPrograms)
      ? normalizeProfessionalGoals((rawPrograms as Record<string, unknown>).professionalGoals)
      : undefined;
  const bodyForSchema =
    typeof normalizedGoals === "string" || normalizedGoals === undefined
      ? req.body
      : {
          ...req.body,
          programs: { ...(rawPrograms as Record<string, unknown>), professionalGoals: normalizedGoals },
        };
  const parsed = UpdatePlanBody.safeParse(bodyForSchema);
  if (
    !parsed.success ||
    (!parsed.data.name && !parsed.data.metadata && !("programs" in req.body))
  ) {
    return res.status(400).json({ error: "Provide a valid plan name, plan settings, or programs." });
  }
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  const updateSet: Record<string, unknown> = {};

  // Validate and persist programs if provided
  if ("programs" in req.body) {
    const programsValidation = validatePrograms(req.body.programs);
    if (!programsValidation.ok) {
      return res.status(400).json({ error: programsValidation.error });
    }
    updateSet.programs = programsValidation.value;
  }

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
      ...(updateSet.programs !== undefined ? { programs: updateSet.programs } : {}),
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
      programs: plan.programs ?? { additionalMajors: [], minors: [], professionalGoals: [] },
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

  // Allow "completed" as a valid plan-item term (not in scheduling TERMS)
  const termValue = body.term as string;
  if (!PLAN_TERMS.has(termValue)) {
    return res.status(400).json({ error: "Invalid term." });
  }

  const isCompletedTerm = termValue === "completed";

  // Validate bucket/completionSource pairing when the bucket API is used.
  if (
    body.bucket !== undefined ||
    (body.completionSource != null && !isCompletedTerm)
  ) {
    const addBucketErr = bucketError(body.bucket, body.completionSource ?? null);
    if (addBucketErr) return res.status(400).json({ error: addBucketErr });
  }

  // "completed" term requires academicYear=0
  if (isCompletedTerm) {
    if (body.academicYear !== COMPLETED_YEAR) {
      return res.status(400).json({
        error: "Items in the 'completed' area must use academicYear=0.",
      });
    }
  } else {
    if (!validAcademicYear(body.academicYear)) {
      return res.status(400).json({ error: "Invalid academic year." });
    }
  }

  // Placeholders are not allowed in the completed area
  if (isCompletedTerm && body.itemType === "requirement_placeholder") {
    return res.status(400).json({
      error: "Requirement placeholders are not allowed in the 'completed' area.",
    });
  }


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

    // Default provenance to "student_asserted" when adding to completed area
    const provenance: string = (body as any).provenance ??
      (isCompletedTerm ? "student_asserted" : "student_asserted");

    values = {
      planId: plan.id,
      itemType: "course",
      courseCode: course.code,
      courseTitle: course.title,
      units: String(course.units),
      academicYear: body.academicYear,
      term: termValue,
      note: body.note ?? null,
      provenance,
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
      term: termValue,
      note: body.note ?? null,
      provenance: (body as any).provenance ?? "student_asserted",
      position: 0,
    };
  }

  values.bucket = body.bucket ?? (isCompletedTerm ? "completed" : "planned");
  values.completionSource =
    values.bucket === "completed"
      ? (body.completionSource ?? (isCompletedTerm ? "manually_marked" : null))
      : null;
  // Canonical completed representation: completed items always live in
  // term="completed" / academicYear=0 with bucket="completed" and a source.
  if (values.bucket === "completed") {
    values.term = "completed";
    values.academicYear = COMPLETED_YEAR;
  }

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

// ---------------------------------------------------------------------------
// Bulk import from progress report
// ---------------------------------------------------------------------------

router.post("/plans/:id/items/bulk-import", requireAuth, async (req, res) => {
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });

  const { courseCodes } = req.body;
  if (!Array.isArray(courseCodes) || courseCodes.length === 0) {
    return res.status(400).json({ error: "Provide at least one course code." });
  }
  if (courseCodes.length > 50) {
    return res.status(400).json({ error: "At most 50 courses can be imported at once." });
  }
  if (courseCodes.some((c: unknown) => typeof c !== "string")) {
    return res.status(400).json({ error: "All course codes must be strings." });
  }

  const normalized: string[] = (courseCodes as string[]).map(normalizeCode);

  const invalidCodes: string[] = [];
  const validCourses: Array<{ code: string; title: string; units: number }> = [];
  for (const code of normalized) {
    const course = findCourse(code);
    if (course) {
      validCourses.push({ code: course.code, title: course.title, units: course.units });
    } else {
      invalidCodes.push(code);
    }
  }
  if (invalidCodes.length > 0) {
    return res.status(400).json({
      error: `Not in the SCU catalog: ${invalidCodes.join(", ")}.`,
    });
  }

  // Find courses already present anywhere in this plan
  const existing = await db
    .select({ courseCode: planItemsTable.courseCode })
    .from(planItemsTable)
    .where(eq(planItemsTable.planId, plan.id));
  const existingCodes = new Set(
    existing.map((e) => e.courseCode?.toUpperCase()).filter(Boolean),
  );

  const toAdd = validCourses.filter((c) => !existingCodes.has(c.code.toUpperCase()));
  const skipped = validCourses
    .filter((c) => existingCodes.has(c.code.toUpperCase()))
    .map((c) => c.code);

  // Determine starting position in the completed bucket
  const [{ maxPos }] = (await db
    .select({
      maxPos: sql<number>`coalesce(max(${planItemsTable.position}), -1)::int`,
    })
    .from(planItemsTable)
    .where(
      and(eq(planItemsTable.planId, plan.id), eq(planItemsTable.bucket, "completed")),
    )) as [{ maxPos: number }];

  const added: PlanItemRow[] = [];
  let nextPosition = maxPos + 1;
  for (const course of toAdd) {
    const [created] = await db
      .insert(planItemsTable)
      .values({
        planId: plan.id,
        itemType: "course",
        courseCode: course.code,
        courseTitle: course.title,
        units: String(course.units),
        academicYear: COMPLETED_YEAR,
        term: "completed",
        bucket: "completed",
        completionSource: "previously_completed_scu",
        provenance: "report_imported",
        position: nextPosition++,
      })
      .returning();
    added.push(created!);
  }

  if (added.length > 0) {
    await touchPlan(plan.id);
  }

  res.status(201).json({ added: added.map(itemDto), skipped });
});

router.patch("/plans/:id/items/:itemId", requireAuth, async (req, res) => {
  const parsed = UpdatePlanItemBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid update." });
  const body = parsed.data;
  const newTermRaw = body.term as string | undefined;
  if (newTermRaw !== undefined && !PLAN_TERMS.has(newTermRaw)) {
    return res.status(400).json({ error: "Invalid term." });
  }
  const movingToCompleted = newTermRaw === "completed";
  const movingFromCompleted = newTermRaw !== undefined && newTermRaw !== "completed";

  if (movingToCompleted) {
    // When moving to "completed", academicYear must be 0
    if (body.academicYear !== undefined && body.academicYear !== COMPLETED_YEAR) {
      return res.status(400).json({
        error: "Items in the 'completed' area must use academicYear=0.",
      });
    }
  } else if (!movingToCompleted && newTermRaw !== undefined) {
    // Moving out of completed or to a regular term
    if (body.academicYear !== undefined && !validAcademicYear(body.academicYear)) {
      return res.status(400).json({ error: "Invalid academic year." });
    }
  } else if (body.academicYear !== undefined) {
    // No term change, just year change
    if (body.academicYear === COMPLETED_YEAR) {
      // Only valid for the completed term
    } else if (!validAcademicYear(body.academicYear)) {
      return res.status(400).json({ error: "Invalid academic year." });
    }
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

  // Prevent moving placeholders into the completed area
  if (movingToCompleted && item.itemType === "requirement_placeholder") {
    return res.status(400).json({
      error: "Requirement placeholders are not allowed in the 'completed' area.",
    });
  }

  // Determine target academicYear: moving to completed → 0
  const targetYear = movingToCompleted
    ? COMPLETED_YEAR
    : (body.academicYear ?? item.academicYear);
  const targetTerm = (body.term as string | undefined) ?? item.term;
  const itemBucket = (item.bucket ?? "planned") as "planned" | "completed";
  const explicitBucket = body.bucket as "planned" | "completed" | undefined;
  const targetBucket =
    explicitBucket ??
    (movingToCompleted ? "completed" : movingFromCompleted ? "planned" : itemBucket);
  let targetSource =
    body.completionSource !== undefined
      ? body.completionSource
      : targetBucket === "completed"
        ? item.completionSource
        : null;
  // Strict pairing validation when the bucket API is used explicitly;
  // term-based moves to the completed area default the source instead.
  if (explicitBucket !== undefined || body.completionSource !== undefined) {
    const moveBucketErr = bucketError(targetBucket, targetSource ?? null);
    if (moveBucketErr) return res.status(400).json({ error: moveBucketErr });
  } else if (targetBucket === "completed" && !targetSource) {
    targetSource = "manually_marked";
  }
  // Canonical completed representation: resolve bucket/term/year atomically.
  let resolvedTerm = targetTerm;
  let resolvedYear = targetYear;
  if (targetBucket === "completed") {
    resolvedTerm = "completed";
    resolvedYear = COMPLETED_YEAR;
  } else if (resolvedTerm === "completed") {
    // Moving out of the completed bucket requires a real destination term.
    return res.status(400).json({
      error: "Specify a destination term and academicYear when moving an item out of the completed area.",
    });
  } else if (!validAcademicYear(resolvedYear)) {
    return res.status(400).json({ error: "Invalid academic year." });
  }
  const bucketChanged = targetBucket !== itemBucket;
  const termChanged =
    !bucketChanged &&
    targetBucket === "planned" &&
    (resolvedYear !== item.academicYear || resolvedTerm !== item.term);
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
      : `planned:${resolvedYear}:${resolvedTerm}`;
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
          patch.academicYear = resolvedYear;
          patch.term = resolvedTerm;
          patch.bucket = targetBucket;
          patch.completionSource =
            targetBucket === "completed" ? targetSource : null;
          if (body.note !== undefined) patch.note = body.note;
          if ((body as any).provenance !== undefined) patch.provenance = (body as any).provenance;
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
    if ((body as any).provenance !== undefined) patch.provenance = (body as any).provenance;
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

/**
 * Server-side mirror of the frontend's placeholder-replacement eligibility
 * check (CourseCard.tsx): a course may only fill a requirement placeholder
 * if it's actually in that requirement's verified course list. Returns null
 * if the requirement can't be resolved at all (e.g. stale/unknown id).
 */
async function getEligibleCoursesForRequirement(
  userId: string,
  plan: AcademicPlanRow,
  requirementId: string,
): Promise<string[] | null> {
  const profileRows = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, userId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) return null;

  const programs = (plan.programs ?? {}) as Partial<PlanPrograms>;
  const metadata = (plan.metadata ?? {}) as { scenarioMajors?: string[]; scenarioMinors?: string[] };
  const scenarioMajors = [...(programs.additionalMajors ?? []), ...(metadata.scenarioMajors ?? [])];
  const scenarioMinors = [...(programs.minors ?? []), ...(metadata.scenarioMinors ?? [])];

  const { groups } = buildRequirementsResponse(
    profile,
    scenarioMajors,
    scenarioMinors,
    programs.professionalGoals ?? [],
  );
  for (const group of groups as Array<{ items: Array<{ id: string; courses: string[] }> }>) {
    const found = group.items.find((i) => i.id === requirementId);
    if (found) return found.courses;
  }
  return null;
}

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
    if (item.requirementId) {
      const eligible = await getEligibleCoursesForRequirement(req.userId!, plan, item.requirementId);
      const eligibleCodes = new Set((eligible ?? []).map((c) => normalizeCode(c)));
      if (eligibleCodes.size === 0) {
        return res.status(400).json({
          error: "CampusVal doesn't have a verified course list for this requirement yet.",
        });
      }
      if (!eligibleCodes.has(course.code)) {
        return res.status(400).json({
          error: `${course.code} doesn't fulfill ${item.requirementLabel ?? "this requirement"}.`,
        });
      }
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
    terms: OFFERED_TERMS.map((metadata) => ({
      ...metadata,
      freshness: scheduleFreshness(metadata),
      term: metadata.term,
      year: metadata.year,
      officialSectionCount: officialCounts.get(`${metadata.term}-${metadata.year}`) ?? 0,
      syncedSectionCount: syncedMap.get(`${metadata.term}-${metadata.year}`) ?? 0,
      offeredCourseCodes: Array.from(
        officialCodes.get(`${metadata.term}-${metadata.year}`) ?? [],
      ).sort(),
    })),
    note: "Quarters not listed here have no official SCU schedule published yet. Course sections, instructors, and times for those terms are unknown — plan with courses and requirement placeholders instead.",
  });
});

export default router;
