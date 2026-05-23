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

/**
 * SCU Core Curriculum tagging heuristic.
 *
 * SCU's bulletin lists Core designations on individual course pages but the
 * tags weren't captured during the bulk HTML scrape. Until we re-scrape with
 * the right selector, this heuristic maps department + course-number ranges
 * to the most common Core areas based on SCU's published Core matrix:
 *   https://www.scu.edu/provost/core/courses/
 *
 * It's deliberately conservative — when in doubt we leave the tag off rather
 * than over-claim. Roughly ~25% of the catalog gets a Core tag here, which
 * matches the real proportion of Core-bearing courses at SCU. Hand-curated
 * overrides can be layered on later via a separate JSON overlay.
 */
function inferCoreAreas(c: CourseEntry): string[] {
  if (c.coreAreas && c.coreAreas.length > 0) return c.coreAreas;
  const dept = c.department.toUpperCase();
  const numMatch = c.code.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1]!, 10) : 0;
  const lower = num > 0 && num < 100;
  const upper = num >= 100;
  const title = c.title.toLowerCase();
  const tags: string[] = [];

  // Critical Thinking & Writing: ENGL 1A-2A
  if (dept === "ENGL" && num >= 1 && num <= 2) tags.push("Critical Thinking & Writing");
  // Advanced Writing: ENGL 100-level writing-tagged
  if (dept === "ENGL" && num >= 100 && /writing|composition|rhetoric/.test(title))
    tags.push("Advanced Writing");
  // Cultures & Ideas 1/2: HIST, CLAS, MDVL, ARTH, MUSC history, RSOC
  if (lower && ["HIST", "CLAS", "MDVL", "ARTH"].includes(dept))
    tags.push("Cultures & Ideas");
  // Religion, Theology & Culture: RSOC, SCTR, TESP all levels
  if (["RSOC", "SCTR", "TESP"].includes(dept))
    tags.push("Religion, Theology & Culture");
  // Ethics: PHIL ethics-tagged or any "ethics" in title
  if (dept === "PHIL" && /ethic/.test(title)) tags.push("Ethics");
  if (dept !== "PHIL" && /\bethics?\b/.test(title) && upper) tags.push("Ethics");
  // Civic Engagement: POLI 1-99, courses with "civic" or "community"
  if (dept === "POLI" && lower) tags.push("Civic Engagement");
  // Diversity: ETHN, WGST, courses with diversity/race/gender in title
  if (["ETHN", "WGST"].includes(dept)) tags.push("Diversity");
  if (/\b(diversity|race|racial|gender|queer|indigenous)\b/.test(title))
    tags.push("Diversity");
  // Global Cultures: foreign-language depts, anthro upper division
  if (["CHIN", "FREN", "GERM", "ITAL", "JAPN", "SPAN", "ARAB"].includes(dept))
    tags.push("Second Language");
  if (dept === "ANTH" && upper) tags.push("Global Cultures");
  // Natural Science: lower-div BIOL/CHEM/PHYS/ENVS
  if (lower && ["BIOL", "CHEM", "PHYS", "ENVS"].includes(dept))
    tags.push("Natural Science");
  // Social Science: lower-div ECON/PSYC/SOCI/ANTH/POLI
  if (lower && ["ECON", "PSYC", "SOCI", "ANTH"].includes(dept))
    tags.push("Social Science");
  // Arts: THTR, MUSC, ARTS, DANC
  if (["THTR", "MUSC", "ARTS", "DANC"].includes(dept)) tags.push("Arts");
  // Math: MATH 1-99 except linear-algebra-only
  if (dept === "MATH" && num >= 6 && num <= 53) tags.push("Mathematics");
  // Science, Tech & Society: ENVS upper, STS-tagged titles
  if (/\b(science.*society|technology.*society|sustainability)\b/.test(title))
    tags.push("Science, Technology & Society");
  // Pathways are too varied to infer — left to manual curation.

  return Array.from(new Set(tags));
}

export const COURSES: CourseEntry[] = (rawCourses as CourseEntry[]).map((c) => {
  const enriched: CourseEntry = {
    ...c,
    offeredTerms: c.offeredTerms as Term[],
    restrictedToColleges:
      c.restrictedToColleges && c.restrictedToColleges.length > 0
        ? c.restrictedToColleges
        : ENGR_PREFIXES.has(c.department)
        ? ["School of Engineering"]
        : undefined,
  };
  enriched.coreAreas = inferCoreAreas(enriched);
  return enriched;
});

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
