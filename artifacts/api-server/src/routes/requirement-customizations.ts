/**
 * The requirements sidebar for one plan, and the student's PLAN-SCOPED planning
 * customizations of it.
 *
 * Everything here is an overlay. A student can rename or annotate a source
 * requirement, hide it from their own view of this plan, or add a requirement
 * of their own. None of that changes a source requirement, the APR or a Degree
 * Checksheet, and none of it changes what counts as complete: the overlay only
 * touches labels, notes and visibility (see lib/requirements-source/overlay.ts).
 *
 * Authorization: every route requires sign-in, derives the user from that
 * sign-in (never from the request), and loads the plan only if that user owns
 * it; otherwise 404. Advisor shares are read-only and do not reach these
 * routes: nobody but the plan owner can read or change a plan's customizations.
 */
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  requirementCustomizationsTable,
  studentProfilesTable,
  type AcademicPlanRow,
  type RequirementCustomizationRow,
  type StudentProfileRow,
} from "@workspace/db";
import {
  CreateCustomRequirementBody,
  ResolveRequirementSourceChangeBody,
  ResetRequirementEditsQueryParams,
  SaveRequirementEditBody,
  UpdateCustomRequirementBody,
} from "@workspace/api-zod";
import { existingOwnDocumentIds, findOwnDocumentTitle } from "../lib/checksheets/note-source";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  MAX_CUSTOM_REQUIREMENTS_PER_PLAN,
  MAX_SOURCE_EDITS_PER_PLAN,
  cleanCourseCodes,
  cleanText,
  isMissingCustomizationTable,
  deleteCustomizations,
  listCustomizations,
} from "../lib/requirement-customizations";
import {
  REQUIREMENT_SOURCE_LABEL,
  POLICY_DECIDED,
  buildNormalizedRequirements,
  composeRequirementOverlay,
  type NormalizedGroup,
  type RequirementSourceType,
  type RequirementsRequest,
  type StoredCustomization,
} from "../lib/requirements-source";
import { findCourse } from "../data/courses";
import { applyDepartmentLayerToTree } from "../lib/department/service";
import { itemsOf, ownedPlan, validatePrograms } from "./plans";

const isCatalogCode = (code: string) => !!findCourse(code);

const router: IRouter = Router();

/** What the sidebar tells a student about where its requirements come from. */
const PUBLIC_SOURCE_LABEL: Record<RequirementSourceType, string> = {
  current_bulletin:
    "Requirement data loaded in CampusVal from SCU Bulletin sources, last verified by CampusVal on the date shown for each group. Confirm against the Bulletin, your department and Workday.",
  cohort_bulletin: REQUIREMENT_SOURCE_LABEL.cohort_bulletin,
  degree_checksheet: REQUIREMENT_SOURCE_LABEL.degree_checksheet,
  apr: REQUIREMENT_SOURCE_LABEL.apr,
  composite: REQUIREMENT_SOURCE_LABEL.composite,
};

interface PlanContext {
  plan: AcademicPlanRow;
  profile: StudentProfileRow;
  built: ReturnType<typeof buildNormalizedRequirements>;
  rows: RequirementCustomizationRow[];
  /** True until migration 0005 is applied: reads work, without customizations. */
  unavailable: boolean;
}

/** The same request the client used to assemble from the plan by hand. */
export function requirementsRequestForPlan(
  profile: StudentProfileRow,
  plan: AcademicPlanRow,
  items: { itemType: string; courseCode: string | null }[],
): RequirementsRequest {
  const validated = validatePrograms(plan.programs);
  const programs = validated.ok ? validated.value : { additionalMajors: [], minors: [], professionalGoals: [], primaryMajor: null };
  const metadata = plan.metadata ?? {};
  const plannedCourses = Array.from(
    new Set(items.filter((i) => i.itemType === "course" && i.courseCode).map((i) => i.courseCode!.toUpperCase())),
  );
  return {
    profile,
    scenarioMajors: [...(programs.additionalMajors ?? []), ...(metadata.scenarioMajors ?? [])].slice(0, 10),
    scenarioMinors: [...(programs.minors ?? []), ...(metadata.scenarioMinors ?? [])].slice(0, 10),
    professionalGoals: (programs.professionalGoals ?? [])
      .filter((goal): goal is Exclude<typeof goal, string> => typeof goal !== "string")
      .slice(0, 8),
    plannedCourses,
    primaryMajor: programs.primaryMajor ?? null,
    context: { planId: plan.id },
  };
}

