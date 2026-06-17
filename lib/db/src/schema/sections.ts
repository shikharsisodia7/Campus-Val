import {
  pgTable,
  serial,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Course sections pasted in from SCU's Workday "Find Course Sections".
 * The user pastes the table from their own Workday session into our app —
 * we never see their Workday password. Each row represents one offered
 * section in a specific term/year.
 *
 * Uniqueness: a section is identified by (courseCode, sectionNumber, term, year).
 * Re-pasting the same term overwrites prior rows.
 */
export const courseSectionsTable = pgTable(
  "course_sections",
  {
    id: serial("id").primaryKey(),
    courseCode: text("course_code").notNull(),
    sectionNumber: text("section_number").notNull(),
    term: text("term").notNull(),
    year: integer("year").notNull(),
    instructor: text("instructor").notNull(),
    meetingDays: jsonb("meeting_days")
      .$type<("M" | "T" | "W" | "R" | "F" | "S" | "U")[]>()
      .notNull()
      .default([]),
    startTime: text("start_time").notNull().default(""),
    endTime: text("end_time").notNull().default(""),
    location: text("location").notNull().default(""),
    seatsTotal: integer("seats_total").notNull().default(0),
    seatsOpen: integer("seats_open").notNull().default(0),
    waitlist: integer("waitlist").notNull().default(0),
    syncedByProfileId: integer("synced_by_profile_id"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sourceLine: text("source_line"),
  },
  (t) => ({
    uniqSection: uniqueIndex("course_sections_unique").on(
      t.courseCode,
      t.sectionNumber,
      t.term,
      t.year,
    ),
  }),
);

export type CourseSectionRow = typeof courseSectionsTable.$inferSelect;
export type InsertCourseSection = typeof courseSectionsTable.$inferInsert;
