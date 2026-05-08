import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const studentProfilesTable = pgTable(
  "student_profiles",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    email: text("email"),
    name: text("name").notNull(),
    studentType: text("student_type").notNull(),
    college: text("college").notNull(),
    major: text("major").notNull(),
    secondMajor: text("second_major"),
    minor: text("minor"),
    startTerm: text("start_term").notNull(),
    startYear: integer("start_year").notNull(),
    expectedGradTerm: text("expected_grad_term").notNull(),
    expectedGradYear: integer("expected_grad_year").notNull(),
    unitsCompletedAtScu: numeric("units_completed_at_scu", {
      precision: 6,
      scale: 2,
    })
      .notNull()
      .default("0"),
    unitsTransferredIn: numeric("units_transferred_in", {
      precision: 6,
      scale: 2,
    })
      .notNull()
      .default("0"),
    cumulativeGpa: numeric("cumulative_gpa", { precision: 4, scale: 3 }),
    majorGpa: numeric("major_gpa", { precision: 4, scale: 3 }),
    completedCourseCodes: jsonb("completed_course_codes")
      .$type<string[]>()
      .notNull()
      .default([]),
    priorityRegistration: boolean("priority_registration")
      .notNull()
      .default(false),
    currentTerm: text("current_term").notNull(),
    currentYear: integer("current_year").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqUser: uniqueIndex("student_profiles_user_unique").on(t.userId),
  }),
);

export type StudentProfileRow = typeof studentProfilesTable.$inferSelect;
export type InsertStudentProfile = typeof studentProfilesTable.$inferInsert;