/** Loads the plan (owner only), the profile and the plan's requirements. Sends the error itself. */
async function loadContext(req: Request, res: Response): Promise<PlanContext | null> {
  const userId = req.userId!;
  const plan = await ownedPlan(Number(req.params.id), userId);
  if (!plan) {
    res.status(404).json({ error: "Plan not found." });
    return null;
  }
  const [profile] = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, userId))
    .limit(1);
  if (!profile) {
    res.status(404).json({ error: "Complete onboarding first." });
    return null;
  }
  let built: PlanContext["built"];
  try {
    const items = await itemsOf(plan.id);
    const request = requirementsRequestForPlan(profile, plan, items);
    built = buildNormalizedRequirements(request);
    // Bulletin tree + the department's published notes and global overrides. The
    // student's own edits are composed on top of this by the routes below.
    const norm = (c: string) => c.trim().toUpperCase().replace(/\s+/g, " ");
    const completed = new Set((profile.completedCourseCodes ?? []).map(norm));
    const planned = new Set(request.plannedCourses.map(norm).filter((c) => !completed.has(c)));
    const layered = await applyDepartmentLayerToTree(built.tree, built.edition, { completed, planned });
    built = { ...built, tree: layered.tree as typeof built.tree };
  } catch (error) {
    // The plan is untouched. Do not fall back to a different source.
    logger.error({ event: "requirements_generation_failed", planId: plan.id, err: error instanceof Error ? error.message : String(error) }, "requirements generation failed");
    res.status(503).json({ error: "Requirements could not be loaded right now. Your plan and customizations are unchanged." });
    return null;
  }
  try {
    return { plan, profile, built, rows: await listCustomizations(plan.id), unavailable: false };
  } catch (error) {
    if (!isMissingCustomizationTable(error)) throw error;
    logger.error({ event: "requirement_customizations_table_missing" }, "requirement_customizations is missing: apply database migration 0005");
    return { plan, profile, built, rows: [], unavailable: true };
  }
}

const UNAVAILABLE = { error: "Requirement edits aren't available yet. Your plan is unchanged." };

const asStored = (rows: RequirementCustomizationRow[]): StoredCustomization[] =>
  rows.map((r) => ({
    entryType: r.entryType as StoredCustomization["entryType"],
    targetKey: r.targetKey,
    groupKey: r.groupKey,
    title: r.title,
    note: r.note,
    hidden: r.hidden,
    done: r.done,
    courseCodes: r.courseCodes,
    position: r.position,
    baseFingerprint: r.baseFingerprint,
    baseTitle: r.baseTitle,
    baseSourceVersion: r.baseSourceVersion,
    baseSourceType: r.baseSourceType,
    noteSourceType: r.noteSourceType,
    noteSourceDocumentId: r.noteSourceDocumentId,
    noteSourceLabel: r.noteSourceLabel,
    noteSourceAnchor: r.noteSourceAnchor,
    updatedAt: r.updatedAt,
  }));

/**
 * A note transferred from a Degree Checksheet records WHICH document, never its content. The
 * document must be the signed-in student's own (another student's id is refused, not trusted),
 * and its label is read from the document, not from the request. Null when there is no source.
 */
type NoteSourceFields = Pick<
  typeof requirementCustomizationsTable.$inferInsert,
  "noteSourceType" | "noteSourceDocumentId" | "noteSourceLabel" | "noteSourceAnchor"
>;
const NO_NOTE_SOURCE: NoteSourceFields = { noteSourceType: null, noteSourceDocumentId: null, noteSourceLabel: null, noteSourceAnchor: null };

async function resolveNoteSource(
  userId: string,
  source: { type: "DEGREE_CHECKSHEET"; documentId: number; anchor?: string | null },
): Promise<NoteSourceFields | null> {
  const doc = await findOwnDocumentTitle(userId, source.documentId);
  if (!doc) return null;
  return {
    noteSourceType: "DEGREE_CHECKSHEET",
    noteSourceDocumentId: doc.id,
    noteSourceLabel: cleanText(doc.title, 160, false) ?? "Degree Checksheet",
    noteSourceAnchor: cleanText(source.anchor ?? null, 120, false),
  };
}

