import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Manual degree-requirement check-offs.
 *
 * SCU defines some requirements as "choose from an approved list", which
 * cannot be auto-verified against completed course codes. Students may mark
 * those complete themselves. Each check-off carries provenance: WHO marked
 * it (userId), WHAT it covers (collegeCode/groupId/requirementId), HOW it
 * was satisfied (source = "manual" — student-asserted, vs auto-tracked
 * items which are computed live and never stored here), and WHEN.
 */
export const requirementCompletionsTable = pgTable(
  "requirement_completions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    collegeCode: text("college_code").notNull(),
    groupId: text("group_id").notNull(),
    requirementId: text("requirement_id").notNull(),
    /** Provenance of the completion claim. Only "manual" is stored today. */
    source: text("source").notNull().default("manual"),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("req_completion_unique").on(
      t.userId,
      t.collegeCode,
      t.groupId,
      t.requirementId,
    ),
  ],
);

export type RequirementCompletion =
  typeof requirementCompletionsTable.$inferSelect;
