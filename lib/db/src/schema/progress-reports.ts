import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Academic Progress Report DOCUMENTS — many per user (one Workday export per
 * major / minor / other academic plan). Each row is one uploaded file.
 *
 * Design principle: the Workday APR is the source of truth and CampusVal shows
 * it, it does not re-audit it. So a row stores the file's metadata plus
 * `workbook`, a STRUCTURAL copy of the spreadsheet (sheets, rows, cells, merges,
 * basic formatting) — never an academic interpretation of it.
 *
 *   parse_status  the FILE-IMPORT state, not an academic verdict:
 *                 "pending" | "parsed" (= ready) | "unsupported" | "failed"
 *   uploaded_at   when the CURRENT file was added to CampusVal; a replacement
 *                 moves it forward. Never presented as a Workday timestamp.
 *   category      free text on purpose (primary_major, additional_major, minor,
 *                 additional_minor, other …) so nothing caps how many majors or
 *                 minors a student may have.
 *   parsed        LEGACY. The pre-2026-09-26 interpreted parse (requirement
 *                 groups, matched courses). No longer written for new uploads
 *                 and never used for an academic conclusion; kept so existing
 *                 rows migrate without data loss.
 */
export const progressReportsTable = pgTable(
  "progress_reports",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    label: text("label").notNull().default("Academic Progress Report"),
    category: text("category").notNull().default("other"),
    displayOrder: integer("display_order").notNull().default(0),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    contentType: text("content_type").notNull(),
    sourceFormat: text("source_format").notNull().default("pdf"),
    fileHash: text("file_hash"),
    objectPath: text("object_path").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    workbook: jsonb("workbook"),
    importError: text("import_error"),
    parsed: jsonb("parsed"),
    parseStatus: text("parse_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("progress_reports_user_order_idx").on(t.userId, t.displayOrder, t.id)],
);

export const insertProgressReportSchema = createInsertSchema(
  progressReportsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type ProgressReportRow = typeof progressReportsTable.$inferSelect;

export type InsertProgressReport = z.infer<typeof insertProgressReportSchema>;