/** Which of the rows' source documents still exist for this student. */
async function availableDocumentIds(userId: string, rows: RequirementCustomizationRow[]): Promise<Set<number>> {
  const ids = [...new Set(rows.map((r) => r.noteSourceDocumentId).filter((id): id is number => id != null))];
  return existingOwnDocumentIds(userId, ids);
}

async function summaryFor(ctx: PlanContext) {
  const rows = await listCustomizations(ctx.plan.id);
  return composeRequirementOverlay(ctx.built.tree, asStored(rows)).summary;
}

function findItem(tree: NormalizedGroup[], sourceKey: string) {
  for (const group of tree) {
    const entry = group.items.find((i) => i.stableKey === sourceKey);
    if (entry) return { group, entry };
  }
  return null;
}

const baseOf = (found: NonNullable<ReturnType<typeof findItem>>, provider: RequirementSourceType) => ({
  baseFingerprint: found.entry.fingerprint,
  baseTitle: found.entry.item.label,
  baseSourceVersion: found.group.provenance.sourceVersion,
  baseSourceType: provider,
});

// ---------------------------------------------------------------------------

router.get("/plans/:id/requirements", requireAuth, async (req, res) => {
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  const { groups, orphaned, summary } = composeRequirementOverlay(ctx.built.tree, asStored(ctx.rows), await availableDocumentIds(req.userId!, ctx.rows));
  if (summary.sourceChanged > 0 || summary.orphaned > 0) {
    logger.warn(
      { event: "requirement_customization_needs_review", provider: ctx.built.provider, sourceChanged: summary.sourceChanged, orphaned: summary.orphaned },
      "student customizations no longer match the source",
    );
  }
  res.json({
    ...ctx.built.response,
    groups,
    requirementsSource: { label: PUBLIC_SOURCE_LABEL[ctx.built.provider], policyDecided: POLICY_DECIDED, edition: ctx.built.edition },
    customizations: { summary, orphaned },
  });
});

router.put("/plans/:id/requirement-customizations", requireAuth, async (req, res) => {
  const parsed = SaveRequirementEditBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid requirement edit." });
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  if (ctx.unavailable) return res.status(503).json(UNAVAILABLE);
  const { sourceKey, title, note, hidden, noteSource } = parsed.data;
  const found = findItem(ctx.built.tree, sourceKey);
  if (!found) return res.status(404).json({ error: "That requirement is not in this plan's sidebar." });

  const existing = ctx.rows.find((r) => r.entryType === "source_edit" && r.targetKey === sourceKey);
  let nextTitle = title === undefined ? (existing?.title ?? null) : cleanText(title, 160, false);
  // Typing the source's own label back is not an edit.
  if (nextTitle !== null && nextTitle === found.entry.item.label) nextTitle = null;
  const nextNote = note === undefined ? (existing?.note ?? null) : cleanText(note, 600, true);
  const nextHidden = hidden === undefined ? (existing?.hidden ?? false) : hidden;
  let sourceFields: Partial<NoteSourceFields> = {};
  if (noteSource) {
    const resolved = await resolveNoteSource(req.userId!, noteSource);
    if (!resolved) return res.status(400).json({ error: "That Degree Checksheet could not be found." });
    sourceFields = resolved;
  }
  // No note, no source: clearing the note clears where it came from.
  if (nextNote === null) sourceFields = NO_NOTE_SOURCE;

  if (nextTitle === null && nextNote === null && !nextHidden) {
    if (existing) await deleteCustomizations(ctx.plan.id, [existing.id]);
    return res.json(await summaryFor(ctx));
  }
  if (!existing) {
    const edits = ctx.rows.filter((r) => r.entryType === "source_edit").length;
    if (edits >= MAX_SOURCE_EDITS_PER_PLAN) {
      return res.status(400).json({ error: `A plan can carry at most ${MAX_SOURCE_EDITS_PER_PLAN} requirement edits. Reset some first.` });
    }
  }
  // Saving re-bases onto the source as it reads now: the student has just seen it.
  const values = {
    title: nextTitle,
    note: nextNote,
    hidden: nextHidden,
    ...baseOf(found, ctx.built.provider),
    ...sourceFields,
    updatedBy: req.userId!,
  };
  // One atomic upsert: two first edits of the same requirement (two tabs) cannot collide.
  await db
    .insert(requirementCustomizationsTable)
    .values({
      planId: ctx.plan.id,
      userId: req.userId!,
      entryType: "source_edit",
      targetKey: sourceKey,
      ...values,
    })
    .onConflictDoUpdate({
      target: [
        requirementCustomizationsTable.planId,
        requirementCustomizationsTable.entryType,
        requirementCustomizationsTable.targetKey,
      ],
      set: values,
    });
  res.json(await summaryFor(ctx));
});

