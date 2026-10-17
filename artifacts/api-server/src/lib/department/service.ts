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
  departmentCanonicalResourcesTable,
  departmentAuditLogTable,
  departmentRequirementNotesTable,
  departmentRequirementOverridesTable,
  type DepartmentCanonicalResourceRow,
  type DepartmentRequirementNoteRow,
  type DepartmentRequirementOverrideRow,
} from "@workspace/db";
import { findCourse } from "../../data/courses";
import { logger } from "../logger";
import { cleanCourseCodes, cleanText } from "../requirement-customizations";
import { resolveBulletinEdition } from "../requirements-source/editions";
import type { NormalizedGroup } from "../requirements-source/normalize";
import { applyDepartmentLayer, type LayerContext, type LayerResult, type NoteRecord, type OverrideRecord } from "./layer";
import {
  CANONICAL_RESOURCE_PROVENANCE_STATUSES,
  CANONICAL_RESOURCE_PUBLICATION_STATUSES,
  CANONICAL_RESOURCE_REVIEW_STATUSES,
  isCanonicalResourceReady,
} from "./canonical-resources";
import { findProgram, groupKeyOf, listPrograms, programTree, targetBelongsToProgram } from "./programs";

export const NOTE_STATUSES = ["draft", "published", "archived", "unmapped"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];
export const NOTE_KINDS = ["requirement", "sequence", "core_overlap", "advising"] as const;

export const MAX_NOTE_LENGTH = 1200;
export const MAX_NOTE_TITLE = 120;
/** A department course list (a theme's courses, an overlap list) can be long; still bounded. */
export const MAX_NOTE_COURSES = 60;
export const MAX_OVERRIDE_TITLE = 160;
export const MAX_OVERRIDE_DESCRIPTION = 600;
export const MAX_ADDED_COURSES = 12;
export const MAX_RESOURCE_DOCUMENT_TITLE = 240;
export const MAX_RESOURCE_FILE_NAME = 240;
export const MAX_RESOURCE_VERSION = 80;

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
  entity: "note" | "override" | "sample_plan" | "scope" | "canonical_resource";
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
// Canonical department resources
// ---------------------------------------------------------------------------

/**
 * The importer accepts only a registry row that has passed provenance, review,
 * and publication.  Student upload storage is deliberately not represented in
 * this model or accepted by these functions.
 */
export interface NewCanonicalResource {
  programKey: string;
  documentTitle: string;
  sourceFileName: string;
  sourceUrl: string;
  academicYear?: string | null;
  documentVersion?: string | null;
}

export interface CanonicalResourcePatch {
  documentTitle?: string;
  sourceFileName?: string;
  sourceUrl?: string;
  academicYear?: string | null;
  documentVersion?: string | null;
  provenanceStatus?: string;
  reviewStatus?: string;
  publicationStatus?: string;
}

function requiredResourceText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new DepartmentError(400, `${field} is required.`);
  const clean = cleanText(value, maxLength, false);
  if (!clean) throw new DepartmentError(400, `${field} is required.`);
  return clean;
}

function optionalResourceText(value: unknown, field: string, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new DepartmentError(400, `${field} must be text.`);
  return cleanText(value, maxLength, false);
}

function cleanCanonicalSourceFileName(value: unknown): string {
  const name = requiredResourceText(value, "Source file name", MAX_RESOURCE_FILE_NAME);
  if (/[\\/]/.test(name) || !/\.xlsx$/i.test(name)) {
    throw new DepartmentError(400, "Source file name must be the exact .xlsx file name, without a path.");
  }
  return name;
}

function cleanCanonicalSourceUrl(value: unknown): string {
  const raw = requiredResourceText(value, "Source URL", 2_000);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DepartmentError(400, "Source URL must be a valid public HTTPS URL.");
  }
  if (url.protocol !== "https:" || !url.hostname) {
    throw new DepartmentError(400, "Source URL must be a valid public HTTPS URL.");
  }
  return url.toString();
}

function canonicalStatus(
  value: unknown,
  allowed: readonly string[],
  field: "Provenance status" | "Review status" | "Publication status",
): string {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new DepartmentError(400, `${field} is not valid.`);
  }
  return value;
}

function canonicalResourceAudit(row: DepartmentCanonicalResourceRow) {
  return {
    programKey: row.programKey,
    school: row.school,
    documentTitle: row.documentTitle,
    sourceFileName: row.sourceFileName,
    sourceUrl: row.sourceUrl,
    academicYear: row.academicYear,
    documentVersion: row.documentVersion,
    provenanceStatus: row.provenanceStatus,
    reviewStatus: row.reviewStatus,
    publicationStatus: row.publicationStatus,
  };
}

