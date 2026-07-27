/**
 * Advanced course search: text + Core-area attribute filtering with explicit
 * ALL/ANY match modes and honest, distinct zero-result states.
 *
 * Pure logic (no Express, no DB) so it can be unit-tested directly.
 */
import type { CourseEntry } from "../data/courses";

export type MatchMode = "all" | "any";

export type CourseSearchState =
  | "results"
  | "no_matching_courses"
  | "no_sections_this_quarter";

export interface CourseSearchArgs {
  q?: string;
  coreAreas?: string[];
  matchMode?: MatchMode;
  /** courseCode -> section count for the selected quarter (omit = no quarter filter) */
  sectionCounts?: Map<string, number>;
  limit?: number;
}

export interface CourseSearchHit {
  code: string;
  title: string;
  units: number;
  description: string;
  coreAreas: string[];
  sectionsThisQuarter: number | null;
}

export interface CourseSearchOutcome {
  state: CourseSearchState;
  totalMatching: number;
  courses: CourseSearchHit[];
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchesAttributes(
  courseAreas: string[],
  wanted: string[],
  mode: MatchMode,
): boolean {
  if (wanted.length === 0) return true;
  const have = new Set(courseAreas.map(norm));
  const hits = wanted.filter((w) => have.has(norm(w)));
  return mode === "all" ? hits.length === wanted.length : hits.length > 0;
}

export function searchCourses(
  catalog: CourseEntry[],
  args: CourseSearchArgs,
): CourseSearchOutcome {
  const q = args.q ? norm(args.q) : "";
  const wanted = (args.coreAreas ?? []).filter((a) => a.trim().length > 0);
  const mode: MatchMode = args.matchMode === "any" ? "any" : "all";
  const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);

  let matches = catalog.filter((c) =>
    matchesAttributes(c.coreAreas ?? [], wanted, mode),
  );
  if (q) {
    const qCode = q.toUpperCase();
    matches = matches.filter(
      (c) =>
        norm(c.code).includes(q) ||
        norm(c.code).replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
        norm(c.title).includes(q) ||
        norm(c.description).includes(q),
    );
    // Rank: exact/prefix code matches first, then title matches.
    matches = matches
      .map((c) => {
        const code = c.code.toUpperCase();
        let rank = 3;
        if (code === qCode) rank = 0;
        else if (code.startsWith(qCode) || code.replace(/\s/g, "").startsWith(qCode.replace(/\s/g, ""))) rank = 1;
        else if (norm(c.title).includes(q)) rank = 2;
        return { c, rank };
      })
      .sort((a, b) => a.rank - b.rank || a.c.code.localeCompare(b.c.code))
      .map((x) => x.c);
  } else {
    matches = matches.slice().sort((a, b) => a.code.localeCompare(b.code));
  }

  const totalMatching = matches.length;
  if (totalMatching === 0) {
    return { state: "no_matching_courses", totalMatching: 0, courses: [] };
  }

  const counts = args.sectionCounts;
  let visible = matches;
  let state: CourseSearchState = "results";
  if (counts) {
    const withSections = matches.filter(
      (c) => (counts.get(c.code.toUpperCase()) ?? 0) > 0,
    );
    if (withSections.length === 0) {
      // Matching courses exist, but none has sections in the selected quarter.
      return {
        state: "no_sections_this_quarter",
        totalMatching,
        courses: matches.slice(0, limit).map((c) => hit(c, 0)),
      };
    }
    visible = withSections;
  }

  return {
    state,
    totalMatching,
    courses: visible
      .slice(0, limit)
      .map((c) =>
        hit(c, counts ? (counts.get(c.code.toUpperCase()) ?? 0) : null),
      ),
  };
}

function hit(c: CourseEntry, sections: number | null): CourseSearchHit {
  return {
    code: c.code,
    title: c.title,
    units: c.units,
    description: c.description,
    coreAreas: c.coreAreas ?? [],
    sectionsThisQuarter: sections,
  };
}
