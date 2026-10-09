import { pgTable, text, serial, integer, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { progressReportsTable } from "./progress-reports";

/**
 * A student's CORRECTIONS to CampusVal's Degree Completion Assessment.
 *
 * The assessment itself is never stored: it is derived on every request from
 * the APR's structural copy (`progress_reports.workbook`), so it can never
 * drift from the file and never writes anything back into the APR. Only what
 * the student changed is kept here, beside the automatic result:
 *
 *   item_key            stable identity of the APR row the correction is for
 *                       (program block + requirement text + occurrence), so it
 *                       survives the APR being replaced by a newer export
 *   source_fingerprint  what that row said when the student corrected it
 *                       (status, remaining, registrations); a different value
 *                       later flags the correction for review instead of
 *                       silently applying it to changed data
 *   status_override     "remaining" | "complete" | null (note or hide only)
 *
 * Private like the APR it derives from: owned by one user, deleted with the
 * APR (ON DELETE CASCADE), never shared with a plan.
 */
export const degreeCompletionOverridesTable = pgTable(
  "degree_completion_overrides",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    aprDocumentId: integer("apr_document_id")
      .notNull()
      .references(() => progressReportsTable.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    sourceFingerprint: text("source_fingerprint").notNull(),
    /** The requirement text as Workday wrote it, so an override whose row disappeared can still be named. */
    sourceLabel: text("source_label").notNull(),
    statusOverride: text("status_override"),
    hidden: boolean("hidden").notNull().default(false),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("degree_completion_overrides_doc_item_unique").on(t.aprDocumentId, t.itemKey),
    index("degree_completion_overrides_user_idx").on(t.userId),
  ],
);

export type DegreeCompletionOverrideRow = typeof degreeCompletionOverridesTable.$inferSelect;
export type InsertDegreeCompletionOverride = typeof degreeCompletionOverridesTable.$inferInsert;
