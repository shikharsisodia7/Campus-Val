/**
 * Sample plans: published planning templates a student loads into a NEW
 * Tentative Degree Plan (default) or adds to a plan they pick.
 *
 * A loaded plan is an independent copy. The only link back is provenance
 * (metadata.sampleSource: which template and version it came from). Editing the
 * template, publishing a new version, or archiving it never touches a plan that
 * was already loaded. Loading never removes anything from a plan.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import {
  academicPlansTable,
  db,
  planItemsTable,
  samplePlanItemsTable,
  samplePlansTable,
  type AcademicPlanRow,
  type SamplePlanItemRow,
  type SamplePlanRow,
} from "@workspace/db";
import { findCourse } from "../../data/courses";
import { cleanText } from "../requirement-customizations";
import { DepartmentError, recordAudit, type Actor } from "../department/service";
import { findProgram } from "../department/programs";
import {
  SAMPLE_PLAN_LENGTHS,
  normalizeCourseCode,
  validateSampleItems,
  type SampleItemInput,
  type SampleWarning,
} from "./validate";

export const SCHOOL_NAME: Record<string, string> = {
  CAS: "College of Arts and Sciences",
  LSB: "Leavey School of Business",
  SOE: "School of Engineering",
};
export const SCHOOL_ORDER = ["CAS", "LSB", "SOE"];

const toInput = (r: SamplePlanItemRow): SampleItemInput => ({
  year: r.year,
  term: r.term,
  itemType: r.itemType === "course" ? "course" : "placeholder",
  courseCode: r.courseCode,
  label: r.label,
  sourceTitle: r.sourceTitle,
  note: r.note,
});

export function samplePlanSummary(r: SamplePlanRow) {
  return {
    id: r.id,
    slug: r.slug,
    version: r.version,
    school: r.school,
    schoolName: SCHOOL_NAME[r.school] ?? r.school,
    program: r.program,
    programKey: r.programKey,
    title: r.title,
    description: r.description,
    planLength: r.planLength,
    /** official_department | admin_entry | campusval_generated (an example CampusVal built from the major's requirements, not an SCU plan). */
    sourceType: r.sourceType,
    academicYear: r.academicYear,
    sourceLabel: r.sourceLabel,
    sourceUrl: r.sourceUrl,
    sourceReference: r.sourceReference,
    status: r.status,
  };
}

/**
 * Whether a template can be presented to a normal pilot student.  Generated
 * examples stay in the controlled admin/R&D inventory, but publication alone
 * never turns them into an SCU-approved recommendation.
 */
export function isPublicSamplePlan(row: Pick<SamplePlanRow, "status" | "sourceType">): boolean {
  return (
    row.status === "published" &&
    (row.sourceType === "official_department" || row.sourceType === "admin_entry")
  );
}

/**
 * A generated sequence is R&D material, never a pilot recommendation. This
 * deliberately defaults false: production has to opt in explicitly before a
 * privileged developer can inspect the private inventory.
 */
export function generatedPlanRNDEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["ENABLE_GENERATED_PLAN_RND"]?.trim().toLowerCase() === "true";
}

/** Source-backed published plans, newest version first within a program. */
export async function listPublished() {
  const rows = await db.select().from(samplePlansTable).where(eq(samplePlansTable.status, "published")).orderBy(asc(samplePlansTable.program), asc(samplePlansTable.title));
  return rows.filter(isPublicSamplePlan).sort((a, b) => b.version.localeCompare(a.version));
}

export async function getSamplePlan(id: number) {
  const [plan] = await db.select().from(samplePlansTable).where(eq(samplePlansTable.id, id)).limit(1);
  if (!plan) return null;
  const items = await db
    .select()
    .from(samplePlanItemsTable)
    .where(eq(samplePlanItemsTable.samplePlanId, id))
    // Year, then quarter order, then position: ordering by position alone interleaved the quarters.
    .orderBy(
      asc(samplePlanItemsTable.year),
      asc(sql`case ${samplePlanItemsTable.term} when 'fall' then 0 when 'winter' then 1 when 'spring' then 2 else 3 end`),
      asc(samplePlanItemsTable.position),
      asc(samplePlanItemsTable.id),
    );
  return { plan, items };
}

/** The preview: items resolved against the catalog right now, with live warnings. */
export function previewOf(plan: SamplePlanRow, items: SamplePlanItemRow[]) {
  const warnings = validateSampleItems(items.map(toInput));
  return {
    ...samplePlanSummary(plan),
    warnings,
    terms: items.reduce<Record<string, unknown[]>>((acc, r) => {
      const key = `${r.year}:${r.term}`;
      const course = r.itemType === "course" && r.courseCode ? findCourse(r.courseCode) : undefined;
      (acc[key] ??= []).push({
        kind: course ? "course" : "placeholder",
        courseCode: r.courseCode,
        title: course?.title ?? null,
        units: course?.units ?? null,
        label: course ? null : (r.label ?? r.courseCode),
        note: r.note,
      });
      return acc;
    }, {}),
  };
}

