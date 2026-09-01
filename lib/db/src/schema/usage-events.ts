import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Privacy-preserving product usage analytics (admin-only; see
 * docs/USAGE_ANALYTICS.md). Deliberately minimal: which high-level FEATURE a
 * signed-in user visited, and when. Never course codes, grades, APR/report
 * contents, uploaded file content, or free-text query strings — see the
 * FEATURES allowlist in routes/usage.ts, which the server enforces on every
 * write so the client can never smuggle sensitive data into `feature`.
 */
export const usageEventsTable = pgTable(
  "usage_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    userEmail: text("user_email").notNull(),
    userType: text("user_type").notNull(), // "scu" | "external_reviewer"
    feature: text("feature").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("usage_events_user_idx").on(t.userId),
    index("usage_events_feature_idx").on(t.feature),
    index("usage_events_created_idx").on(t.createdAt),
  ],
);

export const insertUsageEventSchema = createInsertSchema(
  usageEventsTable,
).omit({ id: true, createdAt: true });
export type InsertUsageEvent = z.infer<typeof insertUsageEventSchema>;
export type UsageEventRow = typeof usageEventsTable.$inferSelect;
