import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * User-submitted feedback / feature requests / bug reports.
 * One row per submission. Tied to the Clerk user id (and email captured
 * server-side from the authenticated session, never trusted from the client).
 *
 * Two entry points write into this same table: the original `/feedback` page
 * (category/message/rating - general product feedback) and the header-level
 * "Report Error / Suggest Changes" dialog (the `type`/`subject`/... columns
 * below). The dialog columns are nullable so old rows and the simple page
 * keep working unchanged.
 */
export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email"),
  category: text("category").notNull().default("general"),
  message: text("message").notNull(),
  rating: integer("rating"),
  page: text("page"),
  status: text("status").notNull().default("OPEN"),
  // "Report Error / Suggest Changes" dialog fields (nullable - unset for
  // rows created by the plain /feedback page).
  type: text("type"),
  subject: text("subject"),
  feature: text("feature"),
  pathname: text("pathname"),
  academicItem: text("academic_item"),
  officialSourceUrl: text("official_source_url"),
  proposedCorrection: text("proposed_correction"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({
  id: true,
  userId: true,
  email: true,
  status: true,
  updatedAt: true,
  resolvedAt: true,
  resolvedBy: true,
  createdAt: true,
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type FeedbackRow = typeof feedbackTable.$inferSelect;