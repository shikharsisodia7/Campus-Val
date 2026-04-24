import rawCourses from "./courses-data.json";

export type Term = "fall" | "winter" | "spring" | "summer";

export interface CourseEntry {
  code: string;
  title: string;
  department: string;
  departmentName?: string;
  units: number;
  description: string;
  coreAreas: string[];
  offeredTerms: Term[];
  difficulty?: "easy" | "moderate" | "hard" | "very_hard";
  prereqLogic: string;
  prereqGroups: string[][];
  corequisites: string[];
  notes?: string;
  /**
   * If non-empty, only students in one of these SCU colleges may register
   * (matched against StudentProfile.college). Empty / omitted = open to all.
   */
  restrictedToColleges?: string[];
}

/**
 * Course catalog for SCU 2025-2026 undergraduate bulletin.
 *
 * Source: https://www.scu.edu/bulletin/undergraduate/ (chapters 3-5)
 * Scraped April 2026 from the public bulletin HTML. 2,300+ undergraduate
 * courses across all departments (Arts & Sciences, Business, Engineering).
 *
 * Limitations of this data:
 *   - SCU's bulletin does NOT publish per-quarter course offerings.
 *     Real schedules live behind Workday Student / Camino (gated). The
 *     `offeredTerms` field is set to ["fall","winter","spring"] for every
 *     course as a placeholder — verify in Workday before relying on it.
 *   - Prerequisite parsing is heuristic: we extract course codes mentioned
 *     in the bulletin's prerequisite sentence. The full English sentence is
 *     preserved in `prereqLogic` so the AI advisor and UI can reason about
 *     "C- or better", "with permission", etc.
 *   - 2026-2027 catalog has not been published yet (typically June 2026).
 *
 * Manual overrides (difficulty rating, core-area mapping) may be added
 * later from a separate hand-curated overlay; for now they're empty.
 */
const ENGR_PREFIXES = new Set(["CSEN", "ECEN", "MECH", "CENG", "BIOE", "ENGR", "AMTH"]);

export const COURSES: CourseEntry[] = (rawCourses as CourseEntry[]).map((c) => ({
  ...c,
  offeredTerms: c.offeredTerms as Term[],
  restrictedToColleges:
    c.restrictedToColleges && c.restrictedToColleges.length > 0
      ? c.restrictedToColleges
      : ENGR_PREFIXES.has(c.department)
      ? ["School of Engineering"]
      : undefined,
}));

export const COURSE_CATALOG_NOTE =
  "Course catalog from SCU 2025-2026 undergraduate bulletin (scraped from scu.edu/bulletin). Per-quarter section offerings, professors, and seat counts require Workday Student / Camino access — not in this dataset. The 2026-2027 bulletin publishes June 2026.";

export function findCourse(code: string): CourseEntry | undefined {
  const norm = code.toUpperCase().replace(/\s+/g, " ").trim();
  return COURSES.find(
    (c) => c.code.toUpperCase().replace(/\s+/g, " ") === norm,
  );
}

export function listDepartments(): { code: string; name: string; count: number }[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const c of COURSES) {
    const existing = counts.get(c.department);
    if (existing) existing.count++;
    else counts.set(c.department, { name: c.departmentName || c.department, count: 1 });
  }
  return Array.from(counts.entries())
    .map(([code, v]) => ({ code, name: v.name, count: v.count }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
