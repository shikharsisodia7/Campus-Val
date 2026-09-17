/**
 * API coverage for the 2026-09 professor-feedback pass: current-quarter
 * section availability must be truthful (open/waitlist/full/unknown, never
 * fabricated) and future tentative terms must never claim live availability.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { inArray } from "drizzle-orm";

const { db, courseSectionsTable } = await import("@workspace/db");
const coursesRouter = (await import("./courses")).default;
const { OFFERED_SECTIONS } = await import("../data/offered-sections");

const app = express();
app.use(express.json());
app.use("/api", coursesRouter);

// Pick a real, currently-offered Fall 2026 (published, non-tentative) course
// with at least one official section, so the "no live paste" path is
// exercised against real official-schedule data.
const publishedSection = OFFERED_SECTIONS.find(
  (s) => s.term === "fall" && s.year === 2026,
);
if (!publishedSection) {
  throw new Error("Expected at least one Fall 2026 official section fixture");
}
const PUBLISHED_COURSE = publishedSection.courseCode;
// A section number guaranteed not to already exist in the official schedule
// for this course/term/year, to exercise the "Workday-only" merge path
// (a real course, a section CampusVal only knows about via the student's
// own paste-in) distinctly from overlaying seats onto an official row.
const WORKDAY_ONLY_SECTION = "WD-TEST-99";

async function cleanup() {
  await db
    .delete(courseSectionsTable)
    .where(inArray(courseSectionsTable.courseCode, [PUBLISHED_COURSE]));
}

beforeAll(cleanup);
afterAll(cleanup);

describe("GET /api/courses/:code/sections — availability status", () => {
  it("marks a section unknown when no live seat data exists (official Registrar schedule only)", async () => {
    const res = await request(app)
      .get(`/api/courses/${encodeURIComponent(PUBLISHED_COURSE)}/sections`)
      .query({ term: "fall", year: 2026 })
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const section of res.body) {
      expect(section.seatsKnown).toBe(false);
      expect(section.availabilityStatus).toBe("unknown");
      expect(section.lastUpdatedAt).toBeNull();
      expect(section.sourceType).toBe("registrar_schedule");
    }
  });

  it("marks a future tentative-term section unknown, never a fabricated live status", async () => {
    const res = await request(app)
      .get(`/api/courses/${encodeURIComponent(PUBLISHED_COURSE)}/sections`)
      .query({ term: "winter", year: 2027 })
      .expect(200);
    for (const section of res.body) {
      expect(section.tentative).toBe(true);
      expect(section.availabilityStatus).toBe("unknown");
    }
  });

  it("derives open/waitlist/full correctly once the student pastes their own Workday seat counts, and reports a real lastUpdatedAt", async () => {
    const before = new Date();
    await db.insert(courseSectionsTable).values([
      {
        courseCode: PUBLISHED_COURSE,
        sectionNumber: "01",
        term: "fall",
        year: 2026,
        instructor: "Test Instructor",
        meetingDays: ["M", "W"],
        startTime: "10:00",
        endTime: "10:50",
        location: "Test Hall 1",
        seatsTotal: 30,
        seatsOpen: 5,
        waitlist: 0,
      },
      {
        courseCode: PUBLISHED_COURSE,
        sectionNumber: WORKDAY_ONLY_SECTION,
        term: "fall",
        year: 2026,
        instructor: "Test Instructor",
        meetingDays: ["T", "R"],
        startTime: "11:00",
        endTime: "11:50",
        location: "Test Hall 2",
        seatsTotal: 30,
        seatsOpen: 0,
        waitlist: 4,
      },
    ]);

    const res = await request(app)
      .get(`/api/courses/${encodeURIComponent(PUBLISHED_COURSE)}/sections`)
      .query({ term: "fall", year: 2026 })
      .expect(200);
    const openSection = res.body.find((s: any) => s.sectionNumber === "01");
    expect(openSection.availabilityStatus).toBe("open");
    expect(openSection.seatsKnown).toBe(true);
    expect(openSection.sourceType).toBe("workday_self_paste");
    expect(new Date(openSection.lastUpdatedAt).getTime()).toBeGreaterThanOrEqual(before.getTime());

    // WORKDAY_ONLY_SECTION isn't in the official schedule at all — it only
    // appears via the Workday-only merge path, which exercises that second
    // code path (and its own availability derivation) distinctly.
    const waitlistSection = res.body.find((s: any) => s.sectionNumber === WORKDAY_ONLY_SECTION);
    expect(waitlistSection).toBeTruthy();
    expect(waitlistSection.availabilityStatus).toBe("waitlist");
    expect(waitlistSection.sourceType).toBe("workday_self_paste");
  });

  it("derives 'full' when seats are exhausted with no waitlist, using the real catalog course", async () => {
    await db.insert(courseSectionsTable).values({
      courseCode: PUBLISHED_COURSE,
      sectionNumber: "03",
      term: "fall",
      year: 2026,
      instructor: "Test Instructor",
      meetingDays: ["F"],
      startTime: "13:00",
      endTime: "13:50",
      location: "Test Hall 3",
      seatsTotal: 20,
      seatsOpen: 0,
      waitlist: 0,
    });
    const res = await request(app)
      .get(`/api/courses/${encodeURIComponent(PUBLISHED_COURSE)}/sections`)
      .query({ term: "fall", year: 2026 })
      .expect(200);
    const fullSection = res.body.find((s: any) => s.sectionNumber === "03");
    expect(fullSection.availabilityStatus).toBe("full");
  });
});
