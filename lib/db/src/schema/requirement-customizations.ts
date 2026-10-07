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
} from "drizzle-orm/pg-core";
import { academicPlansTable } from "./plans";

/**
 * A student's PLANNING customizations of the requirements sidebar, scoped to
 * one plan. This is an overlay: nothing here is, or changes, an SCU
 * requirement. The source requirement (Bulletin data, checksheet, APR, ...)
 * is never written to by a student edit; the sidebar shows source + overlay,
 * and deleting a row here restores the source exactly.
 *
 * Two kinds of row, told apart by `entryType`:
 *  - "source_edit": a note/title/hide the student put on a SOURCE requirement.
 *    `targetKey` is that requirement's stable key (never an array index or
 *    visible text). `baseFingerprint` / `baseTitle` / `baseSourceVersion`
 *    record what the source said when the student edited it, so a later change
 *    to the source is detected instead of silently overwritten.
 *  - "custom": a requirement the student added. `targetKey` is a random id and
 *    `groupKey` is the sidebar group it sits in. Never institution-authored.
 *
 * Plan-scoped on purpose: an official Degree Plan and each Tentative plan
 * customize independently. The plan FK cascades, so deleting a plan (or the
 * previous Degree Plan when a tentative is promoted over it) leaves no orphan
 * rows. `userId` repeats the plan owner for auditing and defence in depth;
 * every route derives it from authentication and checks plan ownership.
 */
export const requirementCustomizationsTable = pgTable(
  "requirement_customizations",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => academicPlansTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    entryType: text("entry_type").notNull(), // "source_edit" | "custom"
    targetKey: text("target_key").notNull(),
    /** Custom rows only: the sidebar group the requirement belongs to. */
    groupKey: text("group_key"),
    /** Display label the student chose. Null = keep the source's. */
    title: text("title"),
    /** The student's own planning note. Null = none. */
    note: text("note"),
    /** "Hide from my plan": excluded from the student's view, never deleted. */
    hidden: boolean("hidden").notNull().default(false),
    /** Custom rows only: the student's own tick. Never "officially complete". */
    done: boolean("done").notNull().default(false),
    /** Custom rows only: catalog courses the student lists for it (add-to-plan shortcuts, never completion). */
    courseCodes: jsonb("course_codes").$type<string[]>().notNull().default([]),
    /** Custom rows only: order within the group. */
    position: integer("position").notNull().default(0),
    /** Source edits only: fingerprint of the source requirement when edited. */
    baseFingerprint: text("base_fingerprint"),
    /** Source edits only: the source's label when edited (for the review UI). */
    baseTitle: text("base_title"),
    /** Source edits only: the source edition when edited. */
    baseSourceVersion: text("base_source_version"),
    /** Source edits only: which provider produced the base ("current_bulletin"). */
    baseSourceType: text("base_source_type"),
    /**
     * Where the student's note came from, when they transferred it from one of
     * their own Degree Checksheets ("DEGREE_CHECKSHEET"). Provenance only: the note
     * itself is the student's text and stays when the document is replaced or deleted.
     * No file content is stored here, and no foreign key: deleting the document
     * must not delete the student's planning note.
     */
    noteSourceType: text("note_source_type"),
    noteSourceDocumentId: integer("note_source_document_id"),
    /** The document's title when the note was made, so a deleted source can still be named. */
    noteSourceLabel: text("note_source_label"),
    /** A safe pointer inside the document ("Biology!D40"), when it has one. */
    noteSourceAnchor: text("note_source_anchor"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    updatedBy: text("updated_by").notNull(),
  },
  (t) => [
    uniqueIndex("requirement_customizations_target_unique").on(
      t.planId,
      t.entryType,
      t.targetKey,
    ),
    index("requirement_customizations_plan_idx").on(t.planId),
  ],
);

export type RequirementCustomizationRow =
  typeof requirementCustomizationsTable.$inferSelect;
export type InsertRequirementCustomization =
  typeof requirementCustomizationsTable.$inferInsert;