export async function createCanonicalResource(actor: Actor, input: NewCanonicalResource): Promise<DepartmentCanonicalResourceRow> {
  const program = findProgram(input.programKey);
  if (!program) throw new DepartmentError(404, "That program is not in CampusVal.");
  const [row] = await db
    .insert(departmentCanonicalResourcesTable)
    .values({
      programKey: program.programKey,
      programType: program.type,
      school: program.college,
      documentTitle: requiredResourceText(input.documentTitle, "Document title", MAX_RESOURCE_DOCUMENT_TITLE),
      sourceFileName: cleanCanonicalSourceFileName(input.sourceFileName),
      sourceUrl: cleanCanonicalSourceUrl(input.sourceUrl),
      academicYear: optionalResourceText(input.academicYear, "Academic year", MAX_RESOURCE_VERSION),
      documentVersion: optionalResourceText(input.documentVersion, "Document version", MAX_RESOURCE_VERSION),
      // A source starts inert. A super admin must record each decision before
      // the offline importer is allowed to read it.
      provenanceStatus: "documented",
      reviewStatus: "pending",
      publicationStatus: "draft",
      createdBy: actor.email,
      updatedBy: actor.email,
    })
    .returning();
  await recordAudit(actor, {
    programKey: program.programKey,
    entity: "canonical_resource",
    entityId: row!.id,
    action: "create",
    after: canonicalResourceAudit(row!),
  });
  return row!;
}

export async function getCanonicalResource(id: number): Promise<DepartmentCanonicalResourceRow | null> {
  const [row] = await db.select().from(departmentCanonicalResourcesTable).where(eq(departmentCanonicalResourcesTable.id, id)).limit(1);
  return row ?? null;
}

export async function listCanonicalResources(programKey?: string) {
  const query = db.select().from(departmentCanonicalResourcesTable);
  return programKey
    ? query.where(eq(departmentCanonicalResourcesTable.programKey, programKey)).orderBy(asc(departmentCanonicalResourcesTable.id))
    : query.orderBy(asc(departmentCanonicalResourcesTable.programKey), asc(departmentCanonicalResourcesTable.id));
}

