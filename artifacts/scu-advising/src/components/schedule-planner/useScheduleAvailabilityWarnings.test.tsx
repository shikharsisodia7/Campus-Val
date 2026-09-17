// @vitest-environment jsdom
/**
 * "When a scheduled current-quarter section becomes closed/full after
 * refresh, preserve the section on the schedule but visually flag it rather
 * than deleting it" (professor feedback, 2026-09). This hook never mutates
 * the schedule — it only reports which already-scheduled sections are no
 * longer open, from the same availability data QuickAddSearch renders.
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getListCourseSectionsQueryKey, type ScheduleEvent } from "@workspace/api-client-react";
import { useScheduleAvailabilityWarnings } from "./useScheduleAvailabilityWarnings";

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const makeEvent = (courseCode: string, sectionNumber: string): ScheduleEvent =>
  ({ id: `${courseCode}-${sectionNumber}`, kind: "section", courseCode, sectionNumber }) as unknown as ScheduleEvent;

describe("useScheduleAvailabilityWarnings", () => {
  it("flags a scheduled section that is now full or waitlisted, without touching the schedule", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = { term: "fall" as const, year: 2026 };
    queryClient.setQueryData(getListCourseSectionsQueryKey("CHEM 11", params), [
      { sectionNumber: "01", availabilityStatus: "full", lastUpdatedAt: "2026-09-16T00:00:00.000Z" },
    ]);

    const { result } = renderHook(
      () => useScheduleAvailabilityWarnings([makeEvent("CHEM 11", "01")], "fall", 2026),
      { wrapper: wrapper(queryClient) },
    );

    expect(result.current).toEqual([
      { courseCode: "CHEM 11", sectionNumber: "01", availabilityStatus: "full", lastUpdatedAt: "2026-09-16T00:00:00.000Z" },
    ]);
  });

  it("does not flag a section that is still open", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = { term: "fall" as const, year: 2026 };
    queryClient.setQueryData(getListCourseSectionsQueryKey("MATH 11", params), [
      { sectionNumber: "01", availabilityStatus: "open", lastUpdatedAt: "2026-09-16T00:00:00.000Z" },
    ]);

    const { result } = renderHook(
      () => useScheduleAvailabilityWarnings([makeEvent("MATH 11", "01")], "fall", 2026),
      { wrapper: wrapper(queryClient) },
    );

    expect(result.current).toEqual([]);
  });

  it("does not flag an unknown-status section — only a real, known degradation is ever surfaced", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = { term: "winter" as const, year: 2027 };
    queryClient.setQueryData(getListCourseSectionsQueryKey("MATH 36", params), [
      { sectionNumber: "1", availabilityStatus: "unknown", lastUpdatedAt: null },
    ]);

    const { result } = renderHook(
      () => useScheduleAvailabilityWarnings([makeEvent("MATH 36", "1")], "winter", 2027),
      { wrapper: wrapper(queryClient) },
    );

    expect(result.current).toEqual([]);
  });

  it("returns nothing when there is no active term/year yet", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useScheduleAvailabilityWarnings([makeEvent("CHEM 11", "01")], null, null),
      { wrapper: wrapper(queryClient) },
    );
    expect(result.current).toEqual([]);
  });
});
