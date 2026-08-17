// @vitest-environment jsdom
/**
 * Multi-quarter Fall/Winter/Spring overview for Quarter Plan. Covers the
 * professor's requirements: an academic-year selector using the repo's
 * real year convention (Fall=anchor, Winter/Spring=anchor+1), Degree Plan
 * intentions surfaced per quarter, quarter-focus switching, and moving a
 * course between quarters without carrying its old exact section forward
 * or fabricating a new one.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type { AcademicPlanDetail, PlanItem, ScheduleAvailability } from "@workspace/api-client-react";

const mockUpdateMutate = vi.fn();
const mockListSchedules = vi.fn();
const mockGetSchedule = vi.fn();
const mockDeleteScheduleEvent = vi.fn();

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    listSchedules: (...args: any[]) => mockListSchedules(...args),
    getSchedule: (...args: any[]) => mockGetSchedule(...args),
    deleteScheduleEvent: (...args: any[]) => mockDeleteScheduleEvent(...args),
  };
});

vi.mock("@/components/degree-plan/usePlanItemMutations", () => ({
  useOptimisticUpdatePlanItem: () => ({ mutate: mockUpdateMutate }),
}));

import { AcademicYearOverview } from "./AcademicYearOverview";

function makeAvailability(): ScheduleAvailability {
  return {
    note: "test",
    terms: [
      { term: "fall" as any, year: 2026, status: "published", sourceUrl: "https://x", sourceLabel: "x", publishedDate: "2026-05-07", lastVerified: "2026-05-07", importedDate: "2026-05-07", freshness: "fresh", officialSectionCount: 0, syncedSectionCount: 0, offeredCourseCodes: [] } as any,
      { term: "winter" as any, year: 2027, status: "tentative", sourceUrl: "https://x", sourceLabel: "x", publishedDate: null, lastVerified: "2026-05-07", importedDate: "2026-05-07", freshness: "fresh", officialSectionCount: 0, syncedSectionCount: 0, offeredCourseCodes: [] } as any,
      { term: "spring" as any, year: 2027, status: "tentative", sourceUrl: "https://x", sourceLabel: "x", publishedDate: null, lastVerified: "2026-05-07", importedDate: "2026-05-07", freshness: "fresh", officialSectionCount: 0, syncedSectionCount: 0, offeredCourseCodes: [] } as any,
    ],
  };
}

function makeItem(id: number, code: string, term: string, year: number): PlanItem {
  return {
    id,
    planId: 1,
    itemType: "course",
    courseCode: code,
    courseTitle: `${code} title`,
    units: 4,
    academicYear: year,
    term: term as any,
    position: id,
  } as PlanItem;
}

function makePlan(items: PlanItem[]): AcademicPlanDetail {
  return {
    id: 1,
    name: "Degree Plan",
    planType: "degree" as any,
    items,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as AcademicPlanDetail;
}

function renderOverview(opts: {
  items: PlanItem[];
  focusedTerm?: string | null;
  focusedYear?: number | null;
  onFocusQuarter?: (term: any, year: number) => void;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onFocusQuarter = opts.onFocusQuarter ?? vi.fn();
  render(
    <QueryClientProvider client={client}>
      <AcademicYearOverview
        activePlan={makePlan(opts.items)}
        focusedTerm={(opts.focusedTerm ?? "fall") as any}
        focusedYear={opts.focusedYear ?? 2026}
        onFocusQuarter={onFocusQuarter}
        availability={makeAvailability()}
      />
    </QueryClientProvider>,
  );
  return { onFocusQuarter };
}

beforeEach(() => {
  mockUpdateMutate.mockClear();
  mockListSchedules.mockReset().mockResolvedValue({ schedules: [] });
  mockGetSchedule.mockReset();
  mockDeleteScheduleEvent.mockReset();
});

afterEach(() => cleanup());

describe("AcademicYearOverview", () => {
  it("uses the real Fall=anchor / Winter,Spring=anchor+1 year convention", () => {
    renderOverview({
      items: [
        makeItem(1, "CSEN 10", "fall", 2026),
        makeItem(2, "MATH 12", "winter", 2027),
        makeItem(3, "PHYS 32", "spring", 2027),
      ],
    });
    expect(screen.getByTestId("year-overview-fall").textContent).toContain("CSEN 10");
    expect(screen.getByTestId("year-overview-winter").textContent).toContain("MATH 12");
    expect(screen.getByTestId("year-overview-spring").textContent).toContain("PHYS 32");
  });

  it("does not leak a course from a different academic year into the overview", () => {
    renderOverview({
      items: [
        makeItem(1, "CSEN 10", "fall", 2026),
        // Same "winter" term but a different (wrong) year — must not show.
        makeItem(2, "MATH 12", "winter", 2026),
      ],
    });
    expect(screen.getByTestId("year-overview-fall").textContent).toContain("CSEN 10");
    expect(screen.getByTestId("year-overview-winter").textContent).not.toContain("MATH 12");
  });

  it("marks the currently-focused quarter and lets the user focus another one via an explicit button (not drag-only)", () => {
    const { onFocusQuarter } = renderOverview({ items: [], focusedTerm: "fall", focusedYear: 2026 });
    expect(screen.getByTestId("year-overview-fall").textContent).toContain("Focused");

    fireEvent.click(screen.getByTestId("focus-quarter-winter"));
    expect(onFocusQuarter).toHaveBeenCalledWith("winter", 2027);
  });

  it("moves a course to another quarter and clears its old exact section, without inventing a new one", async () => {
    mockListSchedules.mockResolvedValue({ schedules: [{ id: 55, name: "Plan A" }] });
    mockGetSchedule.mockResolvedValue({
      id: 55,
      events: [
        { id: 900, kind: "section", courseCode: "CSEN 10", sectionNumber: "01" },
        { id: 901, kind: "commitment", name: "Work shift" },
      ],
    });

    renderOverview({
      items: [makeItem(1, "CSEN 10", "fall", 2026)],
      focusedTerm: "fall",
      focusedYear: 2026,
    });

    fireEvent.click(screen.getByTestId("overview-move-1-to-winter"));

    // Degree Plan intention moves to Winter 2027 — no fabricated section data.
    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith({
        id: 1,
        itemId: 1,
        data: { academicYear: 2027, term: "winter" },
      });
    });

    // The old Fall section for this course is cleared...
    await waitFor(() => {
      expect(mockDeleteScheduleEvent).toHaveBeenCalledWith(55, 900);
    });
    // ...but an unrelated commitment event on the same schedule is untouched.
    expect(mockDeleteScheduleEvent).not.toHaveBeenCalledWith(55, 901);
    // listSchedules was queried against the OLD quarter (Fall 2026), not the new one.
    expect(mockListSchedules).toHaveBeenCalledWith({ term: "fall", year: 2026 });
  });
});
