/**
 * Program Requirements Admin: what a department may maintain.
 *
 * A department administrator can, for the programs they are scoped to:
 *   - write, edit, publish and archive Department Notes;
 *   - retitle or hide a Bulletin requirement in the planning view, add a
 *     requirement the Bulletin does not list, and reset any of it to the Bulletin;
 *   - publish or unpublish the program's Sample Plans.
 *
 * Everything is an OVERLAY on the Bulletin data (lib/department/layer.ts): no
 * handler here writes Bulletin data, and every global change is recorded in
 * department_audit_log.
 *
 * AUTHORIZATION is decided on the server on every request (lib/department/
 * authz.ts): requireAuth sets the verified email, requireDepartmentAccess keeps
 * students out, and each handler checks the specific program with
 * canManageProgram. The program a note or override belongs to is derived from
 * the requirement's own stable key where the data says so, and a note's program
 * is re-validated against the program's tree, so a spoofed program or
 * requirement id reaches nothing.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { db, programAdminScopesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  DEPARTMENT_ADMIN_ROLE,
  canManageProgram,
  normalizeEmail,
  requireDepartmentAccess,
  requireSuperAdmin,
  type AdminScopes,
} from "../lib/department/authz";
import { findProgram, listPrograms, programTree } from "../lib/department/programs";
import {
  DepartmentError,
  addRequirement,
  createCanonicalResource,
  createNote,
  getCanonicalResource,
  getNote,
  getOverride,
  isMissingDepartmentTable,
  listAudit,
  listCanonicalResources,
  listNotesForProgram,
  listOverridesForProgram,
  overrideProgramKey,
  recordAudit,
  resetOverride,
  saveOverride,
  updateNote,
  updateCanonicalResource,
  type Actor,
} from "../lib/department/service";
import { resolveBulletinEdition } from "../lib/requirements-source/editions";

const router: IRouter = Router();

const actorOf = (req: Request): Actor => ({ email: normalizeEmail(req.userEmail!), userId: req.userId! });
const scopesOf = (req: Request): AdminScopes => req.adminScopes!;

/** Turns a DepartmentError / unavailable table into the HTTP answer; anything else is a real 500. */
function fail(res: Response, error: unknown) {
  if (error instanceof DepartmentError) return res.status(error.status).json({ error: error.message });
  if (isMissingDepartmentTable(error)) {
    logger.error({ event: "department_tables_missing" }, "department tables are missing: apply database migration 0006");
    return res.status(503).json({ error: "Department administration isn't available yet." });
  }
  throw error;
}

const programKeyParam = (value: unknown): string => (typeof value === "string" ? value : "");

function scopedProgram(req: Request, res: Response, programKey: string) {
  // Scope first: a department admin gets the same 403 for another department's program and for
  // a key that does not exist, so the answer reveals nothing about programs outside their scope.
  if (!canManageProgram(scopesOf(req), programKey)) {
    res.status(403).json({ error: "You are not an administrator of that program." });
    return null;
  }
  const program = findProgram(programKey);
  if (!program) {
    res.status(404).json({ error: "That program is not in CampusVal." });
    return null;
  }
  return program;
}

// ---------------------------------------------------------------------------
// Who am I, which programs
// ---------------------------------------------------------------------------

router.get("/admin/department/me", requireAuth, requireDepartmentAccess, (req, res) => {
  const scopes = scopesOf(req);
  res.json({
    role: DEPARTMENT_ADMIN_ROLE,
    superAdmin: scopes.superAdmin,
    programKeys: scopes.superAdmin ? null : [...scopes.programKeys].sort(),
    edition: resolveBulletinEdition(null).edition.id,
  });
});

router.get("/admin/department/programs", requireAuth, requireDepartmentAccess, (req, res) => {
  const scopes = scopesOf(req);
  // Only programs within the person's scope: another department's program is not even listed.
  res.json({ programs: listPrograms().filter((p) => canManageProgram(scopes, p.programKey)) });
});

// ---------------------------------------------------------------------------
// Canonical department resources
// ---------------------------------------------------------------------------

