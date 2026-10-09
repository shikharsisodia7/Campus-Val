import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  numeric,
} from "drizzle-orm/pg-core";

/**
 * Department layer of the requirements sidebar.
 *
 *   BULLETIN (compiled source, never written)
 *     + department notes and overrides   <- these tables
 *     + the student's plan-scoped edits  <- requirement_customizations
 *     = what the student sees
 *
 * Nothing here ever edits the Bulletin data. A row is an overlay keyed by the
 * requirement's STABLE KEY and the Bulletin edition it was written against;
 * deleting the row restores the Bulletin exactly. Who may write these rows is
 * decided on the server from `program_admin_scopes` (and the ADMIN_EMAILS
 * super-admin list), never from anything the browser sends.
 */

/**
 * Who may maintain which program. One row = one person (by normalized email,
 * so a scope can be granted before the person first signs in, and later be
 * mapped from an SSO group) and one program key ("major:biology",
 * "minor-ctw-min"...). The ADMIN_EMAILS super admins need no row.
 */
export const programAdminScopesTable = pgTable(
  "program_admin_scopes",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    programKey: text("program_key").notNull(),
    role: text("role").notNull().default("department_admin"),
    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("program_admin_scopes_email_program_unique").on(t.email, t.programKey),
    index("program_admin_scopes_email_idx").on(t.email),
  ],
);

/**
 * "Department Note": advising guidance a department stands behind, shown on a
 * requirement for every student whose plan includes the program. Separate from
 * a student's own "My Note" and read-only for students.
 *
 * `targetKey` is a stable key of a requirement (item), a group, or null for a
 * note about the whole program. `programKey` says WHOSE note it is: a Biology
 * note about a Core requirement has programKey "major:biology" and a Core
 * target, and is shown only to plans that include Biology.
 *
 * status: draft (not visible), published (visible), archived (visible to
 * nobody, kept for the audit), unmapped (imported text that could not be
 * anchored to a requirement with certainty; waits for an admin).
 * origin: imported (from a department checklist) | admin (typed by an admin).
 */