export interface LoadOptions {
  userId: string;
  mode: "new_tentative" | "add_to_plan";
  name?: string;
  startYear: number;
  /** add_to_plan only. */
  targetPlan?: AcademicPlanRow | null;
  confirmDegreePlan?: boolean;
}

export interface LoadResult {
  plan: AcademicPlanRow;
  added: number;
  skippedDuplicates: string[];
  warnings: SampleWarning[];
  asPlaceholders: string[];
}

export async function loadSamplePlan(plan: SamplePlanRow, items: SamplePlanItemRow[], opts: LoadOptions): Promise<LoadResult> {
  const warnings = validateSampleItems(items.map(toInput));
  const sampleSource = {
    samplePlanId: plan.id,
    slug: plan.slug,
    version: plan.version,
    title: plan.title,
    sourceLabel: plan.sourceLabel,
    sourceUrl: plan.sourceUrl,
    loadedAt: new Date().toISOString(),
  };

  let target: AcademicPlanRow;
  if (opts.mode === "add_to_plan") {
    if (!opts.targetPlan) throw new DepartmentError(404, "Plan not found.");
    if (opts.targetPlan.planType === "degree" && !opts.confirmDegreePlan) {
      throw new DepartmentError(409, "Adding a sample plan to your Degree Plan needs your confirmation.");
    }
    target = opts.targetPlan;
  } else {
    const program = plan.programKey ? findProgram(plan.programKey) : null;
    const name = cleanText(opts.name ?? `${plan.program} — ${plan.title}`, 80, false) ?? "Tentative Degree Plan";
    const [created] = await db
      .insert(academicPlansTable)
      .values({
        userId: opts.userId,
        name,
        planType: "tentative",
        metadata: { sampleSource },
        // The plan is about this program; the student's profile and APR are untouched.
        programs: {
          additionalMajors: [],
          minors: [],
          professionalGoals: [],
          ...(program?.type === "major" ? { primaryMajor: program.code } : {}),
        },
      } as typeof academicPlansTable.$inferInsert)
      .returning();
    target = created!;
  }

  const existing = await db
    .select({ courseCode: planItemsTable.courseCode })
    .from(planItemsTable)
    .where(eq(planItemsTable.planId, target.id));
  const have = new Set(existing.map((e) => e.courseCode?.toUpperCase()).filter(Boolean));

  const skipped: string[] = [];
  const asPlaceholders: string[] = [];
  const positions = new Map<string, number>();
  const rows: (typeof planItemsTable.$inferInsert)[] = [];
  for (const r of items) {
    if (!["fall", "winter", "spring", "summer"].includes(r.term) || r.year < 1 || r.year > 8) continue; // flagged in warnings
    const code = r.courseCode ? normalizeCourseCode(r.courseCode) : null;
    const course = r.itemType === "course" && code ? findCourse(code) : undefined;
    if (course && have.has(course.code.toUpperCase())) {
      skipped.push(course.code);
      continue;
    }
    const academicYear = opts.startYear + (r.year - 1);
    const key = `${academicYear}:${r.term}`;
    const position = positions.get(key) ?? 0;
    positions.set(key, position + 1);
    const base = { planId: target.id, academicYear, term: r.term, bucket: "planned", position, provenance: "sample_plan", note: r.note ?? null };
    if (course) {
      have.add(course.code.toUpperCase());
      rows.push({ ...base, itemType: "course", courseCode: course.code, courseTitle: course.title, units: String(course.units) });
    } else {
      const label = r.label?.trim() || (code ? `${code} (not in the CampusVal catalog)` : "");
      if (!label) continue;
      if (code) asPlaceholders.push(code);
      rows.push({ ...base, itemType: "requirement_placeholder", requirementCategory: "Sample plan", requirementLabel: label });
    }
  }
  if (rows.length > 0) await db.insert(planItemsTable).values(rows);
  if (opts.mode === "add_to_plan") {
    await db.update(academicPlansTable).set({ metadata: { ...(target.metadata ?? {}), sampleSource } }).where(eq(academicPlansTable.id, target.id));
  }
  const [fresh] = await db.select().from(academicPlansTable).where(eq(academicPlansTable.id, target.id)).limit(1);
  return { plan: fresh!, added: rows.length, skippedDuplicates: skipped, warnings, asPlaceholders };
}

// ---------------------------------------------------------------------------
// Import (idempotent) and administration
// ---------------------------------------------------------------------------

export interface SamplePlanImport {
  slug: string;
  version: string;
  school: "CAS" | "LSB" | "SOE";
  program: string;
  programKey?: string | null;
  title: string;
  description?: string | null;
  planLength: (typeof SAMPLE_PLAN_LENGTHS)[number];
  academicYear?: string | null;
  sourceType: "official_department" | "admin_entry" | "campusval_generated";
  sourceLabel: string;
  sourceUrl?: string | null;
  sourceReference?: string | null;
  items: SampleItemInput[];
}

/**
 * Inserts or refreshes a template. A template that is already PUBLISHED and
 * differs is refused: a change is a new version, so students' sources stay
 * truthful. Returns what happened.
 */
