import { useQueries } from "@tanstack/react-query";
import {
  getListCourseSectionsQueryOptions,
  type Term,
} from "@workspace/api-client-react";
import { sectionsAlwaysConflict } from "@/lib/conflicts";

/**
 * For a quarter with a published/tentative schedule, detect pairs of planned
 * courses whose EVERY offered-section combination overlaps in time — an
 * impossible pairing. Warn-only, and only when real schedule data proves it:
 * terms without a schedule, courses still loading, or sections with TBA
 * times never produce a warning.
 *
 * Returns a map of normalized course code → conflicting course codes.
 */
export function useTermCourseConflicts(
  courseCodes: string[],
  term: string,
  year: number,
  hasSchedule: boolean,
): Map<string, string[]> {
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

  const conflicts = new Map<string, string[]>();
  if (!hasSchedule || codes.length < 2) return conflicts;

  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = results[i];
      const b = results[j];
      // Only warn on real, loaded data — never guess.
      if (!a?.data || !b?.data) continue;
      if (sectionsAlwaysConflict(a.data, b.data)) {
        conflicts.set(codes[i]!, [...(conflicts.get(codes[i]!) ?? []), codes[j]!]);
        conflicts.set(codes[j]!, [...(conflicts.get(codes[j]!) ?? []), codes[i]!]);
      }
    }
  }
  return conflicts;
}
