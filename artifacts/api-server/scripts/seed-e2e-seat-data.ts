/**
 * Seat data for the browser tests, in a LOCAL or STAGING database only.
 *
 *   pnpm --filter @workspace/api-server run seed-e2e-seats
 *
 * Browser test D (Quarter Plan: Open vs All Sections) needs four sections of
 * one course with known seat counts: one open, one full, one with a waitlist
 * and one whose counts are unknown. Real seat data comes from a student's
 * Workday sync; a test cannot depend on that, and must not invent registration
 * data in production. So the data is put in the test database, by this script,
 * and the test is not run against production.
 *
 * It refuses to run unless DATABASE_URL points at this machine (localhost or
 * 127.0.0.1) or E2E_SEED_DATABASE names the database's host exactly. It writes
 * four rows, for a course and term no student plan depends on, and nothing else.
 */
import { and, eq } from "drizzle-orm";

const COURSE = "MATH 11";
const TERM = "fall";
const YEAR = 2026;

/** The four states the availability view distinguishes. */
const SECTIONS = [
  { sectionNumber: "1", seatsTotal: 35, seatsOpen: 6, waitlist: 0, days: ["M", "W", "F"], start: "09:15", end: "10:20" },
  { sectionNumber: "2", seatsTotal: 35, seatsOpen: 0, waitlist: 0, days: ["M", "W", "F"], start: "10:30", end: "11:35" },
  { sectionNumber: "3", seatsTotal: 35, seatsOpen: 0, waitlist: 4, days: ["T", "R"], start: "12:10", end: "13:50" },
  // No counts at all: availability is unknown, and must be shown as unknown.
  { sectionNumber: "5", seatsTotal: 0, seatsOpen: 0, waitlist: 0, days: ["T", "R"], start: "14:00", end: "15:40" },
] as const;

function allowedHost(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set.");
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!local && process.env["E2E_SEED_DATABASE"] !== host) {
    throw new Error(
      `Refusing to write test seat data to "${host}". This script is for a local or staging test database. ` +
        `To seed a staging database, set E2E_SEED_DATABASE to its host name exactly. Never seed production.`,
    );
  }
  return host;
}

async function main(): Promise<void> {
  const host = allowedHost();
  // Imported after the check, so nothing connects to a database that was refused.
  const { db, pool, courseSectionsTable } = await import("@workspace/db");
  for (const section of SECTIONS) {
    const where = and(
      eq(courseSectionsTable.courseCode, COURSE),
      eq(courseSectionsTable.sectionNumber, section.sectionNumber),
      eq(courseSectionsTable.term, TERM),
      eq(courseSectionsTable.year, YEAR),
    );
    await db.delete(courseSectionsTable).where(where);
    await db.insert(courseSectionsTable).values({
      courseCode: COURSE,
      sectionNumber: section.sectionNumber,
      term: TERM,
      year: YEAR,
      instructor: "Staff",
      meetingDays: [...section.days],
      startTime: section.start,
      endTime: section.end,
      location: "Test data",
      seatsTotal: section.seatsTotal,
      seatsOpen: section.seatsOpen,
      waitlist: section.waitlist,
      sourceLine: "e2e seat data",
      component: "Lecture",
    });
  }
  console.log(`seeded ${SECTIONS.length} sections of ${COURSE}, ${TERM} ${YEAR}, on ${host}`);
  await pool.end();
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
