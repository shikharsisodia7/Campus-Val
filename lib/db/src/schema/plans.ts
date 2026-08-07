import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  numeric,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Academic plans: the student's primary Degree Plan plus any number of
 * tentative (what-if) plans. Exactly one plan per user should have
 * planType = "degree" (enforced in route logic, not the DB).
 */
export const academicPlansTable = pgTable(
  "academic_plans",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    planType: text("plan_type").notNull(), // "degree" | "tentative"
    sourcePlanId: integer("source_plan_id"),
    // Plan-scoped display and scenario settings. These deliberately live with
    // the plan, so tentative drafts can explore extra years independently of
    // the official Degree Plan.
    metadata: jsonb("metadata")
      .$type<{
        addedYears?: number[];
        summerYears?: number[];
        scenarioMajors?: string[];
        scenarioMinors?: string[];
      }>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("academic_plans_user_idx").on(t.userId)],
);

/**
 * Items placed in a plan term: either a real catalog course or a
 * requirement placeholder ("I need to satisfy Religion in Winter").
 * academicYear is the START year of the academic year (2026 = 2026–2027).
 */
export const planItemsTable = pgTable(
  "plan_items",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id").notNull(),
    itemType: text("item_type").notNull(), // "course" | "requirement_placeholder"
    courseCode: text("course_code"),
    courseTitle: text("course_title"),
    units: numeric("units"),
    requirementId: text("requirement_id"),
    requirementCategory: text("requirement_category"),
    requirementLabel: text("requirement_label"),
    academicYear: integer("academic_year").notNull(),
    term: text("term").notNull(), // fall | winter | spring | summer
    // Where the item lives: "planned" (a real term column) or "completed"
    // (the Completed Before Current Plan area; academicYear/term are ignored
    // for display but retained for history).
    bucket: text("bucket").notNull().default("planned"),
    // Provenance for completed items. One of: prior_to_scu | transfer_credit |
    // ap_ib_test_credit | previously_completed_scu | other_institution |
    // manually_marked. Null for planned items.
    completionSource: text("completion_source"),
    position: integer("position").notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("plan_items_plan_idx").on(t.planId)],
);

export const insertAcademicPlanSchema = createInsertSchema(
  academicPlansTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAcademicPlan = z.infer<typeof insertAcademicPlanSchema>;
export type AcademicPlanRow = typeof academicPlansTable.$inferSelect;

export const insertPlanItemSchema = createInsertSchema(planItemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPlanItem = z.infer<typeof insertPlanItemSchema>;
export type PlanItemRow = typeof planItemsTable.$inferSelect;
