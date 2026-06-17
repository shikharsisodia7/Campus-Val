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
 */
export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email"),
  category: text("category").notNull().default("general"),
  message: text("message").notNull(),
  rating: integer("rating"),
  page: text("page"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({
  id: true,
  userId: true,
  email: true,
  status: true,
  createdAt: true,
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type FeedbackRow = typeof feedbackTable.$inferSelect;
