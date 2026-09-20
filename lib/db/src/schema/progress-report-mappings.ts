import { pgTable, text, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * A STUDENT'S OWN note that an item on their Workday APR corresponds to a
 * course in the CampusVal catalog ("ENGL 2A on my report is this course").
 *
 * This is an annotation kept beside the report, never inside it:
 *   - the uploaded file and its parsed result are not touched (a re-upload or a
 *     reparse leaves the mappings alone);
 *   - it is the student's claim, not Workday's — every place it is shown says so,
 *     and it never changes what counts as completed;
 *   - owner-scoped: one row per (user, report code), never shared with advisors.
 *
 * `rawCode` is the code exactly as the report printed it, normalized ("ENGL 2A");
 * `courseCode` is a catalog course code, validated by the API when written.
 */
export const progressReportMappingsTable = pgTable(
  "progress_report_mappings",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    rawCode: text("raw_code").notNull(),
    courseCode: text("course_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("progress_report_mappings_user_raw_unique").on(t.userId, t.rawCode)],
);

export type ProgressReportMappingRow = typeof progressReportMappingsTable.$inferSelect;
