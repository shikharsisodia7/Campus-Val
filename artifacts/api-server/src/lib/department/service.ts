/**
 * Storage and rules for the department layer: Department Notes, global
 * overrides, and the audit trail. Callers (routes/department-admin.ts) have
 * already established WHO is acting and which programs that person may
 * maintain (lib/department/authz.ts); everything here still re-checks that a
 * target really belongs to the program it is filed under, so a spoofed program
 * or requirement key cannot reach another department's tree.
 *
 * Nothing here writes Bulletin data. Deleting an override row, or archiving a
 * note, restores what the Bulletin says.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  departmentAuditLogTable,
  departmentRequirementNotesTable,
  departmentRequirementOverridesTable,
  type DepartmentRequirementNoteRow,
  type DepartmentRequirementOverrideRow,
} from "@workspace/db";
import { findCourse } from "../../data/courses";
import { logger } from "../logger";
import { cleanCourseCodes, cleanText } from "../requirement-customizations";
import { resolveBulletinEdition } from "../requirements-source/editions";
import type { NormalizedGroup } from "../requirements-source/normalize";
import { applyDepartmentLayer, type LayerContext, type LayerResult, type NoteRecord, type OverrideRecord } from "./layer";
import { findProgram, groupKeyOf, listPrograms, programTree, targetBelongsToProgram } from "./programs";

export const NOTE_STATUSES = ["draft", "published", "archived", "unmapped"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];
export const NOTE_KINDS = ["requirement", "sequence", "core_overlap", "advising"] as const;

export const MAX_NOTE_LENGTH = 1200;
export const MAX_OVERRIDE_TITLE = 160;
export const MAX_OVERRIDE_DESCRIPTION = 600;
export const MAX_ADDED_COURSES = 12;

/** A refusal with the HTTP status the route should send. */
export class DepartmentError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "DepartmentError";
  }
}

export function isMissingDepartmentTable(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let e: any = error; e && !seen.has(e); e = e.cause) {
    seen.add(e);
    if (e.code === "42P01") return true;
  }
  return false;
}

