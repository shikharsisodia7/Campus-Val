import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Academic Progress Report uploads. One per user (replacing overwrites).
 * The original file lives in PRIVATE object storage (FERPA-sensitive);
 * only conservative, reliably-extracted fields are stored here. Report
 * contents are never logged.
 */
export const progressReportsTable = pgTable(
  "progress_reports",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    objectPath: text("object_path").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    contentType: text("content_type").notNull(),
    // stored | parsed | error
    status: text("status").notNull().default("stored"),
    parseError: text("parse_error"),
    extracted: jsonb("extracted")
      .$type<{
        courses: {
          code: string;
          title: string | null;
          units: number | null;
          grade: string | null;
        }[];
        notes: string[];
      }>()
      .notNull()
      .default({ courses: [], notes: [] }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqUser: uniqueIndex("progress_reports_user_unique").on(t.userId),
  }),
);

export type ProgressReportRow = typeof progressReportsTable.$inferSelect;
