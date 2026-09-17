import { useQueries } from "@tanstack/react-query";
import {
  getListCourseSectionsQueryOptions,
  type Term,
  type ScheduleEvent,
} from "@workspace/api-client-react";

export interface AvailabilityWarning {
  courseCode: string;
  sectionNumber: string;
  availabilityStatus: "waitlist" | "full";
  lastUpdatedAt: string | null;
}

/**
 * "When a scheduled current-quarter section becomes closed/full after
 * refresh, preserve the section on the schedule but visually flag it rather
 * than deleting it" (professor feedback, 2026-09). This hook never removes
 * or modifies anything — it re-checks each scheduled section's CURRENT
 * availability against the same source QuickAddSearch uses and returns only
 * the ones that are no longer open, so the caller can render a warning.
 *
 * A future tentative term always reports "unknown" availability (see
 * lib/section-availability.ts on the server), which is intentionally never
 * included here — this only ever flags a real, known degradation.
 */
export function useScheduleAvailabilityWarnings(
  events: ScheduleEvent[],
  term: string | null | undefined,
  year: number | null | undefined,
): AvailabilityWarning[] {
  const sectionEvents = events.filter(
    (e): e is ScheduleEvent & { courseCode: string; sectionNumber: string } =>
      e.kind === "section" && !!e.courseCode && !!e.sectionNumber,
  );
  const codes = Array.from(
    new Set(
      sectionEvents.map((e) => e.courseCode.toUpperCase().replace(/\s+/g, " ").trim()),
    ),
  );

  const enabled = !!term && !!year && codes.length > 0;
  const params = { term: (term ?? "fall") as Term, year: year ?? 0 };
  const results = useQueries({
    queries: codes.map((code) => ({
      ...getListCourseSectionsQueryOptions(code, params),
      enabled,
      staleTime: 60_000,
    })),
  });

  if (!enabled) return [];

  const sectionsByCode = new Map<string, (typeof results)[number]["data"]>();
  codes.forEach((code, i) => sectionsByCode.set(code, results[i]?.data));

  const warnings: AvailabilityWarning[] = [];
  for (const event of sectionEvents) {
    const code = event.courseCode.toUpperCase().replace(/\s+/g, " ").trim();
    const sections = sectionsByCode.get(code);
    if (!sections) continue;
    const match = sections.find((s) => s.sectionNumber === event.sectionNumber);
    if (!match) continue;
    if (match.availabilityStatus === "waitlist" || match.availabilityStatus === "full") {
      warnings.push({
        courseCode: event.courseCode,
        sectionNumber: event.sectionNumber,
        availabilityStatus: match.availabilityStatus,
        lastUpdatedAt: match.lastUpdatedAt ?? null,
      });
    }
  }
  return warnings;
}