router.delete("/plans/:id/requirement-customizations", requireAuth, async (req, res) => {
  const query = ResetRequirementEditsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid request." });
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const { sourceKey, all } = query.data;
  if (all) {
    await deleteCustomizations(plan.id);
  } else if (sourceKey) {
    await db
      .delete(requirementCustomizationsTable)
      .where(
        and(
          eq(requirementCustomizationsTable.planId, plan.id),
          eq(requirementCustomizationsTable.entryType, "source_edit"),
          eq(requirementCustomizationsTable.targetKey, sourceKey),
        ),
      );
  } else {
    return res.status(400).json({ error: "Say which requirement to reset, or reset all." });
  }
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  res.json(await summaryFor(ctx));
});

router.post("/plans/:id/requirement-customizations/resolve", requireAuth, async (req, res) => {
  const parsed = ResolveRequirementSourceChangeBody.safeParse(req.body);
  if (!parsed.success || (!parsed.data.all && !parsed.data.sourceKey)) {
    return res.status(400).json({ error: "Say which requirement to resolve, or resolve all." });
  }
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  if (ctx.unavailable) return res.status(503).json(UNAVAILABLE);
  const { sourceKey, all, action } = parsed.data;
  const { groups } = composeRequirementOverlay(ctx.built.tree, asStored(ctx.rows));
  const stale = new Set(
    groups.flatMap((g) => g.items.filter((i) => i.customization?.sourceChanged).map((i) => i.stableKey)),
  );
  const targets = ctx.rows.filter(
    (r) => r.entryType === "source_edit" && (all ? stale.has(r.targetKey) : r.targetKey === sourceKey),
  );
  if (!all && targets.length === 0) return res.status(404).json({ error: "No edit to resolve for that requirement." });

  if (action === "use_source") {
    await deleteCustomizations(ctx.plan.id, targets.map((r) => r.id));
  } else {
    for (const row of targets) {
      const found = findItem(ctx.built.tree, row.targetKey);
      if (!found) continue; // the requirement is gone: it stays listed as unmatched, to be removed
      await db
        .update(requirementCustomizationsTable)
        .set({ ...baseOf(found, ctx.built.provider), updatedBy: req.userId! })
        .where(eq(requirementCustomizationsTable.id, row.id));
    }
  }
  res.json(await summaryFor(ctx));
});

router.post("/plans/:id/custom-requirements", requireAuth, async (req, res) => {
  const parsed = CreateCustomRequirementBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a title for the requirement (1–160 characters)." });
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  if (ctx.unavailable) return res.status(503).json(UNAVAILABLE);
  const { groupKey, title, note, courseCodes, noteSource } = parsed.data;
  if (!ctx.built.tree.some((g) => g.stableKey === groupKey)) {
    return res.status(404).json({ error: "That group is not in this plan's sidebar." });
  }
  const cleanTitle = cleanText(title, 160, false);
  if (!cleanTitle) return res.status(400).json({ error: "Enter a title for the requirement." });
  if (ctx.rows.filter((r) => r.entryType === "custom").length >= MAX_CUSTOM_REQUIREMENTS_PER_PLAN) {
    return res.status(400).json({ error: `A plan can carry at most ${MAX_CUSTOM_REQUIREMENTS_PER_PLAN} custom requirements.` });
  }
  const codes = cleanCourseCodes(courseCodes, isCatalogCode);
  if (!codes) return res.status(400).json({ error: "Courses must be in the SCU catalog (at most 8)." });
  let customSource: NoteSourceFields = NO_NOTE_SOURCE;
  if (noteSource) {
    const resolved = await resolveNoteSource(req.userId!, noteSource);
    if (!resolved) return res.status(400).json({ error: "That Degree Checksheet could not be found." });
    customSource = resolved;
  }
  const customNote = cleanText(note ?? null, 600, true);
  const inGroup = ctx.rows.filter((r) => r.entryType === "custom" && r.groupKey === groupKey);
  await db.insert(requirementCustomizationsTable).values({
    planId: ctx.plan.id,
    userId: req.userId!,
    entryType: "custom",
    targetKey: randomUUID(),
    groupKey,
    courseCodes: codes,
    position: inGroup.reduce((m, r) => Math.max(m, r.position), -1) + 1,
    title: cleanTitle,
    note: customNote,
    ...(customNote ? customSource : NO_NOTE_SOURCE),
    updatedBy: req.userId!,
  });
  res.status(201).json(await summaryFor(ctx));
});

