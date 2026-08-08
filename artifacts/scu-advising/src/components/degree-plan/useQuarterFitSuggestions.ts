import { useQueries } from "@tanstack/react-query";
import {
  getListCourseSectionsQueryOptions,
  type PlanItem,
  type ScheduleAvailability,
  type Term,
} from "@workspace/api-client-react";
import {
  hasProvenConflictFreeSection,
  provenNoSectionFits,
  type SectionTimeLike,
} from "@/lib/conflicts";

export type QuarterFitStatus =
  | "fits" // a section combination provably conflict-free with planned courses
  | "no-fit" // offered, but every section provably clashes with a planned course
  | "unverified" // offered, but times TBA/incomplete — can't prove either way
  | "not-offered" // has a schedule, course absent from it
  | "checking"; // section data still loading

export interface QuarterFitSuggestion {
  year: number;
  term: string;
  scheduleStatus: "published" | "tentative";
  status: QuarterFitStatus;
  plannedCount: number; // courses already planned in that quarter
}

const norm = (c: string) => c.toUpperCase().replace(/\s+/g, " ").trim();

/**
 * For a course that can't fit in its current quarter, evaluate every OTHER
 * quarter that has a published/tentative schedule: is the course offered
 * there, and does at least one of its sections provably avoid clashing with
 * the courses already planned in that quarter?
 *
 * Uses only real offered-section data. Quarters without a schedule are not
 * returned — the caller labels them unknown. Nothing is ever guessed:
 * TBA times yield "unverified", never "fits".
 */
export function useQuarterFitSuggestions(
  courseCode: string,
  currentYear: number,
  currentTerm: string,
  planItems: PlanItem[] | undefined,
  scheduleAvailability: ScheduleAvailability | undefined,
  enabled: boolean,
): QuarterFitSuggestion[] {
  const code = norm(courseCode);

  const candidates = (scheduleAvailability?.terms ?? [])
    .filter((t) => !(t.year === currentYear && t.term === currentTerm))
    .map((t) => {
      const offered = (t.offeredCourseCodes ?? []).map(norm).includes(code);
      const plannedCodes = offered
        ? Array.from(
            new Set(
              (planItems ?? [])
                .filter(
                  (i) =>
                    i.itemType === "course" &&
                    !!i.courseCode &&
                    i.academicYear === t.year &&
                    i.term === t.term &&
                    norm(i.courseCode) !== code,
                )
                .map((i) => norm(i.courseCode!)),
            ),
          )
        : [];
      return { t, offered, codes: offered ? [code, ...plannedCodes] : [] };
    });

  const flat = candidates.flatMap((c) =>
    c.codes.map((cc) => ({ code: cc, term: c.t.term, year: c.t.year })),
  );

  const results = useQueries({
    queries: flat.map((q) => ({
      ...getListCourseSectionsQueryOptions(q.code, {
        term: q.term as Term,
        year: q.year,
      }),
      enabled,
      staleTime: 60_000,
    })),
  });

  let cursor = 0;
  return candidates.map(({ t, offered, codes }) => {
    const base = {
      year: t.year,
      term: t.term as string,
      scheduleStatus: t.status,
      plannedCount: codes.length > 0 ? codes.length - 1 : 0,
    };
    if (!offered) {
      return { ...base, status: "not-offered" as const };
    }
    const slice = results.slice(cursor, cursor + codes.length);
    cursor += codes.length;
    if (slice.some((r) => !r?.data)) {
      return { ...base, status: "checking" as const };
    }
    const courseSections = slice[0]!.data!;
    const plannedSections = slice.slice(1).map((r) => r!.data!);
    return { ...base, status: classifyQuarterFit(courseSections, plannedSections) };
  });
}

/**
 * Pure classification of a candidate quarter once all section data is
 * loaded. "fits" and "no-fit" are only ever claimed on provable evidence;
 * anything unprovable (TBA/invalid times) is "unverified".
 */
export function classifyQuarterFit(
  courseSections: SectionTimeLike[],
  plannedSections: SectionTimeLike[][],
): "fits" | "no-fit" | "unverified" {
  if (hasProvenConflictFreeSection(courseSections, plannedSections)) {
    return "fits";
  }
  // Provably impossible when EVERY course section is blocked by some planned
  // course — including different sections blocked by different courses.
  if (provenNoSectionFits(courseSections, plannedSections)) {
    return "no-fit";
  }
  return "unverified";
}
