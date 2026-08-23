import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, courseSectionsTable } from "@workspace/db";
import { COURSES, findCourse } from "../data/courses";
import {
  offeredSectionsFor,
  isTentativeTerm,
} from "../data/offered-sections";
import {
  classifySection,
  requiredComponentsFor,
  type ComponentType,
} from "../lib/course-components";

const router: IRouter = Router();

router.get("/courses", (req, res) => {
  const search = (req.query.search as string | undefined)?.toLowerCase().trim();
  const department = (req.query.department as string | undefined)
    ?.toLowerCase()
    .trim();
  const coreParam = req.query.core;
  const coreOnly = coreParam === "true" || coreParam === "1";

  let result = COURSES.slice();
  if (search) {
    result = result.filter(
      (c) =>
        c.code.toLowerCase().includes(search) ||
        c.title.toLowerCase().includes(search) ||
        c.description.toLowerCase().includes(search),
    );
  }
  if (department) {
    result = result.filter((c) => c.department.toLowerCase() === department);
  }
  if (coreOnly) {
    result = result.filter((c) => c.coreAreas.length > 0);
  }
  res.json(
    result.map((c) => ({
      code: c.code,
      title: c.title,
      department: c.department,
      units: c.units,
      description: c.description,
      coreAreas: c.coreAreas,
      offeredTerms: c.offeredTerms,
      difficulty: c.difficulty ?? null,
      restrictedToColleges: c.restrictedToColleges ?? [],
    })),
  );
});

router.get("/courses/:code/sections", async (req, res) => {
  const course = findCourse(req.params.code);
  if (!course) return res.status(404).json({ error: "Course not found" });

  const VALID_TERMS = new Set(["fall", "winter", "spring", "summer"]);
  const termRaw = req.query.term as string | undefined;
  const term =
    termRaw && VALID_TERMS.has(termRaw) ? termRaw : undefined;
  const yearRaw = req.query.year as string | undefined;
  let year: number | undefined;
  if (yearRaw !== undefined) {
    const n = Number(yearRaw);
    if (Number.isInteger(n) && n >= 2024 && n <= 2030) year = n;
  }

  const matchedCode = course.code.toUpperCase().replace(/\s+/g, " ");

  // Base: official Registrar schedule (Fall 2026 / Winter+Spring 2027).
  const official = offeredSectionsFor(matchedCode, term, year);

  // Overlay: live seat counts pasted in from the student's Workday session.
  const conds = [eq(courseSectionsTable.courseCode, matchedCode)];
  if (term) conds.push(eq(courseSectionsTable.term, term));
  if (year !== undefined) conds.push(eq(courseSectionsTable.year, year));
  const workday = await db
    .select()
    .from(courseSectionsTable)
    .where(and(...conds));
  const seatsBy = new Map<string, (typeof workday)[number]>();
  for (const w of workday) {
    seatsBy.set(`${w.sectionNumber}|${w.term}|${w.year}`, w);
  }

  type OutSection = {
    id: string;
    courseCode: string;
    sectionNumber: string;
    term: string;
    year: number;
    instructor: string;
    meetingDays: string[];
    startTime: string;
    endTime: string;
    location: string;
    seatsTotal: number;
    seatsOpen: number;
    waitlist: number;
    seatsKnown: boolean;
    tentative: boolean;
    /**
     * Lecture / lab / recitation, inferred from the published meeting
     * pattern (SCU publishes no component column). `componentInferred`
     * stays true so the UI never presents this as a Registrar field.
     */
    componentType: ComponentType;
    componentInferred: boolean;
  };

  const out: OutSection[] = official.map((s) => {
    const live = seatsBy.get(`${s.sectionNumber}|${s.term}|${s.year}`);
    const seatsTotal = live?.seatsTotal ?? s.seatsTotal;
    const seatsOpen = live?.seatsOpen ?? s.seatsOpen;
    const waitlist = live?.waitlist ?? s.waitlist;
    const meetingDays = (
      live?.meetingDays?.length ? live.meetingDays : s.meetingDays
    ) as string[];
    const startTime = s.startTime || live?.startTime || "";
    const endTime = s.endTime || live?.endTime || "";
    const component = classifySection({
      courseCode: s.courseCode,
      meetingDays,
      startTime,
      endTime,
    });
    return {
      id: `${s.courseCode}-${s.sectionNumber}-${s.term}-${s.year}`,
      courseCode: s.courseCode,
      sectionNumber: s.sectionNumber,
      term: s.term,
      year: s.year,
      instructor: live?.instructor || s.instructor,
      meetingDays: live?.meetingDays?.length ? live.meetingDays : s.meetingDays,
      startTime: s.startTime || live?.startTime || "",
      endTime: s.endTime || live?.endTime || "",
      location: live?.location || s.location,
      seatsTotal,
      seatsOpen,
      waitlist,
      seatsKnown: seatsTotal > 0 || waitlist > 0,
      tentative: isTentativeTerm(s.term, s.year),
      componentType: component.componentType,
      componentInferred: component.inferred,
    };
  });

  // Include any Workday-synced sections that aren't in the official schedule.
  const officialKeys = new Set(
    official.map((s) => `${s.sectionNumber}|${s.term}|${s.year}`),
  );
  for (const w of workday) {
    const k = `${w.sectionNumber}|${w.term}|${w.year}`;
    if (officialKeys.has(k)) continue;
    out.push({
      id: `${w.courseCode}-${w.sectionNumber}-${w.term}-${w.year}`,
      courseCode: w.courseCode,
      sectionNumber: w.sectionNumber,
      term: w.term,
      year: w.year,
      instructor: w.instructor,
      meetingDays: w.meetingDays,
      startTime: w.startTime,
      endTime: w.endTime,
      location: w.location,
      seatsTotal: w.seatsTotal,
      seatsOpen: w.seatsOpen,
      waitlist: w.waitlist,
      seatsKnown: w.seatsTotal > 0 || w.waitlist > 0,
      tentative: isTentativeTerm(w.term, w.year),
      componentType: classifySection({
        courseCode: w.courseCode,
        meetingDays: w.meetingDays as string[],
        startTime: w.startTime,
        endTime: w.endTime,
      }).componentType,
      componentInferred: true,
    });
  }

  res.json(out);
});

router.get("/courses/:code", (req, res) => {
  const course = findCourse(req.params.code);
  if (!course) return res.status(404).json({ error: "Course not found" });
  res.json({
    code: course.code,
    title: course.title,
    department: course.department,
    units: course.units,
    description: course.description,
    coreAreas: course.coreAreas,
    offeredTerms: course.offeredTerms,
    difficulty: course.difficulty ?? null,
    restrictedToColleges: course.restrictedToColleges ?? [],
    prereqLogic: course.prereqLogic,
    prereqGroups: course.prereqGroups,
    corequisites: course.corequisites,
    notes: course.notes ?? null,
    // Separately-scheduled components this course has, per the bulletin
    // text. Drives the "you still need a lab" hint in Quarter Plan.
    requiredComponents: requiredComponentsFor(course.code),
  });
});

export default router;
