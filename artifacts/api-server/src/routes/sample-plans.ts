/**
 * Sample plans. Students browse published templates by school and program,
 * preview one, and load it into a NEW Tentative Degree Plan (the default) or
 * add it to a plan they own. Nothing here overwrites a plan, and a loaded plan
 * is an independent copy (see lib/sample-plans/service.ts).
 *
 * Department administrators publish and unpublish the templates of the
 * programs they are scoped to; a template with no program is super-admin only.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, samplePlansTable, studentProfilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { isAdminUser } from "../lib/admin";
import { canManageProgram, normalizeEmail, requireDepartmentAccess } from "../lib/department/authz";
import { DepartmentError, isMissingDepartmentTable } from "../lib/department/service";
import {
  SCHOOL_NAME,
  SCHOOL_ORDER,
  getSamplePlan,
  generatedPlanRNDEnabled,
  isPublicSamplePlan,
  listGeneratedForRND,
  listForAdmin,
  listPublished,
  loadSamplePlan,
  previewOf,
  samplePlanSummary,
  setSamplePlanStatus,
} from "../lib/sample-plans/service";
import { ownedPlan, planDto } from "./plans";

const router: IRouter = Router();

function fail(res: Response, error: unknown) {
  if (error instanceof DepartmentError) return res.status(error.status).json({ error: error.message });
  if (isMissingDepartmentTable(error)) {
    logger.error({ event: "sample_plan_tables_missing" }, "sample plan tables are missing: apply database migration 0006");
    return res.status(503).json({ error: "Sample plans aren't available yet." });
  }
  throw error;
}

/** Fail closed and avoid advertising an internal R&D surface to pilot users. */
function requireGeneratedPlanRND(req: Request, res: Response): boolean {
  if (generatedPlanRNDEnabled() && req.userEmail && isAdminUser(req.userEmail)) return true;
  res.status(404).json({ error: "Sample plan not found." });
  return false;
}

router.get("/sample-plans", requireAuth, async (_req, res) => {
  try {
    const rows = await listPublished();
    const schools = SCHOOL_ORDER.map((code) => ({
      code,
      name: SCHOOL_NAME[code]!,
      programs: [...new Set(rows.filter((r) => r.school === code).map((r) => r.program))]
        .sort()
        .map((program) => ({
          program,
          plans: rows.filter((r) => r.school === code && r.program === program).map(samplePlanSummary),
        })),
    })).filter((s) => s.programs.length > 0);
    res.json({ schools });
  } catch (error) {
    return fail(res, error);
  }
});

async function publishedPlan(req: Request, res: Response) {
  const found = await getSamplePlan(Number(req.params.id));
  if (!found || !isPublicSamplePlan(found.plan)) {
    res.status(404).json({ error: "Sample plan not found." });
    return null;
  }
  return found;
}

router.get("/sample-plans/:id", requireAuth, async (req, res) => {
  try {
    const found = await publishedPlan(req, res);
    if (found) res.json(previewOf(found.plan, found.items));
  } catch (error) {
    return fail(res, error);
  }
});

const LoadBody = z.object({
  mode: z.enum(["new_tentative", "add_to_plan"]).default("new_tentative"),
  name: z.string().max(80).optional(),
  startYear: z.number().int().min(2000).max(2100).optional(),
  targetPlanId: z.number().int().positive().optional(),
  confirmDegreePlan: z.boolean().optional(),
});

router.post("/sample-plans/:id/load", requireAuth, async (req, res) => {
  const parsed = LoadBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request." });
  try {
    const found = await publishedPlan(req, res);
    if (!found) return;
    const [profile] = await db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, req.userId!)).limit(1);
    const startYear = parsed.data.startYear ?? profile?.currentYear ?? new Date().getFullYear();
    const targetPlan = parsed.data.mode === "add_to_plan" ? await ownedPlan(parsed.data.targetPlanId ?? 0, req.userId!) : null;
    const result = await loadSamplePlan(found.plan, found.items, {
      userId: req.userId!,
      mode: parsed.data.mode,
      name: parsed.data.name,
      startYear,
      targetPlan,
      confirmDegreePlan: parsed.data.confirmDegreePlan,
    });
    res.status(201).json({
      plan: planDto(result.plan, result.added),
      added: result.added,
      skippedDuplicates: result.skippedDuplicates,
      warnings: result.warnings,
      loadedAsPlaceholders: result.asPlaceholders,
    });
  } catch (error) {
    return fail(res, error);
  }
});

// --- administration -------------------------------------------------------

/**
 * Private, feature-flagged inventory for deterministic CampusVal-generated
 * sequence research. There is intentionally no student-facing route or UI
 * action that can load one of these templates.
 */
router.get("/admin/rnd/generated-sample-plans", requireAuth, async (req, res) => {
  if (!requireGeneratedPlanRND(req, res)) return;
  try {
    const rows = await listGeneratedForRND();
    res.json({ plans: rows.map(samplePlanSummary) });
  } catch (error) {
    return fail(res, error);
  }
});

router.get("/admin/department/sample-plans", requireAuth, requireDepartmentAccess, async (req, res) => {
  const scopes = req.adminScopes!;
  try {
    // The normal department-admin inventory remains source-backed. Generated
    // records are inspectable only from the explicit R&D endpoint above.
    const rows = (await listForAdmin(scopes.superAdmin ? null : [...scopes.programKeys])).filter(
      (row) => row.sourceType === "official_department" || row.sourceType === "admin_entry",
    );
    res.json({ plans: rows.map((r) => ({ ...samplePlanSummary(r), importWarnings: r.importWarnings })) });
  } catch (error) {
    return fail(res, error);
  }
});

const AdminPatch = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(600).nullable().optional(),
});

router.patch("/admin/department/sample-plans/:id", requireAuth, requireDepartmentAccess, async (req, res) => {
  const parsed = AdminPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid sample plan change." });
  try {
    const [plan] = await db.select().from(samplePlansTable).where(eq(samplePlansTable.id, Number(req.params.id))).limit(1);
    if (!plan) return res.status(404).json({ error: "Sample plan not found." });
    if (plan.sourceType === "campusval_generated" && !requireGeneratedPlanRND(req, res)) return;
    const scopes = req.adminScopes!;
    // A template with no program of its own is a school-wide resource: super admins only.
    const allowed = plan.programKey ? canManageProgram(scopes, plan.programKey) : scopes.superAdmin;
    if (!allowed) return res.status(403).json({ error: "You are not an administrator of that program." });
    const row = await setSamplePlanStatus({ email: normalizeEmail(req.userEmail!), userId: req.userId! }, plan, parsed.data);
    res.json(samplePlanSummary(row));
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