const CanonicalResourceCreate = z.object({
  programKey: z.string().min(1).max(160),
  documentTitle: z.string().min(1).max(400),
  sourceFileName: z.string().min(1).max(400),
  sourceUrl: z.string().min(1).max(2_500),
  academicYear: z.string().max(160).nullable().optional(),
  documentVersion: z.string().max(160).nullable().optional(),
});
const CanonicalResourcePatch = z
  .object({
    documentTitle: z.string().min(1).max(400).optional(),
    sourceFileName: z.string().min(1).max(400).optional(),
    sourceUrl: z.string().min(1).max(2_500).optional(),
    academicYear: z.string().max(160).nullable().optional(),
    documentVersion: z.string().max(160).nullable().optional(),
    provenanceStatus: z.enum(["documented", "verified", "superseded", "rejected"]).optional(),
    reviewStatus: z.enum(["pending", "approved", "rejected"]).optional(),
    publicationStatus: z.enum(["draft", "published", "archived"]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Enter a resource change.");

const canonicalResourceDto = (row: NonNullable<Awaited<ReturnType<typeof getCanonicalResource>>>) => ({
  id: row.id,
  programKey: row.programKey,
  programType: row.programType,
  school: row.school,
  documentTitle: row.documentTitle,
  sourceFileName: row.sourceFileName,
  sourceUrl: row.sourceUrl,
  academicYear: row.academicYear,
  documentVersion: row.documentVersion,
  provenanceStatus: row.provenanceStatus,
  reviewStatus: row.reviewStatus,
  publicationStatus: row.publicationStatus,
  reviewedBy: row.reviewedBy,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  publishedBy: row.publishedBy,
  publishedAt: row.publishedAt?.toISOString() ?? null,
  updatedBy: row.updatedBy,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Department admins can inspect provenance for their own programs. Only a
 * super admin can register, verify, approve, publish, or archive a canonical
 * source, preventing a scoped user from turning an arbitrary upload into a
 * global source.
 */
router.get("/admin/department/canonical-resources", requireAuth, requireDepartmentAccess, async (req, res) => {
  const requestedProgram = typeof req.query.programKey === "string" ? req.query.programKey : undefined;
  if (requestedProgram && !canManageProgram(scopesOf(req), requestedProgram)) {
    return res.status(403).json({ error: "You are not an administrator of that program." });
  }
  try {
    const rows = await listCanonicalResources(requestedProgram);
    const scopes = scopesOf(req);
    res.json({
      resources: rows
        .filter((row) => scopes.superAdmin || scopes.programKeys.has(row.programKey))
        .map(canonicalResourceDto),
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/admin/department/canonical-resources", requireAuth, requireSuperAdmin, async (req, res) => {
  const parsed = CanonicalResourceCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the program and canonical document details." });
  try {
    const row = await createCanonicalResource(actorOf(req), parsed.data);
    res.status(201).json(canonicalResourceDto(row));
  } catch (error) {
    return fail(res, error);
  }
});

router.patch("/admin/department/canonical-resources/:id", requireAuth, requireSuperAdmin, async (req, res) => {
  const parsed = CanonicalResourcePatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid canonical resource change." });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ error: "Canonical resource not found." });
  try {
    const existing = await getCanonicalResource(id);
    if (!existing) return res.status(404).json({ error: "Canonical resource not found." });
    const row = await updateCanonicalResource(actorOf(req), existing, parsed.data);
    res.json(canonicalResourceDto(row));
  } catch (error) {
    return fail(res, error);
  }
});

// ---------------------------------------------------------------------------
// One program: the Bulletin tree, with its notes and overrides
// ---------------------------------------------------------------------------

router.get("/admin/department/programs/:programKey", requireAuth, requireDepartmentAccess, async (req, res) => {
  const programKey = programKeyParam(req.params.programKey);
  const program = scopedProgram(req, res, programKey);
  if (!program) return;
  const tree = programTree(programKey)!;
  const scopes = scopesOf(req);
  try {
    const edition = resolveBulletinEdition(typeof req.query.edition === "string" ? req.query.edition : null).edition;
    const [notes, ownOverrides] = await Promise.all([
      listNotesForProgram(programKey, edition.id),
      listOverridesForProgram(programKey, edition.id),
    ]);
    // Overrides of the shared groups (Core, school, university) are listed too, read-only for a department.
    const sharedOverrides = (
      await Promise.all(tree.tree.filter((g) => g.stableKey !== programKey).map((g) => listOverridesForProgram(g.stableKey, edition.id)))
    ).flat();
    const overrides = [...ownOverrides, ...sharedOverrides];
    const overrideByTarget = new Map(overrides.filter((o) => o.entryType === "edit").map((o) => [o.targetKey, o] as const));

    res.json({
      edition: { id: edition.id, label: edition.label },
      program,
      groups: tree.tree.map((node) => {
        const editable = canManageProgram(scopes, node.stableKey);
        return {
          stableKey: node.stableKey,
          title: node.group.title,
          category: node.category,
          kind: node.group.kind,
          shared: node.stableKey !== programKey,
          /** May this person retitle / hide / add in this group? Notes are allowed on any item. */
          editable,
          provenance: {
            sourceLabel: node.provenance.sourceLabel,
            sourceUrl: node.provenance.sourceIdentifier,
            sourceVersion: node.provenance.sourceVersion,
            lastVerified: node.provenance.lastVerified,
          },
          items: [
            ...node.items.map((entry) => {
              const override = overrideByTarget.get(entry.stableKey);
              return {
                stableKey: entry.stableKey,
                label: entry.item.label,
                description: entry.item.description,
                courses: entry.item.courses,
                override: override
                  ? {
                      id: override.id,
                      title: override.title,
                      description: override.description,
                      hidden: override.hidden,
                      updatedBy: override.updatedBy,
                      updatedAt: override.updatedAt.toISOString(),
                      bulletinChangedSince:
                        override.baseFingerprint !== null && override.baseFingerprint !== entry.fingerprint,
                    }
                  : null,
              };
            }),
          ],
          added: overrides
            .filter((o) => o.entryType === "added" && o.groupKey === node.stableKey)
            .map((o) => ({
              id: o.id,
              stableKey: o.targetKey,
              title: o.title,
              description: o.description,
              courseCodes: o.courseCodes,
              minimumCourses: o.minimumCourses,
              updatedBy: o.updatedBy,
              updatedAt: o.updatedAt.toISOString(),
            })),
        };
      }),
      notes: notes.map((n) => ({
        id: n.id,
        targetKey: n.targetKey,
        title: n.title,
        body: n.body,
        courseCodes: n.courseCodes,
        kind: n.noteKind,
        status: n.status,
        origin: n.origin,
        sourceType: n.sourceType,
        canonicalResourceId: n.canonicalResourceId,
        sourceLabel: n.sourceLabel,
        sourceUrl: n.sourceUrl,
        sourceAcademicYear: n.sourceAcademicYear,
        sourceDocumentVersion: n.sourceDocumentVersion,
        provenanceStatus: n.provenanceStatus,
        sourceReference: n.sourceReference,
        sourceAnchorText: n.sourceAnchorText,
        reviewedBy: n.reviewedBy,
        updatedBy: n.updatedBy,
        updatedAt: n.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return fail(res, error);
  }
});

/**
 * Provenance inspector for one requirement: the three layers it is made of.
 *
 *   Base        what the Bulletin data says, and where it came from
 *   Department  this program's override and notes for it, in every status
 *   Student     never visible here: a student's edits are private to their own plan
 */
router.get("/admin/department/programs/:programKey/provenance", requireAuth, requireDepartmentAccess, async (req, res) => {
  const programKey = programKeyParam(req.params.programKey);
  if (!scopedProgram(req, res, programKey)) return;
  const targetKey = typeof req.query.targetKey === "string" ? req.query.targetKey : "";
  const tree = programTree(programKey)!;
  const group = tree.tree.find((g) => g.stableKey === (targetKey.split("#")[0] ?? ""));
  const entry = group?.items.find((i) => i.stableKey === targetKey);
  if (!group || !entry) return res.status(404).json({ error: "That requirement is not in this program's sidebar." });
  try {
    const edition = resolveBulletinEdition(null).edition;
    const [notes, overrides] = await Promise.all([
      listNotesForProgram(programKey, edition.id),
      listOverridesForProgram(group.stableKey, edition.id),
    ]);
    const override = overrides.find((o) => o.entryType === "edit" && o.targetKey === targetKey) ?? null;
    res.json({
      stableKey: targetKey,
      base: {
        source: "Bulletin",
        edition: edition.id,
        sourceLabel: group.provenance.sourceLabel,
        sourceUrl: group.provenance.sourceIdentifier,
        sourceVersion: group.provenance.sourceVersion,
        lastVerified: group.provenance.lastVerified,
        group: group.group.title,
        category: group.category,
        label: entry.item.label,
        description: entry.item.description,
        courses: entry.item.courses,
        fingerprint: entry.fingerprint,
      },
      department: {
        override: override
          ? {
              title: override.title,
              description: override.description,
              hidden: override.hidden,
              updatedBy: override.updatedBy,
              updatedAt: override.updatedAt.toISOString(),
              bulletinChangedSince: override.baseFingerprint !== null && override.baseFingerprint !== entry.fingerprint,
            }
          : null,
        notes: notes
          .filter((n) => n.targetKey === targetKey)
          .map((n) => ({
            id: n.id,
            status: n.status,
            origin: n.origin,
            canonicalResourceId: n.canonicalResourceId,
            sourceLabel: n.sourceLabel,
            sourceUrl: n.sourceUrl,
            sourceAcademicYear: n.sourceAcademicYear,
            sourceDocumentVersion: n.sourceDocumentVersion,
            provenanceStatus: n.provenanceStatus,
            sourceReference: n.sourceReference,
            reviewedBy: n.reviewedBy,
            updatedAt: n.updatedAt.toISOString(),
          })),
      },
      student: "Students' own edits (My Note, hide, own requirements) are private to each plan and are not visible here. They sit on top of the layers above and never change them.",
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.get("/admin/department/programs/:programKey/audit", requireAuth, requireDepartmentAccess, async (req, res) => {
  const programKey = programKeyParam(req.params.programKey);
  if (!scopedProgram(req, res, programKey)) return;
  try {
    const rows = await listAudit(programKey, Number(req.query.limit) || 100);
    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        actor: r.actorEmail,
        entity: r.entity,
        action: r.action,
        targetKey: r.targetKey,
        before: r.before,
        after: r.after,
      })),
    });
  } catch (error) {
    return fail(res, error);
  }
});

// ---------------------------------------------------------------------------
// Department Notes
// ---------------------------------------------------------------------------

const NoteCreate = z.object({
  programKey: z.string().min(1).max(160),
  targetKey: z.string().min(1).max(300).nullable().optional(),
  body: z.string().min(1).max(4000),
  title: z.string().max(400).nullable().optional(),
  courseCodes: z.array(z.string().max(20)).max(200).nullable().optional(),
  kind: z.string().max(40).nullable().optional(),
  status: z.enum(["draft", "published"]).optional(),
});
const NotePatch = z.object({
  body: z.string().min(1).max(4000).optional(),
  title: z.string().max(400).nullable().optional(),
  courseCodes: z.array(z.string().max(20)).max(200).nullable().optional(),
  kind: z.string().max(40).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  targetKey: z.string().min(1).max(300).nullable().optional(),
});

const publicNote = (n: NonNullable<Awaited<ReturnType<typeof getNote>>>) => ({
  id: n.id,
  programKey: n.programKey,
  targetKey: n.targetKey,
  title: n.title,
  body: n.body,
  courseCodes: n.courseCodes,
  kind: n.noteKind,
  status: n.status,
  origin: n.origin,
  sourceType: n.sourceType,
  canonicalResourceId: n.canonicalResourceId,
  sourceLabel: n.sourceLabel,
  sourceUrl: n.sourceUrl,
  sourceAcademicYear: n.sourceAcademicYear,
  sourceDocumentVersion: n.sourceDocumentVersion,
  provenanceStatus: n.provenanceStatus,
  updatedAt: n.updatedAt.toISOString(),
});

router.post("/admin/department/notes", requireAuth, requireDepartmentAccess, async (req, res) => {
  const parsed = NoteCreate.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the note, and say which program and requirement it is for." });
  // Scope first, from the server's own list of programs: a spoofed key is 404, someone else's is 403.
  if (!scopedProgram(req, res, parsed.data.programKey)) return;
  try {
    const row = await createNote(actorOf(req), {
      programKey: parsed.data.programKey,
      targetKey: parsed.data.targetKey ?? null,
      body: parsed.data.body,
      title: parsed.data.title ?? null,
      courseCodes: parsed.data.courseCodes ?? [],
      kind: parsed.data.kind ?? null,
      status: parsed.data.status,
    });
    res.status(201).json(publicNote(row));
  } catch (error) {
    return fail(res, error);
  }
});

router.patch("/admin/department/notes/:id", requireAuth, requireDepartmentAccess, async (req, res) => {
  const parsed = NotePatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid note." });
  try {
    const existing = await getNote(Number(req.params.id));
    // The note's own program decides, never one in the request.
    if (!existing) return res.status(404).json({ error: "Note not found." });
    if (!canManageProgram(scopesOf(req), existing.programKey)) {
      return res.status(403).json({ error: "You are not an administrator of that program." });
    }
    const row = await updateNote(actorOf(req), existing, parsed.data);
    res.json(publicNote(row));
  } catch (error) {
    return fail(res, error);
  }
});

// ---------------------------------------------------------------------------
// Global overrides
// ---------------------------------------------------------------------------

const OverridePut = z.object({
  targetKey: z.string().min(1).max(300),
  title: z.string().max(400).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  hidden: z.boolean().optional(),
});
const AddedPost = z.object({
  groupKey: z.string().min(1).max(160),
  title: z.string().min(1).max(400),
  description: z.string().max(2000).nullable().optional(),
  courseCodes: z.array(z.string().max(20)).max(30).optional(),
  minimumCourses: z.number().int().min(1).max(30).nullable().optional(),
});

router.put("/admin/department/overrides", requireAuth, requireDepartmentAccess, async (req, res) => {
  const parsed = OverridePut.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid override." });
  // The program is the requirement's own group, never a value from the request.
  const programKey = overrideProgramKey(parsed.data.targetKey);
  if (!canManageProgram(scopesOf(req), programKey)) {
    return res.status(403).json({ error: "You are not an administrator of the program that owns that requirement." });
  }
  try {
    const row = await saveOverride(actorOf(req), parsed.data);
    res.json({ override: row ? { id: row.id, targetKey: row.targetKey, title: row.title, description: row.description, hidden: row.hidden } : null });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/admin/department/requirements", requireAuth, requireDepartmentAccess, async (req, res) => {
  const parsed = AddedPost.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a title for the requirement." });
  if (!canManageProgram(scopesOf(req), parsed.data.groupKey)) {
    return res.status(403).json({ error: "You are not an administrator of that program." });
  }
  try {
    const row = await addRequirement(actorOf(req), parsed.data);
    res.status(201).json({ id: row.id, targetKey: row.targetKey });
  } catch (error) {
    return fail(res, error);
  }
});

/** Reset to Bulletin: removes the override (or the added requirement). */
router.delete("/admin/department/overrides/:id", requireAuth, requireDepartmentAccess, async (req, res) => {
  try {
    const row = await getOverride(Number(req.params.id));
    if (!row) return res.status(404).json({ error: "Override not found." });
    if (!canManageProgram(scopesOf(req), row.programKey)) {
      return res.status(403).json({ error: "You are not an administrator of that program." });
    }
    await resetOverride(actorOf(req), row);
    res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
});

// ---------------------------------------------------------------------------
// Scopes (super admins only)
// ---------------------------------------------------------------------------

const ScopeBody = z.object({
  email: z.string().email().max(254),
  programKey: z.string().min(1).max(160),
});

router.get("/admin/department/scopes", requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(programAdminScopesTable).where(isNull(programAdminScopesTable.revokedAt));
    res.json({
      scopes: rows
        .map((r) => ({ id: r.id, email: r.email, programKey: r.programKey, role: r.role, grantedBy: r.grantedBy, grantedAt: r.grantedAt.toISOString() }))
        .sort((a, b) => a.email.localeCompare(b.email) || a.programKey.localeCompare(b.programKey)),
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/admin/department/scopes", requireAuth, requireSuperAdmin, async (req, res) => {
  const parsed = ScopeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address and program." });
  if (!findProgram(parsed.data.programKey)) return res.status(404).json({ error: "That program is not in CampusVal." });
  const email = normalizeEmail(parsed.data.email);
  try {
    await db
      .insert(programAdminScopesTable)
      .values({ email, programKey: parsed.data.programKey, grantedBy: normalizeEmail(req.userEmail!) })
      .onConflictDoUpdate({
        target: [programAdminScopesTable.email, programAdminScopesTable.programKey],
        set: { revokedAt: null, grantedBy: normalizeEmail(req.userEmail!), grantedAt: new Date() },
      });
    await recordAudit(actorOf(req), { programKey: parsed.data.programKey, entity: "scope", action: "grant", after: { email } });
    res.status(201).json({ email, programKey: parsed.data.programKey });
  } catch (error) {
    return fail(res, error);
  }
});

router.delete("/admin/department/scopes", requireAuth, requireSuperAdmin, async (req, res) => {
  const parsed = ScopeBody.safeParse(req.body ?? req.query);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email address and program." });
  const email = normalizeEmail(parsed.data.email);
  try {
    const revoked = await db
      .update(programAdminScopesTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(programAdminScopesTable.email, email),
          eq(programAdminScopesTable.programKey, parsed.data.programKey),
          isNull(programAdminScopesTable.revokedAt),
        ),
      )
      .returning({ id: programAdminScopesTable.id });
    if (revoked.length === 0) return res.status(404).json({ error: "That scope is not granted." });
    await recordAudit(actorOf(req), { programKey: parsed.data.programKey, entity: "scope", action: "revoke", after: { email } });
    res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