export const departmentRequirementNotesTable = pgTable(
  "department_requirement_notes",
  {
    id: serial("id").primaryKey(),
    programKey: text("program_key").notNull(),
    programType: text("program_type").notNull(), // major | minor
    targetKey: text("target_key"),
    bulletinEdition: text("bulletin_edition").notNull(),
    body: text("body").notNull(),
    /** Optional short heading ("Courses that fulfill the CMB theme"). */
    title: text("title"),
    /**
     * Optional catalog course codes the note refers to (a course list the
     * department maintains). Codes only, validated against the catalog; the
     * note text stays free-form.
     */
    courseCodes: jsonb("course_codes").$type<string[]>().notNull().default([]),
    /** Optional label: requirement | sequence | core_overlap | advising. */
    noteKind: text("note_kind"),
    status: text("status").notNull().default("draft"),
    origin: text("origin").notNull(),
    sourceType: text("source_type").notNull(), // checklist | admin_entry
    sourceLabel: text("source_label"),
    sourceUrl: text("source_url"),
    /** Where in the source: "Biology!D31". Never a student's private file. */
    sourceReference: text("source_reference"),
    /** What the importer read in the row's label cell, for the unmapped queue. */
    sourceAnchorText: text("source_anchor_text"),
    /** Idempotent re-import key. Null for notes an admin typed. */
    importKey: text("import_key"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("department_notes_program_idx").on(t.programKey, t.bulletinEdition),
    index("department_notes_target_idx").on(t.targetKey),
    uniqueIndex("department_notes_import_key_unique").on(t.importKey),
  ],
);

/**
 * A global planning override of one Bulletin requirement, or a requirement a
 * department added to the planning view. Applies to every plan that shows the
 * requirement; the student's own edits still sit on top.
 *
 * entryType:
 *   "edit"  - retitle and/or hide a Bulletin requirement. `baseFingerprint`,
 *             `baseTitle` and `baseSourceVersion` record what the Bulletin said
 *             when the override was made, so a later Bulletin change is
 *             surfaced to the admin instead of silently overridden.
 *   "added" - a requirement the Bulletin does not list. `groupKey` is where it
 *             sits; it is never Bulletin-sourced and says so on screen.
 */
export const departmentRequirementOverridesTable = pgTable(
  "department_requirement_overrides",
  {
    id: serial("id").primaryKey(),
    programKey: text("program_key").notNull(),
    bulletinEdition: text("bulletin_edition").notNull(),
    entryType: text("entry_type").notNull(), // edit | added
    targetKey: text("target_key").notNull(),
    groupKey: text("group_key"),
    title: text("title"),
    description: text("description"),
    hidden: boolean("hidden").notNull().default(false),
    courseCodes: jsonb("course_codes").$type<string[]>().notNull().default([]),
    /** "added" only: how many of the listed courses satisfy it (default 1). */
    minimumCourses: integer("minimum_courses"),
    position: integer("position").notNull().default(0),
    baseFingerprint: text("base_fingerprint"),
    baseTitle: text("base_title"),
    baseSourceVersion: text("base_source_version"),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("department_overrides_target_unique").on(t.bulletinEdition, t.targetKey),
    index("department_overrides_program_idx").on(t.programKey, t.bulletinEdition),
  ],
);

/**
 * Append-only record of every global change: who, when, which program and
 * requirement, and the effective value before and after. Holds department
 * content only, never anything about a student.
 */
export const departmentAuditLogTable = pgTable(
  "department_audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorEmail: text("actor_email").notNull(),
    actorUserId: text("actor_user_id"),
    programKey: text("program_key").notNull(),
    entity: text("entity").notNull(), // note | override | sample_plan | scope
    entityId: text("entity_id"),
    action: text("action").notNull(), // create | update | archive | publish | unpublish | reset | grant | revoke | import
    targetKey: text("target_key"),
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (t) => [index("department_audit_program_idx").on(t.programKey, t.at)],
);

/**
 * A sample plan: a published planning template (a first year, two years, four
 * years) that a student can load into a NEW Tentative Degree Plan. The
 * student's copy is independent: later changes here never touch it. A
 * template is only ever added or versioned, never edited under a student.
 */
export const samplePlansTable = pgTable(
  "sample_plans",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    /** Edition of the source ("2026-27", "AY24-25"). New edition = new row. */
    version: text("version").notNull(),
    school: text("school").notNull(), // CAS | LSB | SOE
    program: text("program").notNull(),
    /** Stable program key when it maps to a CampusVal program ("major:biology"). */
    programKey: text("program_key"),
    title: text("title").notNull(),
    description: text("description"),
    /** first_year | two_year | four_year | other, from the source, not guessed. */
    planLength: text("plan_length").notNull(),
    academicYear: text("academic_year"),
    sourceType: text("source_type").notNull(), // official_department | admin_entry
    sourceLabel: text("source_label"),
    sourceUrl: text("source_url"),
    /** Which document/option inside the source, e.g. "Biology.docx, Option One". */
    sourceReference: text("source_reference"),
    status: text("status").notNull().default("draft"), // draft | published | archived
    /** Validation findings recorded when it was imported (also recomputed live). */
    importWarnings: jsonb("import_warnings").$type<string[]>().notNull().default([]),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("sample_plans_slug_version_unique").on(t.slug, t.version),
    index("sample_plans_school_idx").on(t.school, t.status),
  ],
);

export const samplePlanItemsTable = pgTable(
  "sample_plan_items",
  {
    id: serial("id").primaryKey(),
    samplePlanId: integer("sample_plan_id")
      .notNull()
      .references(() => samplePlansTable.id, { onDelete: "cascade" }),
    /** 1-based year within the template. */
    year: integer("year").notNull(),
    term: text("term").notNull(), // fall | winter | spring | summer
    position: integer("position").notNull().default(0),
    itemType: text("item_type").notNull(), // course | placeholder
    courseCode: text("course_code"),
    /** Placeholder wording, verbatim from the source ("CHEM 11, 14, Core or Elective"). */
    label: text("label"),
    /** The course title the SOURCE printed, kept to notice a catalog rename. */
    sourceTitle: text("source_title"),
    note: text("note"),
    units: numeric("units"),
  },
  (t) => [index("sample_plan_items_plan_idx").on(t.samplePlanId)],
);

export type ProgramAdminScopeRow = typeof programAdminScopesTable.$inferSelect;
export type DepartmentRequirementNoteRow = typeof departmentRequirementNotesTable.$inferSelect;
export type InsertDepartmentRequirementNote = typeof departmentRequirementNotesTable.$inferInsert;
export type DepartmentRequirementOverrideRow = typeof departmentRequirementOverridesTable.$inferSelect;
export type InsertDepartmentRequirementOverride = typeof departmentRequirementOverridesTable.$inferInsert;
export type DepartmentAuditLogRow = typeof departmentAuditLogTable.$inferSelect;
export type SamplePlanRow = typeof samplePlansTable.$inferSelect;
export type InsertSamplePlan = typeof samplePlansTable.$inferInsert;
export type SamplePlanItemRow = typeof samplePlanItemsTable.$inferSelect;
export type InsertSamplePlanItem = typeof samplePlanItemsTable.$inferInsert;
