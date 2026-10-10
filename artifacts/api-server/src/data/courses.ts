import rawCourses from "./courses-data.json";
import codeAliases from "./course-code-aliases.json";
import { deriveCoreAreas, type CoreAreaTagSource } from "./core-areas";

export type Term = "fall" | "winter" | "spring" | "summer";

export interface CourseEntry {
  code: string;
  title: string;
  department: string;
  departmentName?: string;
  units: number;
  description: string;
  coreAreas: string[];
  /**
   * Where each `coreAreas` tag came from: "catalog_text" (the bulletin text
   * states it — see `coreAreaEvidence`) or "heuristic" (department/number
   * inference; students are told to confirm). Derived at load; see
   * data/core-areas.ts for the canonical definitions.
   */
  coreAreaSources?: Record<string, CoreAreaTagSource>;
  /** For catalog_text tags, the bulletin sentence that states the designation. */
  coreAreaEvidence?: Record<string, string>;
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
 * SCU Core Curriculum tagging now lives in data/core-areas.ts (the canonical
 * definitions, aliases, and the evidence + heuristic derivation). It combines
 * designations the bulletin text states outright with the original
 * department/number heuristic, and records which is which.
 */
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
  const derived = deriveCoreAreas(enriched);
  enriched.coreAreas = derived.areas;
  enriched.coreAreaSources = derived.sources;
  enriched.coreAreaEvidence = derived.evidence;
  return enriched;
});

export const COURSE_CATALOG_NOTE =
  "Course catalog from SCU 2025-2026 undergraduate bulletin (scraped from scu.edu/bulletin). Per-quarter section offerings, professors, and seat counts require Workday Student / Camino access — not in this dataset. The 2026-2027 bulletin publishes June 2026.";

/**
 * Codes the 2025-26 catalog snapshot filed under a stale subject, mapped to the code the 2026-27
 * Undergraduate Bulletin lists ("RSOC 15" -> "SCTR 15", "WGST 101" -> "GNSX 101"). Written by
 * scripts/import-bulletin-courses.ts; a plan, profile or note that saved the old code still resolves.
 */
const CODE_ALIASES: Readonly<Record<string, string>> = codeAliases;

/** The catalog's current code for a course code, following a stale-subject alias when there is one. */
export function canonicalCourseCode(code: string): string {
  const norm = code.toUpperCase().replace(/\s+/g, " ").trim();
  return CODE_ALIASES[norm] ?? norm;
}

export function findCourse(code: string): CourseEntry | undefined {
  const norm = canonicalCourseCode(code);
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