export async function importSamplePlan(actor: Actor, input: SamplePlanImport, opts: { publish: boolean }) {
  if (!(SAMPLE_PLAN_LENGTHS as readonly string[]).includes(input.planLength)) throw new DepartmentError(400, "Unknown plan length.");
  const warnings = validateSampleItems(input.items);
  const [existing] = await db
    .select()
    .from(samplePlansTable)
    .where(and(eq(samplePlansTable.slug, input.slug), eq(samplePlansTable.version, input.version)))
    .limit(1);
  const fingerprint = (items: SampleItemInput[]) =>
    // Order-insensitive within the plan: a source lists a grid row by row, the database stores it quarter by quarter.
    JSON.stringify(items.map((i) => JSON.stringify([i.year, i.term, i.itemType, i.courseCode ? normalizeCourseCode(i.courseCode) : null, i.label ?? null])).sort());
  if (existing) {
    const current = await getSamplePlan(existing.id);
    const same = fingerprint(current!.items.map(toInput)) === fingerprint(input.items);
    if (existing.status === "published" && !same) {
      throw new DepartmentError(409, `${input.slug} ${input.version} is published and differs: publish the change as a new version.`);
    }
    if (same) return { id: existing.id, outcome: "unchanged" as const, warnings };
  }
  const values = {
    slug: input.slug,
    version: input.version,
    school: input.school,
    program: input.program,
    programKey: input.programKey ?? null,
    title: input.title,
    description: input.description ?? null,
    planLength: input.planLength,
    academicYear: input.academicYear ?? null,
    sourceType: input.sourceType,
    sourceLabel: input.sourceLabel,
    sourceUrl: input.sourceUrl ?? null,
    sourceReference: input.sourceReference ?? null,
    status: opts.publish ? "published" : "draft",
    importWarnings: warnings.map((w) => w.message),
    updatedBy: actor.email,
  };
  const [row] = existing
    ? await db.update(samplePlansTable).set(values).where(eq(samplePlansTable.id, existing.id)).returning()
    : await db.insert(samplePlansTable).values({ ...values, createdBy: actor.email }).returning();
  if (existing) await db.delete(samplePlanItemsTable).where(eq(samplePlanItemsTable.samplePlanId, row!.id));
  const positions = new Map<string, number>();
  if (input.items.length > 0) {
    await db.insert(samplePlanItemsTable).values(
      input.items.map((i) => {
        const key = `${i.year}:${i.term}`;
        const position = positions.get(key) ?? 0;
        positions.set(key, position + 1);
        return {
          samplePlanId: row!.id,
          year: i.year,
          term: i.term,
          position,
          itemType: i.itemType,
          courseCode: i.courseCode ? normalizeCourseCode(i.courseCode) : null,
          label: i.label ?? null,
          sourceTitle: i.sourceTitle ?? null,
          note: i.note ?? null,
        };
      }),
    );
  }
  await recordAudit(actor, {
    programKey: input.programKey ?? `sample-plans:${input.school.toLowerCase()}`,
    entity: "sample_plan",
    entityId: row!.id,
    action: "import",
    after: { slug: input.slug, version: input.version, items: input.items.length, warnings: warnings.length },
  });
  return { id: row!.id, outcome: existing ? ("updated" as const) : ("created" as const), warnings };
}

export async function setSamplePlanStatus(
  actor: Actor,
  plan: SamplePlanRow,
  patch: { status?: "draft" | "published" | "archived"; title?: string; description?: string | null },
) {
  const next: Partial<typeof samplePlansTable.$inferInsert> = { updatedBy: actor.email };
  if (patch.status) next.status = patch.status;
  if (patch.title !== undefined) {
    const title = cleanText(patch.title, 160, false);
    if (!title) throw new DepartmentError(400, "Enter a title.");
    next.title = title;
  }
  if (patch.description !== undefined) next.description = cleanText(patch.description, 600, true);
  const [row] = await db.update(samplePlansTable).set(next).where(eq(samplePlansTable.id, plan.id)).returning();
  await recordAudit(actor, {
    programKey: plan.programKey ?? `sample-plans:${plan.school.toLowerCase()}`,
    entity: "sample_plan",
    entityId: plan.id,
    action: patch.status === "published" ? "publish" : patch.status === "archived" || patch.status === "draft" ? "unpublish" : "update",
    before: { status: plan.status, title: plan.title },
    after: { status: row!.status, title: row!.title },
  });
  return row!;
}

export async function listForAdmin(programKeys: readonly string[] | null) {
  const rows = await db.select().from(samplePlansTable).orderBy(asc(samplePlansTable.program), asc(samplePlansTable.title));
  return programKeys === null ? rows : rows.filter((r) => r.programKey && programKeys.includes(r.programKey));
}

/** Private inventory for the R&D endpoint only; it never feeds the public picker. */
export async function listGeneratedForRND() {
  return (await db.select().from(samplePlansTable).where(eq(samplePlansTable.sourceType, "campusval_generated")).orderBy(asc(samplePlansTable.program), asc(samplePlansTable.title)));
}

