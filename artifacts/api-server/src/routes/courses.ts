import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, courseSectionsTable } from "@workspace/db";
import { COURSES, findCourse } from "../data/courses";
import {
  offeredSectionsFor,
  isTentativeTerm,
} from "../data/offered-sections";
import { requiredComponentsFor } from "../lib/course-components";
import { courseTermSections } from "../lib/term-sections";
import { getAvailabilityService, sectionKey, type ResolvedAvailability } from "../lib/availability";

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

type Term = "fall" | "winter" | "spring" | "summer";
const VALID_TERMS = new Set<string>(["fall", "winter", "spring", "summer"]);

/** Every (term, year) a sections request covers for one course. */
async function termKeysFor(
  matchedCode: string,
  term: Term | undefined,
  year: number | undefined,
): Promise<Map<string, { term: Term; year: number }>> {
  const termKeys = new Map<string, { term: Term; year: number }>();
  for (const s of offeredSectionsFor(matchedCode, term, year)) {
    termKeys.set(`${s.term}|${s.year}`, { term: s.term as Term, year: s.year });
  }
  if (term && year !== undefined) termKeys.set(`${term}|${year}`, { term, year });
  // Terms CampusVal only knows about from a Workday paste.
  const pasted = await db
    .selectDistinct({ term: courseSectionsTable.term, year: courseSectionsTable.year })
    .from(courseSectionsTable)
    .where(
      and(
        eq(courseSectionsTable.courseCode, matchedCode),
        ...(term ? [eq(courseSectionsTable.term, term)] : []),
        ...(year !== undefined ? [eq(courseSectionsTable.year, year)] : []),
      ),
    );
  for (const p of pasted) {
    if (VALID_TERMS.has(p.term)) termKeys.set(`${p.term}|${p.year}`, { term: p.term as Term, year: p.year });
  }
  return termKeys;
}

/**
 * GET /courses/:code/sections
 *
 * Base rows are the official Registrar schedule (what is offered, when, who
 * teaches it). Availability is layered on by the availability service
 * (lib/availability): live provider -> dev fixture -> manual paste snapshot ->
 * unknown. This handler never decides open/full itself and never sees a
 * Workday payload; if the live feed is down the service answers `unknown`
 * and planning continues.
 *
 * Each section carries its COMPONENT (lecture / lab / discussion /
 * recitation), classified per term by lib/course-components — the same rule
 * for every course.
 */
router.get("/courses/:code/sections", async (req, res) => {
  const course = findCourse(req.params.code);
  if (!course) return res.status(404).json({ error: "Course not found" });

  const termRaw = req.query.term as string | undefined;
  const term = termRaw && VALID_TERMS.has(termRaw) ? (termRaw as Term) : undefined;
  const yearRaw = req.query.year as string | undefined;
  let year: number | undefined;
  if (yearRaw !== undefined) {
    const n = Number(yearRaw);
    if (Number.isInteger(n) && n >= 2024 && n <= 2030) year = n;
  }

  const matchedCode = course.code.toUpperCase().replace(/\s+/g, " ");
  const termKeys = await termKeysFor(matchedCode, term, year);

  const UNKNOWN: ResolvedAvailability = {
    availabilityStatus: "unknown",
    lastUpdatedAt: null,
    sourceType: "registrar_schedule",
    sourceLabel: "SCU Registrar schedule (no live seat data)",
    isLive: false,
    freshness: "unavailable",
  };

  // Terms are independent: fetch them concurrently so a slow upstream costs one
  // timeout for the request, not one per term.
  const perTerm = await Promise.all(
    [...termKeys.values()].map((t) => courseTermSections(matchedCode, t.term, t.year)),
  );

  const out = perTerm.flatMap(({ sections, availability }) =>
    sections.map((s) => {
      const avail = availability.bySection.get(sectionKey(s.courseCode, s.sectionNumber));
      const rec = avail?.record;
      // Seat numbers are only exposed when the status itself is trusted: a
      // stale snapshot's counts must not be shown as if they were current.
      const trusted = !!avail && avail.availabilityStatus !== "unknown";
      const resolved = avail ?? UNKNOWN;
      return {
        id: `${s.courseCode}-${s.sectionNumber}-${s.term}-${s.year}`,
        courseCode: s.courseCode,
        sectionNumber: s.sectionNumber,
        term: s.term,
        year: s.year,
        instructor: s.instructor,
        meetingDays: s.meetingDays,
        startTime: s.startTime,
        endTime: s.endTime,
        location: s.location,
        seatsTotal: trusted ? (rec?.capacity ?? 0) : 0,
        seatsOpen: trusted ? (rec?.seatsAvailable ?? 0) : 0,
        waitlist: trusted ? (rec?.waitlistCount ?? 0) : 0,
        seatsKnown: trusted,
        tentative: isTentativeTerm(s.term, s.year),
        componentType: s.classification.componentType,
        componentInferred: s.classification.inferred,
        componentSourceLabel: s.classification.sourceLabel,
        availabilityStatus: resolved.availabilityStatus,
        lastUpdatedAt: resolved.lastUpdatedAt,
        sourceType: resolved.sourceType,
        sourceLabel: resolved.sourceLabel,
        isLive: resolved.isLive,
        freshness: resolved.freshness,
      };
    }),
  );

  res.json(out);
});