export async function updateCanonicalResource(
  actor: Actor,
  existing: DepartmentCanonicalResourceRow,
  patch: CanonicalResourcePatch,
): Promise<DepartmentCanonicalResourceRow> {
  const next: Partial<typeof departmentCanonicalResourcesTable.$inferInsert> = { updatedBy: actor.email };
  if (patch.documentTitle !== undefined) next.documentTitle = requiredResourceText(patch.documentTitle, "Document title", MAX_RESOURCE_DOCUMENT_TITLE);
  if (patch.sourceFileName !== undefined) next.sourceFileName = cleanCanonicalSourceFileName(patch.sourceFileName);
  if (patch.sourceUrl !== undefined) next.sourceUrl = cleanCanonicalSourceUrl(patch.sourceUrl);
  if (patch.academicYear !== undefined) next.academicYear = optionalResourceText(patch.academicYear, "Academic year", MAX_RESOURCE_VERSION);
  if (patch.documentVersion !== undefined) next.documentVersion = optionalResourceText(patch.documentVersion, "Document version", MAX_RESOURCE_VERSION);
  if (patch.provenanceStatus !== undefined) {
    next.provenanceStatus = canonicalStatus(patch.provenanceStatus, CANONICAL_RESOURCE_PROVENANCE_STATUSES, "Provenance status");
  }
  if (patch.reviewStatus !== undefined) {
    next.reviewStatus = canonicalStatus(patch.reviewStatus, CANONICAL_RESOURCE_REVIEW_STATUSES, "Review status");
    next.reviewedBy = actor.email;
    next.reviewedAt = new Date();
  }
  if (patch.publicationStatus !== undefined) {
    next.publicationStatus = canonicalStatus(patch.publicationStatus, CANONICAL_RESOURCE_PUBLICATION_STATUSES, "Publication status");
    if (next.publicationStatus === "published") {
      next.publishedBy = actor.email;
      next.publishedAt = new Date();
    }
  }

  // A reviewed source is identified by its exact file, URL, academic year, and
  // document revision. Changing any of those facts invalidates the previous
  // provenance/review/publication decisions. Reset the gates even if a caller
  // tries to combine a source edit with `publicationStatus: published`; the
  // new source must be re-verified and re-approved in separate actions before
  // linked Department Notes can become visible again.
  const sourceIdentityChanged =
    (next.sourceFileName !== undefined && next.sourceFileName !== existing.sourceFileName) ||
    (next.sourceUrl !== undefined && next.sourceUrl !== existing.sourceUrl) ||
    (next.academicYear !== undefined && next.academicYear !== existing.academicYear) ||
    (next.documentVersion !== undefined && next.documentVersion !== existing.documentVersion);
  if (sourceIdentityChanged) {
    next.provenanceStatus = "documented";
    next.reviewStatus = "pending";
    next.publicationStatus = "draft";
    next.reviewedBy = null;
    next.reviewedAt = null;
    next.publishedBy = null;
    next.publishedAt = null;
  }
  const [row] = await db
    .update(departmentCanonicalResourcesTable)
    .set(next)
    .where(eq(departmentCanonicalResourcesTable.id, existing.id))
    .returning();
  await recordAudit(actor, {
    programKey: existing.programKey,
    entity: "canonical_resource",
    entityId: existing.id,
    action: "update",
    before: canonicalResourceAudit(existing),
    after: canonicalResourceAudit(row!),
  });
  return row!;
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
  title: r.title ?? null,
  courseCodes: r.courseCodes ?? [],
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
    const [noteRows, overrides] = await Promise.all([
      db
        .select({ note: departmentRequirementNotesTable, resource: departmentCanonicalResourcesTable })
        .from(departmentRequirementNotesTable)
        .leftJoin(
          departmentCanonicalResourcesTable,
          eq(departmentRequirementNotesTable.canonicalResourceId, departmentCanonicalResourcesTable.id),
        )
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
    // Legacy/admin notes keep their established behavior. A resource-backed
    // import becomes invisible the moment the source is superseded, rejected,
    // unreviewed, or unpublished; no student upload can satisfy this join.
    const notes = noteRows
      .filter(({ note, resource }) => note.canonicalResourceId === null || (resource !== null && isCanonicalResourceReady(resource)))
      .map(({ note }) => note);
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

/** An optional one-line heading. Plain text, like the body. */
export function cleanNoteTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new DepartmentError(400, "The note title must be text.");
  return cleanText(value, MAX_NOTE_TITLE, false);
}

/**
 * The catalog courses a note refers to. Every code must be a CampusVal catalog
 * course (named in the error when it is not), duplicates are dropped and the
 * department's order is kept. Nothing is guessed or substituted.
 */
export function cleanNoteCourses(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new DepartmentError(400, "Course references must be a list of course codes.");
  const out: string[] = [];
  const unknown: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const code = raw.trim().toUpperCase().replace(/\s+/g, " ");
    if (!code) continue;
    if (!isCatalogCode(code)) unknown.push(code);
    else if (!out.includes(code)) out.push(code);
  }
  if (unknown.length > 0) {
    throw new DepartmentError(400, `Not in the CampusVal course catalog: ${unknown.slice(0, 10).join(", ")}.`);
  }
  if (out.length > MAX_NOTE_COURSES) throw new DepartmentError(400, `A note can list at most ${MAX_NOTE_COURSES} courses.`);
  return out;
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
  title?: string | null;
  courseCodes?: string[] | null;
  kind?: string | null;
  status?: "draft" | "published";
  edition?: string | null;
}

export async function createNote(actor: Actor, input: NewNote): Promise<DepartmentRequirementNoteRow> {
  const program = assertNoteTarget(input.programKey, input.targetKey);
  const body = cleanNoteBody(input.body);
  const title = cleanNoteTitle(input.title);
  const courseCodes = cleanNoteCourses(input.courseCodes);
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
      title,
      courseCodes,
      noteKind: kind,
      status,
      origin: "admin",
      sourceType: "admin_entry",
      sourceLabel: `${program.title} department`,
      // This is a real Department Admin source, not a legacy/imported record
      // whose provenance still needs review.  The explicit value keeps the
      // admin provenance inspector honest after migration 0010.
      provenanceStatus: "department_admin",
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
    after: { body, title, courseCodes, status, kind },
  });
  return row!;
}

export async function getNote(id: number): Promise<DepartmentRequirementNoteRow | null> {
  const [row] = await db.select().from(departmentRequirementNotesTable).where(eq(departmentRequirementNotesTable.id, id)).limit(1);
  return row ?? null;
}

export interface NotePatch {
  body?: string;
  title?: string | null;
  courseCodes?: string[] | null;
  kind?: string | null;
  status?: "draft" | "published" | "archived";
  /** Anchor an unmapped (or any) note to a requirement of its program. */
  targetKey?: string | null;
}

export async function updateNote(actor: Actor, existing: DepartmentRequirementNoteRow, patch: NotePatch) {
  const before = {
    body: existing.body,
    title: existing.title,
    courseCodes: existing.courseCodes,
    status: existing.status,
    kind: existing.noteKind,
    targetKey: existing.targetKey,
  };
  const next: Partial<typeof departmentRequirementNotesTable.$inferInsert> = { updatedBy: actor.email };
  if (patch.body !== undefined) next.body = cleanNoteBody(patch.body);
  if (patch.title !== undefined) next.title = cleanNoteTitle(patch.title);
  if (patch.courseCodes !== undefined) next.courseCodes = cleanNoteCourses(patch.courseCodes);
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
    after: {
      body: row!.body,
      title: row!.title,
      courseCodes: row!.courseCodes,
      status: row!.status,
      kind: row!.noteKind,
      targetKey: row!.targetKey,
    },
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
