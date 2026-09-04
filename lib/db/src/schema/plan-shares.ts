import { pgTable, text, serial, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Student-controlled advisor sharing: a student grants a specific advisor
 * email read-only access to a scoped set of their planning data. The
 * student owns the permission — nothing here makes any SCU faculty/staff
 * account able to see every student's plan, and every read is enforced
 * server-side (see routes/plan-shares.ts), never by hiding a button.
 *
 * One row per (studentUserId, advisorEmail) pair. Revoking sets revokedAt
 * rather than deleting, so "who has ever had access" stays auditable; an
 * active grant is one where revokedAt is null. lastViewedAt is the minimal
 * audit trail for "advisor viewed shared plan" the product spec asked for —
 * deliberately not a full event log, to avoid over-logging academic content.
 */
export const planSharesTable = pgTable(
  "plan_shares",
  {
    id: serial("id").primaryKey(),
    studentUserId: text("student_user_id").notNull(),
    /** Normalized lowercase — advisors are matched by their verified sign-in email. */
    advisorEmail: text("advisor_email").notNull(),
    /**
     * Subset of "degree_plan" | "tentative_degree_plan". Workday APR is
     * deliberately not a shareable scope yet — no advisor-facing route
     * reads APR data, so offering it as a grant option would be a promise
     * the product doesn't keep. Revisit once a real advisor APR viewer
     * exists.
     */
    scopes: jsonb("scopes").$type<string[]>().notNull().default(["degree_plan"]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  },
  (t) => [
    index("plan_shares_student_idx").on(t.studentUserId),
    index("plan_shares_advisor_email_idx").on(t.advisorEmail),
  ],
);

export const insertPlanShareSchema = createInsertSchema(planSharesTable).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
  lastViewedAt: true,
});
export type InsertPlanShare = z.infer<typeof insertPlanShareSchema>;
export type PlanShareRow = typeof planSharesTable.$inferSelect;
