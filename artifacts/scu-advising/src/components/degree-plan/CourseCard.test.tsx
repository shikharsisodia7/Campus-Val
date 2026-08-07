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

describe("CourseCard — quarter suggestions per-quarter statuses in conflict popover", () => {
  it("renders correct status labels for fits/no-fit/unverified/not-offered quarters", async () => {
    // Current quarter: CHEM 11 clashes with MATH 11 (MWF overlap).
    const item = makePlanItem(30, "CHEM 11", CURRENT_TERM, CURRENT_YEAR);
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

    // Target quarters:
    //   winter 2026 — CHEM 11 offered, TR section, quarter empty → "fits" (empty quarter)
    //   spring 2026 — CHEM 11 offered, MWF section; PHYS 10 also planned MWF same time → "no-fit"
    //   summer 2026 — CHEM 11 offered, but TBA times → "unverified"
    //   winter 2027 — CHEM 11 NOT in offeredCourseCodes → "not-offered"
    const springItem = makePlanItem(31, "PHYS 10", "spring", CURRENT_YEAR);

    renderCard({
      item,
      conflicts: [conflict],
      planItems: [item, springItem],
      sectionsByCode: {
        // winter 2026: conflict-free section — "fits", empty quarter
        "CHEM 11": [
          { term: "winter", year: CURRENT_YEAR, sections: [section("CHEM 11", "01", ["T", "R"], "10:00", "11:05", "winter", CURRENT_YEAR)] },
          // spring 2026: only MWF section
          { term: "spring", year: CURRENT_YEAR, sections: [section("CHEM 11", "01", ["M", "W", "F"], "08:00", "09:05", "spring", CURRENT_YEAR)] },
          // summer 2026: TBA times → "unverified"
          { term: "summer", year: CURRENT_YEAR, sections: [{ ...section("CHEM 11", "01", [], "", "", "summer", CURRENT_YEAR), meetingDays: [], startTime: null as any, endTime: null as any }] },
        ],
        // spring 2026: PHYS 10 clashes with the only CHEM 11 section → "no-fit"
        "PHYS 10": [
          { term: "spring", year: CURRENT_YEAR, sections: [section("PHYS 10", "01", ["M", "W", "F"], "08:00", "09:05", "spring", CURRENT_YEAR)] },
        ],
      },
      scheduleAvailability: makeAvailability([
        // current quarter
        { year: CURRENT_YEAR, term: CURRENT_TERM, status: "published", offered: ["CHEM 11", "MATH 11"] },
        // winter: fits
        { year: CURRENT_YEAR, term: "winter", status: "published", offered: ["CHEM 11"] },
        // spring: no-fit
        { year: CURRENT_YEAR, term: "spring", status: "published", offered: ["CHEM 11", "PHYS 10"] },
        // summer: unverified (TBA)
        { year: CURRENT_YEAR, term: "summer", status: "published", offered: ["CHEM 11"] },
        // winter 2027: not offered
        { year: CURRENT_YEAR + 1, term: "winter", status: "published", offered: ["MATH 11"] },
      ]),
    });

    // Open the conflict popover.
    fireEvent.click(screen.getByTestId("time-conflict-note-30"));

    // Suggestions container must appear.
    await screen.findByTestId("quarter-suggestions-30");

    // ── fits (empty quarter) ──────────────────────────────────────────────────
    const winterRow = await screen.findByTestId(`quarter-suggestion-30-${CURRENT_YEAR}-winter`);
    expect(winterRow.textContent).toContain("Offered — quarter is empty in your plan");

    // ── no-fit ───────────────────────────────────────────────────────────────
    const springRow = await screen.findByTestId(`quarter-suggestion-30-${CURRENT_YEAR}-spring`);
    expect(springRow.textContent).toContain("Offered, but every section clashes there too");

    // ── unverified (TBA) ──────────────────────────────────────────────────────
    const summerRow = await screen.findByTestId(`quarter-suggestion-30-${CURRENT_YEAR}-summer`);
    expect(summerRow.textContent).toContain("Offered — times TBA, fit can't be verified");

    // ── not-offered ───────────────────────────────────────────────────────────
    const winter27Row = await screen.findByTestId(`quarter-suggestion-30-${CURRENT_YEAR + 1}-winter`);
    expect(winter27Row.textContent).toContain("Not in the official schedule");

    // ── footnote is present ───────────────────────────────────────────────────
    expect(
      screen.getByText(/Quarters without a published or tentative SCU schedule aren't listed/),
    ).toBeTruthy();
  });

  it("does not list quarters that have no published or tentative schedule", async () => {
    const item = makePlanItem(40, "CHEM 11", CURRENT_TERM, CURRENT_YEAR);
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
        // winter: fits when opened
        "CHEM 11": [
          { term: "winter", year: CURRENT_YEAR, sections: [section("CHEM 11", "01", ["T", "R"], "10:00", "11:05", "winter", CURRENT_YEAR)] },
        ],
      },
      scheduleAvailability: makeAvailability([
        // current quarter (published)
        { year: CURRENT_YEAR, term: CURRENT_TERM, status: "published", offered: ["CHEM 11", "MATH 11"] },
        // winter: the only other term with a schedule
        { year: CURRENT_YEAR, term: "winter", status: "published", offered: ["CHEM 11"] },
        // spring 2027 has NO entry in scheduleAvailability → should not appear
      ]),
    });

    fireEvent.click(screen.getByTestId("time-conflict-note-40"));

    await screen.findByTestId("quarter-suggestions-40");

    // winter should appear
    expect(await screen.findByTestId(`quarter-suggestion-40-${CURRENT_YEAR}-winter`)).toBeTruthy();

    // spring 2027 was never in scheduleAvailability — it must not appear
    expect(screen.queryByTestId(`quarter-suggestion-40-${CURRENT_YEAR + 1}-spring`)).toBeNull();
  });

  it("shows 'fits' with planned-course count label when the quarter is not empty", async () => {
    const item = makePlanItem(50, "CHEM 11", CURRENT_TERM, CURRENT_YEAR);
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

    // PHYS 10 is in the target quarter but meets at a non-overlapping time.
    const physItem = makePlanItem(51, "PHYS 10", TARGET_TERM, TARGET_YEAR);

    renderCard({
      item,
      conflicts: [conflict],
      planItems: [item, physItem],
      sectionsByCode: {
        "CHEM 11": [
          {
            term: TARGET_TERM,
            year: TARGET_YEAR,
            sections: [section("CHEM 11", "01", ["T", "R"], "10:00", "11:05", TARGET_TERM, TARGET_YEAR)],
          },
        ],
        "PHYS 10": [
          {
            term: TARGET_TERM,
            year: TARGET_YEAR,
            // Different days → no conflict with CHEM 11.
            sections: [section("PHYS 10", "01", ["M", "W", "F"], "14:00", "15:05", TARGET_TERM, TARGET_YEAR)],
          },
        ],
      },
      scheduleAvailability: makeAvailability([
        { year: CURRENT_YEAR, term: CURRENT_TERM, status: "published", offered: ["CHEM 11", "MATH 11"] },
        { year: TARGET_YEAR, term: TARGET_TERM, status: "published", offered: ["CHEM 11", "PHYS 10"] },
      ]),
    });

    fireEvent.click(screen.getByTestId("time-conflict-note-50"));

    const targetRow = await screen.findByTestId(`quarter-suggestion-50-${TARGET_YEAR}-${TARGET_TERM}`);
    // Quarter has a planned course (PHYS 10) but CHEM 11 fits alongside it.
    expect(targetRow.textContent).toContain("Offered — a conflict-free section combination exists");
  });
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

    // The popover must close after the move so the board isn't left in an
    // open-popover state with stale conflict data.
    await waitFor(() => {
      expect(screen.queryByTestId("time-conflict-details-10")).toBeNull();
    });
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