async function findCustom(planId: number, customId: string) {
  const [row] = await db
    .select()
    .from(requirementCustomizationsTable)
    .where(
      and(
        eq(requirementCustomizationsTable.planId, planId),
        eq(requirementCustomizationsTable.entryType, "custom"),
        eq(requirementCustomizationsTable.targetKey, customId),
      ),
    )
    .limit(1);
  return row ?? null;
}

router.patch("/plans/:id/custom-requirements/:customId", requireAuth, async (req, res) => {
  const parsed = UpdateCustomRequirementBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid edit." });
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  if (ctx.unavailable) return res.status(503).json(UNAVAILABLE);
  const row = await findCustom(ctx.plan.id, String(req.params.customId));
  if (!row) return res.status(404).json({ error: "Custom requirement not found." });
  const { title, note, done, courseCodes, move } = parsed.data;
  const nextTitle = title === undefined ? row.title : cleanText(title, 160, false);
  if (!nextTitle) return res.status(400).json({ error: "A custom requirement needs a title." });
  const codes = courseCodes === undefined ? row.courseCodes : cleanCourseCodes(courseCodes, isCatalogCode);
  if (!codes) return res.status(400).json({ error: "Courses must be in the SCU catalog (at most 8)." });
  if (move) {
    // Reorder within the group: renumber 0..n-1, then swap with the neighbour.
    const siblings = ctx.rows
      .filter((r) => r.entryType === "custom" && r.groupKey === row.groupKey)
      .sort((a, b) => a.position - b.position || a.id - b.id);
    const i = siblings.findIndex((r) => r.id === row.id);
    const j = move === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < siblings.length) [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
    for (const [pos, r] of siblings.entries()) {
      if (r.position !== pos) await db.update(requirementCustomizationsTable).set({ position: pos }).where(eq(requirementCustomizationsTable.id, r.id));
    }
  }
  await db
    .update(requirementCustomizationsTable)
    .set({
      title: nextTitle,
      note: note === undefined ? row.note : cleanText(note, 600, true),
      done: done ?? row.done,
      courseCodes: codes,
      updatedBy: req.userId!,
    })
    .where(eq(requirementCustomizationsTable.id, row.id));
  res.json(await summaryFor(ctx));
});

router.delete("/plans/:id/custom-requirements/:customId", requireAuth, async (req, res) => {
  const plan = await ownedPlan(Number(req.params.id), req.userId!);
  if (!plan) return res.status(404).json({ error: "Plan not found." });
  const row = await findCustom(plan.id, String(req.params.customId));
  if (!row) return res.status(404).json({ error: "Custom requirement not found." });
  await deleteCustomizations(plan.id, [row.id]);
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  res.json(await summaryFor(ctx));
});

// A missing table on a route that writes or resets is "not available yet", not a 500.
router.use((error: unknown, _req: Request, res: Response, next: (e?: unknown) => void) => {
  if (isMissingCustomizationTable(error)) {
    logger.error({ event: "requirement_customizations_table_missing" }, "requirement_customizations is missing: apply database migration 0005");
    return res.status(503).json(UNAVAILABLE);
  }
  next(error);
});

export default router;
