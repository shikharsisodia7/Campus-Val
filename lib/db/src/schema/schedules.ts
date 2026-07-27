import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Quarter schedules: a student can keep multiple named schedules for the
 * SAME quarter (e.g. Fall 2026 "Schedule 1", "Early mornings", "Backup").
 * Each schedule is fully independent — duplication deep-copies events.
 */
export const quarterSchedulesTable = pgTable(
  "quarter_schedules",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    term: text("term").notNull(), // fall | winter | spring | summer
    year: integer("year").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("quarter_schedules_user_idx").on(t.userId, t.term, t.year)],
);

/**
 * Events on a quarter schedule. Two kinds:
 *  - "section": a real SCU course section, validated server-side against the
 *    official Registrar schedule at add time; meeting details are snapshotted
 *    from that authoritative source (never invented).
 *  - "commitment": a student-entered commitment (work, athletics, student
 *    org, special program, external course at another institution, personal).
 *    These participate in conflict detection but are never treated as SCU
 *    catalog courses.
 */
export const scheduleEventsTable = pgTable(
  "schedule_events",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id").notNull(),
    kind: text("kind").notNull(), // "section" | "commitment"
    // section fields (snapshot of official Registrar data)
    courseCode: text("course_code"),
    courseTitle: text("course_title"),
    sectionNumber: text("section_number"),
    units: numeric("units"),
    instructor: text("instructor"),
    // commitment fields
    name: text("name"),
    category: text("category"), // work | athletics | student_org | special_program | external_course | personal | other
    institution: text("institution"),
    externalCourseLabel: text("external_course_label"),
    notes: text("notes"),
    // shared meeting-time fields
    meetingDays: jsonb("meeting_days").$type<string[]>().notNull().default([]),
    startTime: text("start_time").notNull(), // "HH:mm" 24h
    endTime: text("end_time").notNull(),
    location: text("location"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("schedule_events_schedule_idx").on(t.scheduleId),
    // A given section can appear at most once per schedule (race-proof
    // backstop behind the API-level duplicate check).
    uniqueIndex("schedule_events_section_unique_idx")
      .on(t.scheduleId, t.courseCode, t.sectionNumber)
      .where(sql`kind = 'section'`),
  ],
);

export const insertQuarterScheduleSchema = createInsertSchema(
  quarterSchedulesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuarterSchedule = z.infer<
  typeof insertQuarterScheduleSchema
>;
export type QuarterScheduleRow = typeof quarterSchedulesTable.$inferSelect;

export const insertScheduleEventSchema = createInsertSchema(
  scheduleEventsTable,
).omit({ id: true, createdAt: true });
export type InsertScheduleEvent = z.infer<typeof insertScheduleEventSchema>;
export type ScheduleEventRow = typeof scheduleEventsTable.$inferSelect;