export interface Actor {
  email: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditEntry {
  programKey: string;
  entity: "note" | "override" | "sample_plan" | "scope";
  entityId?: string | number | null;
  action: string;
  targetKey?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function recordAudit(actor: Actor, entry: AuditEntry): Promise<void> {
  await db.insert(departmentAuditLogTable).values({
    actorEmail: actor.email,
    actorUserId: actor.userId,
    programKey: entry.programKey,
    entity: entry.entity,
    entityId: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
    action: entry.action,
    targetKey: entry.targetKey ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
  // Non-sensitive: who did what to which program. Never the note text, never a student.
  logger.info(
    { event: "department_change", entity: entry.entity, action: entry.action, programKey: entry.programKey },
    "department change recorded",
  );
}

export async function listAudit(programKey: string, limit = 100) {
  return db
    .select()
    .from(departmentAuditLogTable)
    .where(eq(departmentAuditLogTable.programKey, programKey))
    .orderBy(desc(departmentAuditLogTable.at), desc(departmentAuditLogTable.id))
    .limit(Math.min(Math.max(limit, 1), 500));
}

// ---------------------------------------------------------------------------
// Rows -> layer
// ---------------------------------------------------------------------------

const asNoteRecord = (r: DepartmentRequirementNoteRow): NoteRecord => ({
  id: r.id,
  programKey: r.programKey,
  targetKey: r.targetKey,
  bulletinEdition: r.bulletinEdition,
  body: r.body,
  noteKind: r.noteKind,
  status: r.status,
  origin: r.origin,
  sourceLabel: r.sourceLabel,
  sourceUrl: r.sourceUrl,
  sourceReference: r.sourceReference,
  reviewedBy: r.reviewedBy,
  updatedAt: r.updatedAt,
});

const asOverrideRecord = (r: DepartmentRequirementOverrideRow): OverrideRecord => ({
  id: r.id,
  programKey: r.programKey,
  bulletinEdition: r.bulletinEdition,
  entryType: r.entryType,
  targetKey: r.targetKey,
  groupKey: r.groupKey,
  title: r.title,
  description: r.description,
  hidden: r.hidden,
  courseCodes: r.courseCodes,
  minimumCourses: r.minimumCourses,
  position: r.position,
  baseFingerprint: r.baseFingerprint,
  baseTitle: r.baseTitle,
  baseSourceVersion: r.baseSourceVersion,
  updatedAt: r.updatedAt,
});

const programTitles = (): Map<string, string> =>
  new Map(listPrograms().map((p) => [p.programKey, p.title] as const));

/**
 * Applies the department layer to a plan's Bulletin tree. If the migration that
 * creates the tables has not been applied the Bulletin tree comes back
 * unchanged (the sidebar must keep loading); any other error propagates.
 */
export async function applyDepartmentLayerToTree(
  tree: NormalizedGroup[],
  edition: string | null,
  state: { completed: ReadonlySet<string>; planned: ReadonlySet<string> },
): Promise<LayerResult> {
  if (!edition) return { tree, applied: { notes: 0, overridden: 0, hidden: 0, added: 0 } };
  const present = tree.map((g) => g.stableKey);
  try {
    const [notes, overrides] = await Promise.all([
      db
        .select()
        .from(departmentRequirementNotesTable)
        .where(
          and(
            eq(departmentRequirementNotesTable.bulletinEdition, edition),
            eq(departmentRequirementNotesTable.status, "published"),
            inArray(departmentRequirementNotesTable.programKey, present),
          ),
        ),
      db
        .select()
        .from(departmentRequirementOverridesTable)
        .where(
          and(
            eq(departmentRequirementOverridesTable.bulletinEdition, edition),
            inArray(departmentRequirementOverridesTable.programKey, present),
          ),
        ),
    ]);
    const ctx: LayerContext = { edition, programTitles: programTitles(), completed: state.completed, planned: state.planned };
    return applyDepartmentLayer(tree, notes.map(asNoteRecord), overrides.map(asOverrideRecord), ctx);
  } catch (error) {
    if (!isMissingDepartmentTable(error)) throw error;
    logger.error({ event: "department_tables_missing" }, "department tables are missing: apply database migration 0006");
    return { tree, applied: { notes: 0, overridden: 0, hidden: 0, added: 0 } };
  }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function cleanNoteBody(value: unknown): string {
  const text = typeof value === "string" ? cleanText(value, MAX_NOTE_LENGTH, true) : null;
  if (!text) throw new DepartmentError(400, `Enter the note (1–${MAX_NOTE_LENGTH} characters).`);
  return text;
}

function resolveEditionOrThrow(requested?: string | null): string {
  try {
    return resolveBulletinEdition(requested ?? null).edition.id;
  } catch {
    throw new DepartmentError(400, "That Bulletin edition is not loaded in CampusVal.");
  }
}

/** A note's program must exist and its target must be in that program's tree (or be absent: a program-level note). */
function assertNoteTarget(programKey: string, targetKey: string | null) {
  const program = findProgram(programKey);
  if (!program) throw new DepartmentError(404, "That program is not in CampusVal.");
  if (targetKey === null) return program;
  const tree = programTree(programKey)!;
  if (!targetBelongsToProgram(tree, targetKey)) {
    throw new DepartmentError(400, "That requirement is not part of this program's sidebar.");
  }
  return program;
}

export interface NewNote {
  programKey: string;
  targetKey: string | null;
  body: string;
  kind?: string | null;
  status?: "draft" | "published";
  edition?: string | null;
}

export async function createNote(actor: Actor, input: NewNote): Promise<DepartmentRequirementNoteRow> {
  const program = assertNoteTarget(input.programKey, input.targetKey);
  const body = cleanNoteBody(input.body);
  const edition = resolveEditionOrThrow(input.edition);
  const status = input.status === "published" ? "published" : "draft";
  const kind = input.kind && (NOTE_KINDS as readonly string[]).includes(input.kind) ? input.kind : null;
  const [row] = await db
    .insert(departmentRequirementNotesTable)
    .values({
      programKey: input.programKey,
      programType: program.type,
      targetKey: input.targetKey,
      bulletinEdition: edition,
      body,
      noteKind: kind,
      status,
      origin: "admin",
      sourceType: "admin_entry",
      sourceLabel: `${program.title} department`,
      reviewedBy: status === "published" ? actor.email : null,
      reviewedAt: status === "published" ? new Date() : null,
      createdBy: actor.email,
      updatedBy: actor.email,
    })
    .returning();
  await recordAudit(actor, {
    programKey: input.programKey,
    entity: "note",
    entityId: row!.id,
    action: status === "published" ? "create_published" : "create",
    targetKey: input.targetKey,
    before: null,
    after: { body, status, kind },
  });
  return row!;
}

export async function getNote(id: number): Promise<DepartmentRequirementNoteRow | null> {
  const [row] = await db.select().from(departmentRequirementNotesTable).where(eq(departmentRequirementNotesTable.id, id)).limit(1);
  return row ?? null;
}

export interface NotePatch {
  body?: string;
  kind?: string | null;
  status?: "draft" | "published" | "archived";
  /** Anchor an unmapped (or any) note to a requirement of its program. */
  targetKey?: string | null;
}

export async function updateNote(actor: Actor, existing: DepartmentRequirementNoteRow, patch: NotePatch) {
  const before = { body: existing.body, status: existing.status, kind: existing.noteKind, targetKey: existing.targetKey };
  const next: Partial<typeof departmentRequirementNotesTable.$inferInsert> = { updatedBy: actor.email };
  if (patch.body !== undefined) next.body = cleanNoteBody(patch.body);
  if (patch.kind !== undefined) {
    next.noteKind = patch.kind && (NOTE_KINDS as readonly string[]).includes(patch.kind) ? patch.kind : null;
  }
  const nextTarget = patch.targetKey !== undefined ? patch.targetKey : existing.targetKey;
  if (patch.targetKey !== undefined) {
    assertNoteTarget(existing.programKey, patch.targetKey);
    next.targetKey = patch.targetKey;
  }
  if (patch.status !== undefined) {
    if (patch.status === "published" && existing.status === "unmapped" && nextTarget === null && existing.sourceAnchorText) {
      // An imported note whose anchor was never resolved stays unpublished until someone maps it.
      throw new DepartmentError(409, "Map this note to a requirement before publishing it.");
    }
    next.status = patch.status;
    if (patch.status === "published") {
      next.reviewedBy = actor.email;
      next.reviewedAt = new Date();
    }
  } else if (existing.status === "unmapped" && patch.targetKey) {
    // Mapped by a person: it becomes a draft they can review and publish.
    next.status = "draft";
  }
  const [row] = await db
    .update(departmentRequirementNotesTable)
    .set(next)
    .where(eq(departmentRequirementNotesTable.id, existing.id))
    .returning();
  await recordAudit(actor, {
    programKey: existing.programKey,
    entity: "note",
    entityId: existing.id,
    action: patch.status && patch.status !== existing.status ? patch.status : "update",
    targetKey: nextTarget,
    before,
    after: { body: row!.body, status: row!.status, kind: row!.noteKind, targetKey: row!.targetKey },
  });
  return row!;
}

export async function listNotesForProgram(programKey: string, edition: string) {
  return db
    .select()
    .from(departmentRequirementNotesTable)
    .where(and(eq(departmentRequirementNotesTable.programKey, programKey), eq(departmentRequirementNotesTable.bulletinEdition, edition)))
    .orderBy(asc(departmentRequirementNotesTable.id));
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

const isCatalogCode = (code: string) => !!findCourse(code);

export interface OverrideInput {
  /** The Bulletin requirement to override ("edit"), or the group to add a requirement to ("added"). */
  targetKey: string;
  title?: string | null;
  description?: string | null;
  hidden?: boolean;
  edition?: string | null;
}

export interface NewAddedRequirement {
  groupKey: string;
  title: string;
  description?: string | null;
  courseCodes?: string[];
  minimumCourses?: number | null;
  edition?: string | null;
}

/** The program a Bulletin requirement belongs to: its group. Core/school items belong to the Core/school group. */
export function overrideProgramKey(targetKey: string): string {
  return groupKeyOf(targetKey);
}

function bulletinTreeContaining(groupKey: string) {
  const program = findProgram(groupKey);
  if (program) return programTree(groupKey);
  // A shared group (University Core, school, university): any program tree of that school has it.
  for (const p of listPrograms()) {
    const tree = programTree(p.programKey);
    if (tree?.tree.some((g) => g.stableKey === groupKey)) return tree;
  }
  return null;
}

export async function saveOverride(actor: Actor, input: OverrideInput): Promise<DepartmentRequirementOverrideRow | null> {
  const programKey = overrideProgramKey(input.targetKey);
  const tree = bulletinTreeContaining(programKey);
  const group = tree?.tree.find((g) => g.stableKey === programKey);
  const entry = group?.items.find((i) => i.stableKey === input.targetKey);
  if (!tree || !group || !entry) throw new DepartmentError(404, "That requirement is not in the Bulletin data.");
  const edition = resolveEditionOrThrow(input.edition);

  const [existing] = await db
    .select()
    .from(departmentRequirementOverridesTable)
    .where(and(eq(departmentRequirementOverridesTable.bulletinEdition, edition), eq(departmentRequirementOverridesTable.targetKey, input.targetKey)))
    .limit(1);

  let title = input.title === undefined ? (existing?.title ?? null) : cleanText(input.title, MAX_OVERRIDE_TITLE, false);
  if (title !== null && title === entry.item.label) title = null; // typing the Bulletin's own wording back is not an override
  let description =
    input.description === undefined ? (existing?.description ?? null) : cleanText(input.description, MAX_OVERRIDE_DESCRIPTION, true);
  if (description !== null && description === entry.item.description) description = null;
  const hidden = input.hidden === undefined ? (existing?.hidden ?? false) : input.hidden;

  if (title === null && description === null && !hidden) {
    // Nothing left to override: that is a reset.
    if (existing) await resetOverride(actor, existing);
    return null;
  }
  const values = {
    programKey,
    bulletinEdition: edition,
    entryType: "edit",
    targetKey: input.targetKey,
    title,
    description,
    hidden,
    baseFingerprint: entry.fingerprint,
    baseTitle: entry.item.label,
    baseSourceVersion: group.provenance.sourceVersion,
    updatedBy: actor.email,
  };
  const [row] = await db
    .insert(departmentRequirementOverridesTable)
    .values({ ...values, createdBy: actor.email })
    .onConflictDoUpdate({
      target: [departmentRequirementOverridesTable.bulletinEdition, departmentRequirementOverridesTable.targetKey],
      set: values,
    })
    .returning();
  await recordAudit(actor, {
    programKey,
    entity: "override",
    entityId: row!.id,
    action: existing ? "update" : "create",
    targetKey: input.targetKey,
    // The effective value before is the Bulletin's own when there was no override.
    before: existing
      ? { title: existing.title, description: existing.description, hidden: existing.hidden }
      : { title: entry.item.label, description: entry.item.description, hidden: false },
    after: { title, description, hidden },
  });
  return row!;
}

export async function addRequirement(actor: Actor, input: NewAddedRequirement): Promise<DepartmentRequirementOverrideRow> {
  const tree = bulletinTreeContaining(input.groupKey);
  if (!tree?.tree.some((g) => g.stableKey === input.groupKey)) throw new DepartmentError(404, "That group is not in the Bulletin data.");
  const title = cleanText(input.title, MAX_OVERRIDE_TITLE, false);
  if (!title) throw new DepartmentError(400, `Enter a title for the requirement (1–${MAX_OVERRIDE_TITLE} characters).`);
  const codes = cleanCourseCodes(input.courseCodes ?? [], isCatalogCode);
  if (!codes || codes.length > MAX_ADDED_COURSES) {
    throw new DepartmentError(400, `Courses must be in the SCU catalog (at most ${MAX_ADDED_COURSES}).`);
  }
  const minimum = input.minimumCourses ?? null;
  if (minimum !== null && (!Number.isInteger(minimum) || minimum < 1 || minimum > Math.max(codes.length, 1))) {
    throw new DepartmentError(400, "The number of courses required must be between 1 and the number listed.");
  }
  const edition = resolveEditionOrThrow(input.edition);
  const existingInGroup = await db
    .select({ position: departmentRequirementOverridesTable.position })
    .from(departmentRequirementOverridesTable)
    .where(
      and(
        eq(departmentRequirementOverridesTable.bulletinEdition, edition),
        eq(departmentRequirementOverridesTable.groupKey, input.groupKey),
        eq(departmentRequirementOverridesTable.entryType, "added"),
      ),
    );
  const position = existingInGroup.reduce((m, r) => Math.max(m, r.position), -1) + 1;
  const targetKey = `${input.groupKey}#dept:${randomUUID()}`;
  const [row] = await db
    .insert(departmentRequirementOverridesTable)
    .values({
      programKey: input.groupKey,
      bulletinEdition: edition,
      entryType: "added",
      targetKey,
      groupKey: input.groupKey,
      title,
      description: cleanText(input.description ?? null, MAX_OVERRIDE_DESCRIPTION, true),
      courseCodes: codes,
      minimumCourses: minimum,
      position,
      createdBy: actor.email,
      updatedBy: actor.email,
    })
    .returning();
  await recordAudit(actor, {
    programKey: input.groupKey,
    entity: "override",
    entityId: row!.id,
    action: "add_requirement",
    targetKey,
    before: null,
    after: { title, courseCodes: codes, minimumCourses: minimum },
  });
  return row!;
}

export async function getOverride(id: number) {
  const [row] = await db.select().from(departmentRequirementOverridesTable).where(eq(departmentRequirementOverridesTable.id, id)).limit(1);
  return row ?? null;
}

/** "Reset to Bulletin": removes the override; the Bulletin requirement is exactly as imported. */
export async function resetOverride(actor: Actor, row: DepartmentRequirementOverrideRow): Promise<void> {
  await db.delete(departmentRequirementOverridesTable).where(eq(departmentRequirementOverridesTable.id, row.id));
  await recordAudit(actor, {
    programKey: row.programKey,
    entity: "override",
    entityId: row.id,
    action: row.entryType === "added" ? "remove_requirement" : "reset",
    targetKey: row.targetKey,
    before: { title: row.title, description: row.description, hidden: row.hidden, courseCodes: row.courseCodes },
    after: null,
  });
}

export async function listOverridesForProgram(programKey: string, edition: string) {
  return db
    .select()
    .from(departmentRequirementOverridesTable)
    .where(and(eq(departmentRequirementOverridesTable.programKey, programKey), eq(departmentRequirementOverridesTable.bulletinEdition, edition)))
    .orderBy(asc(departmentRequirementOverridesTable.id));
}
