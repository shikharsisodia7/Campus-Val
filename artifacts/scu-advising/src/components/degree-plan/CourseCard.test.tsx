// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndContext } from "@dnd-kit/core";
import {
  getListCourseSectionsQueryKey,
  PlanType,
  type CourseSection,
  type PlanItem,
  type ScheduleAvailability,
  type AcademicPlanDetail,
  type Term,
} from "@workspace/api-client-react";
import { CourseCard } from "./CourseCard";
import { DegreePlanProvider } from "./DegreePlanContext";
import type { CourseConflictDetail } from "./useTermCourseConflicts";

// ── Mock plan-item mutations so we capture mutate calls without real network ──
const mockUpdateMutate = vi.fn();
vi.mock("./usePlanItemMutations", () => ({
  useOptimisticUpdatePlanItem: () => ({
    mutate: mockUpdateMutate,
    isPending: false,
  }),
  useOptimisticDeletePlanItem: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const CURRENT_YEAR = 2026;
const CURRENT_TERM = "fall";
const TARGET_YEAR = 2026;
const TARGET_TERM = "winter";

function section(
  code: string,
  num: string,
  days: string[],
  start: string,
  end: string,
  term = CURRENT_TERM,
  year = CURRENT_YEAR,
): CourseSection {
  return {
    id: `${code.replace(/\s+/g, "-")}-${num}-${term}-${year}`,
    courseCode: code,
    sectionNumber: num,
    term: term as Term,
    year,
    instructor: "Staff",
    meetingDays: days as CourseSection["meetingDays"],
    startTime: start,
    endTime: end,
    location: "Somewhere 101",
    seatsTotal: 30,
    seatsOpen: 10,
  } as CourseSection;
}

function makePlanItem(id: number, code: string, term = CURRENT_TERM, year = CURRENT_YEAR): PlanItem {
  return {
    id,
    planId: 1,
    itemType: "course",
    courseCode: code,
    courseTitle: `${code} title`,
    units: 4,
    academicYear: year,
    term: term as Term,
    position: id,
  } as PlanItem;
}

function makeAvailability(
  terms: Array<{ year: number; term: string; status: "published" | "tentative"; offered: string[] }>,
): ScheduleAvailability {
  return {
    terms: terms.map(({ year, term, status, offered }) => ({
      year,
      term: term as Term,
      status,
      officialSectionCount: offered.length,
      syncedSectionCount: offered.length,
      offeredCourseCodes: offered,
    })),
    note: "test",
  };
}

function renderCard(opts: {
  item: PlanItem;
  conflicts: CourseConflictDetail[];
  sectionsByCode: Record<string, { term: string; year: number; sections: CourseSection[] }[]>;
  scheduleAvailability: ScheduleAvailability;
  planItems?: PlanItem[];
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });

  // Seed sections for every term/code combo so no real fetch fires.
  for (const [code, entries] of Object.entries(opts.sectionsByCode)) {
    for (const { term, year, sections } of entries) {
      queryClient.setQueryData(
        getListCourseSectionsQueryKey(code, { term: term as Term, year }),
        sections,
      );
    }
  }

  const plan: AcademicPlanDetail = {
    id: 1,
    name: "My Plan",
    planType: PlanType.degree,
    items: opts.planItems ?? [opts.item],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const ctx = {
    activePlan: plan,
    activePlanId: 1,
    setActivePlanId: () => {},
    profile: undefined,
    requirements: undefined,
    scheduleAvailability: opts.scheduleAvailability,
    catalog: undefined,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <DegreePlanProvider value={ctx}>
        <DndContext>
          <CourseCard
            item={opts.item}
            availableYears={[CURRENT_YEAR]}
            conflicts={opts.conflicts}
          />
        </DndContext>
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in tests"))),
  );
  mockUpdateMutate.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CourseCard — 'Move here' button in conflict popover", () => {
  it("shows a 'Move here' button for a fits suggestion and calls the update mutation on click", async () => {
    const item = makePlanItem(10, "CHEM 11", CURRENT_TERM, CURRENT_YEAR);

    // Current quarter: CHEM 11 clashes with MATH 11 (both MWF 8–9).
    // Target quarter: CHEM 11 has a Tuesday section — no planned courses there, fits.
    const conflict: CourseConflictDetail = {
      otherCode: "MATH 11",
      overlaps: [
        {
          aSection: "01",
          bSection: "01",
          aDays: ["M", "W", "F"],
          bDays: ["M", "W", "F"],
          aStart: "08:00",
          aEnd: "09:05",
          bStart: "08:00",
          bEnd: "09:05",
          sharedDays: ["M", "W", "F"],
          overlapStart: 480,
          overlapEnd: 545,
        },
      ],
    };

    renderCard({
      item,
      conflicts: [conflict],
      sectionsByCode: {
        // Target quarter sections for CHEM 11 (fits — unique time slot).
        "CHEM 11": [
          {
            term: TARGET_TERM,
            year: TARGET_YEAR,
            sections: [section("CHEM 11", "01", ["T", "R"], "10:00", "11:05", TARGET_TERM, TARGET_YEAR)],
          },
        ],
      },
      scheduleAvailability: makeAvailability([
        {
          year: CURRENT_YEAR,
          term: CURRENT_TERM,
          status: "published",
          offered: ["CHEM 11", "MATH 11"],
        },
        {
          year: TARGET_YEAR,
          term: TARGET_TERM,
          status: "published",
          offered: ["CHEM 11"],
        },
      ]),
    });

    // Open the conflict popover.
    const conflictNote = screen.getByTestId("time-conflict-note-10");
    fireEvent.click(conflictNote);

    // Wait for the quarter suggestions section to appear.
    const suggestionsContainer = await screen.findByTestId(
      `quarter-suggestions-10`,
    );
    expect(suggestionsContainer).toBeTruthy();

    // Wait for the Move here button on the fits suggestion.
    const moveBtn = await screen.findByTestId(
      `move-here-10-${TARGET_YEAR}-${TARGET_TERM}`,
    );
    expect(moveBtn).toBeTruthy();
    expect(moveBtn.textContent).toContain("Move here");

    // Click it and verify the optimistic update mutation fires with the right target.
    fireEvent.click(moveBtn);

    expect(mockUpdateMutate).toHaveBeenCalledOnce();
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        itemId: 10,
        data: expect.objectContaining({
          academicYear: TARGET_YEAR,
          term: TARGET_TERM,
        }),
      }),
    );
  });

  it("does not show a 'Move here' button for a no-fit suggestion", async () => {
    const item = makePlanItem(20, "CHEM 11", CURRENT_TERM, CURRENT_YEAR);

    const conflict: CourseConflictDetail = {
      otherCode: "MATH 11",
      overlaps: [
        {
          aSection: "01",
          bSection: "01",
          aDays: ["M", "W"],
          bDays: ["M", "W"],
          aStart: "09:00",
          aEnd: "10:05",
          bStart: "09:00",
          bEnd: "10:05",
          sharedDays: ["M", "W"],
          overlapStart: 540,
          overlapEnd: 605,
        },
      ],
    };

    // Target quarter: PHYS 10 is also planned there and clashes with CHEM 11.
    const targetItem = makePlanItem(21, "PHYS 10", TARGET_TERM, TARGET_YEAR);

    renderCard({
      item,
      conflicts: [conflict],
      planItems: [item, targetItem],
      sectionsByCode: {
        "CHEM 11": [
          {
            term: TARGET_TERM,
            year: TARGET_YEAR,
            // CHEM 11 only has MWF sections in the target quarter.
            sections: [section("CHEM 11", "01", ["M", "W", "F"], "08:00", "09:05", TARGET_TERM, TARGET_YEAR)],
          },
        ],
        "PHYS 10": [
          {
            term: TARGET_TERM,
            year: TARGET_YEAR,
            // PHYS 10 also MWF at the same time — blocks every CHEM 11 section.
            sections: [section("PHYS 10", "01", ["M", "W", "F"], "08:00", "09:05", TARGET_TERM, TARGET_YEAR)],
          },
        ],
      },
      scheduleAvailability: makeAvailability([
        {
          year: CURRENT_YEAR,
          term: CURRENT_TERM,
          status: "published",
          offered: ["CHEM 11", "MATH 11"],
        },
        {
          year: TARGET_YEAR,
          term: TARGET_TERM,
          status: "published",
          offered: ["CHEM 11", "PHYS 10"],
        },
      ]),
    });

    fireEvent.click(screen.getByTestId("time-conflict-note-20"));

    // Wait for suggestions to render.
    await screen.findByTestId("quarter-suggestions-20");

    // The no-fit suggestion should not have a Move here button.
    await waitFor(() => {
      expect(
        screen.queryByTestId(`move-here-20-${TARGET_YEAR}-${TARGET_TERM}`),
      ).toBeNull();
    });

    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });
});
