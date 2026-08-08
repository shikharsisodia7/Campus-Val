import { useQueries } from "@tanstack/react-query";
import {
  getListCourseSectionsQueryOptions,
  type Term,
} from "@workspace/api-client-react";
import {
  sectionsAlwaysConflict,
  sectionOverlapDetails,
  type SectionOverlapDetail,
} from "@/lib/conflicts";

/** All conflicts of one course with another, with per-section-pair detail. */
export interface CourseConflictDetail {
  otherCode: string;
  overlaps: SectionOverlapDetail[]; // this course's sections first (a-side)
}

/**
 * For a quarter with a published/tentative schedule, detect pairs of planned
 * courses whose EVERY offered-section combination overlaps in time — an
 * impossible pairing. Warn-only, and only when real schedule data proves it:
 * terms without a schedule, courses still loading, or sections with TBA
 * times never produce a warning.
 *
 * Returns a map of normalized course code → conflict details (which courses
 * clash, and exactly which section times overlap).
 */
export function useTermCourseConflicts(
  courseCodes: string[],
  term: string,
  year: number,
  hasSchedule: boolean,
): Map<string, CourseConflictDetail[]> {
  const codes = Array.from(
    new Set(
      courseCodes.map((c) => c.toUpperCase().replace(/\s+/g, " ").trim()),
    ),
  );

  const params = { term: term as Term, year };
  const results = useQueries({
    queries: codes.map((code) => ({
      ...getListCourseSectionsQueryOptions(code, params),
      enabled: hasSchedule && codes.length > 1,
      staleTime: 60_000,
    })),
  });

  const conflicts = new Map<string, CourseConflictDetail[]>();
  if (!hasSchedule || codes.length < 2) return conflicts;

  const add = (code: string, detail: CourseConflictDetail) => {
    conflicts.set(code, [...(conflicts.get(code) ?? []), detail]);
  };

  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = results[i];
      const b = results[j];
      // Only warn on real, loaded data — never guess.
      if (!a?.data || !b?.data) continue;
      if (sectionsAlwaysConflict(a.data, b.data)) {
        add(codes[i]!, {
          otherCode: codes[j]!,
          overlaps: sectionOverlapDetails(a.data, b.data),
        });
        add(codes[j]!, {
          otherCode: codes[i]!,
          overlaps: sectionOverlapDetails(b.data, a.data),
        });
      }
    }
  }
  return conflicts;
}
