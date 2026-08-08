import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One progress report per user (upserted on re-upload).
 * Stores the uploaded file metadata and the parsed result.
 * parse_status: "pending" | "parsed" | "unsupported" | "failed"
 */
export const progressReportsTable = pgTable(
  "progress_reports",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    contentType: text("content_type").notNull(),
    objectPath: text("object_path").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
);

export const insertProgressReportSchema = createInsertSchema(
  progressReportsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type ProgressReportRow = typeof progressReportsTable.$inferSelect;

export type InsertProgressReport = z.infer<typeof insertProgressReportSchema>;