/**
 * GET /courses/:code/components?term=&year=
 *
 * Which components this course needs in ONE term, and whether that term's
 * schedule lists sections for each. `sectionsPublished: false` means the course
 * needs the component but no source lists a section for it yet (the Registrar's
 * tentative schedules list lectures only) — CampusVal does not invent one.
 */
router.get("/courses/:code/components", async (req, res) => {
  const course = findCourse(String(req.params.code));
  if (!course) return res.status(404).json({ error: "Course not found" });
  const term = req.query.term as string | undefined;
  const year = Number(req.query.year);
  if (!term || !VALID_TERMS.has(term) || !Number.isInteger(year) || year < 2024 || year > 2030) {
    return res.status(400).json({ error: "term (fall|winter|spring|summer) and year are required" });
  }
  const { plan, sections } = await courseTermSections(course.code, term as Term, year);
  res.json({
    courseCode: plan.courseCode,
    term,
    year,
    tentative: isTentativeTerm(term, year),
    offered: sections.length > 0,
    multiComponent: plan.multiComponent,
    components: plan.components,
  });
});

/**
 * GET /section-availability/status?term=&year=
 *
 * What the section picker's header may truthfully say about seat data for a
 * term — "Live · updated 1 min ago", "Live availability is not connected",
 * "Availability currently unavailable" — without exposing anything about the
 * upstream (no URL, credential or error detail).
 */
router.get("/section-availability/status", async (req, res) => {
  const term = req.query.term as string | undefined;
  const year = Number(req.query.year);
  if (!term || !VALID_TERMS.has(term) || !Number.isInteger(year) || year < 2024 || year > 2030) {
    return res.status(400).json({ error: "term (fall|winter|spring|summer) and year are required" });
  }
  const service = getAvailabilityService();
  const ta = await service.getTermAvailability(term as Term, year);

  const counts = { open: 0, waitlist: 0, full: 0, unknown: 0 };
  for (const a of ta.bySection.values()) counts[a.availabilityStatus] += 1;
  const known = counts.open + counts.waitlist + counts.full;

  // Overall banner state, most-trustworthy first.
  let state: "live" | "cached" | "stale" | "unavailable" | "not_connected" | "sample" | "manual_snapshot";
  if (ta.live.state === "live" || ta.live.state === "cached" || ta.live.state === "stale") state = ta.live.state;
  else if (ta.live.state === "unavailable") state = "unavailable";
  else if (ta.fixtureActive) state = "sample";
  else if (known > 0) state = "manual_snapshot";
  else state = "not_connected";

  res.json({
    term,
    year,
    state,
    liveConfigured: service.liveConfigured,
    lastUpdatedAt: ta.live.lastUpdatedAt,
    sectionsWithKnownAvailability: known,
    counts,
  });
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
