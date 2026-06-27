import type { Term } from "./courses";
import rawOffered from "./offered-sections.json";

/**
 * Official SCU offered-section schedule, parsed from the Registrar's published
 * quarter schedules:
 *   - Fall 2026 Undergraduate Schedule (as of 5-7-2026) — definite, with
 *     section numbers and instructors.
 *   - Winter 2027 Tentative Schedule — tentative; subject/catalog/days/times
 *     only (no section numbers or instructors yet → numbered sequentially,
 *     instructor "TBA").
 *   - Spring 2027 Tentative Schedule — same tentative shape as Winter.
 *
 * These rows describe WHICH courses are being offered and WHEN. They do NOT
 * contain live seat counts — those come from the student's Workday paste-in
 * (course_sections DB table), which overlays availability on top of this
 * official schedule. See routes/courses.ts for the merge.
 */
export interface OfferedSection {
  courseCode: string;
  sectionNumber: string;
  term: Term;
  year: number;
  instructor: string;
  meetingDays: ("M" | "T" | "W" | "R" | "F" | "S" | "U")[];
  startTime: string;
  endTime: string;
  location: string;
  seatsTotal: number;
  seatsOpen: number;
  waitlist: number;
}

export const OFFERED_SECTIONS = rawOffered as OfferedSection[];

const byCode = new Map<string, OfferedSection[]>();
for (const s of OFFERED_SECTIONS) {
  const key = s.courseCode.toUpperCase().replace(/\s+/g, " ");
  const list = byCode.get(key);
  if (list) list.push(s);
  else byCode.set(key, [s]);
}

/** Tentative terms have no real section numbers or instructors yet. */
export function isTentativeTerm(term: string, year: number): boolean {
  return (term === "winter" || term === "spring") && year === 2027;
}

export function offeredSectionsFor(
  courseCode: string,
  term?: string,
  year?: number,
): OfferedSection[] {
  const key = courseCode.toUpperCase().replace(/\s+/g, " ");
  let list = byCode.get(key) ?? [];
  if (term) list = list.filter((s) => s.term === term);
  if (year !== undefined) list = list.filter((s) => s.year === year);
  return list;
}

/** Terms that have a published schedule, newest first. */
export const OFFERED_TERMS: { term: Term; year: number }[] = [
  { term: "fall", year: 2026 },
  { term: "winter", year: 2027 },
  { term: "spring", year: 2027 },
];
