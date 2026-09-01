// @vitest-environment jsdom
/**
 * Compact Fall/Winter/Spring focus strip for Quarter Plan.
 *
 * Covers two professor requirements:
 *
 *  - The Degree Plan carryover for ALL THREE quarters must actually show up,
 *    using the repo's real year convention (Fall=anchor, Winter/Spring=
 *    anchor+1). Winter and Spring silently disappearing was a reported bug,
 *    so each quarter is asserted independently.
 *
 *  - That carryover is READ-ONLY. Quarter Plan must not offer move-to-another
 *    -quarter controls; the student edits the Degree Plan instead so the
 *    long-term plan stays accurate.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import type {
  AcademicPlanDetail,
  PlanItem,
  ScheduleAvailability,
} from "@workspace/api-client-react";

import { AcademicYearOverview, quarterYearFor } from "./AcademicYearOverview";

function makeAvailability(): ScheduleAvailability {
  const base = {
    sourceUrl: "https://x",
    sourceLabel: "x",
    lastVerified: "2026-05-07",
    importedDate: "2026-05-07",
    freshness: "fresh",
    officialSectionCount: 0,
    syncedSectionCount: 0,
    offeredCourseCodes: [],
  };
  return {
    note: "test",
    terms: [
      { ...base, term: "fall", year: 2026, status: "published", publishedDate: "2026-05-07" },
      { ...base, term: "winter", year: 2027, status: "tentative", publishedDate: null },
      { ...base, term: "spring", year: 2027, status: "tentative", publishedDate: null },
    ],
  } as any;
}

function makeItem(
  id: number,
  code: string,
  term: string,
  year: number,
): PlanItem {
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
    name: "My Degree Plan",
    planType: "degree",
    sourcePlanId: null,
    metadata: {},
    programs: { additionalMajors: [], minors: [], professionalGoals: [] },
    items,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
}

function renderOverview(
  items: PlanItem[],
  focusedTerm: any = "fall",
  focusedYear: number | null = 2026,
  onFocusQuarter = vi.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <AcademicYearOverview
        activePlan={makePlan(items)}
        focusedTerm={focusedTerm}
        focusedYear={focusedYear}
        onFocusQuarter={onFocusQuarter}
        availability={makeAvailability()}
      />
    </QueryClientProvider>,
  );
  return { ...result, onFocusQuarter };
}

afterEach(() => cleanup());

describe("academic-year convention", () => {
  it("maps Fall to the anchor year and Winter/Spring to anchor+1", () => {
    expect(quarterYearFor("fall" as any, 2026)).toBe(2026);
    expect(quarterYearFor("winter" as any, 2026)).toBe(2027);
    expect(quarterYearFor("spring" as any, 2026)).toBe(2027);
  });
});

describe("Fall/Winter/Spring Degree Plan carryover", () => {
  // Plan items are stored under the academic-year ANCHOR: every term of the
  // 2026-27 year is saved as 2026, so Winter 2026 IS calendar Winter 2027.
  const items = [
    makeItem(1, "CHEM 11", "fall", 2026),
    makeItem(2, "MATH 12", "winter", 2026),
    makeItem(3, "PHYS 33", "spring", 2026),
  ];

  it("shows the Fall course under Fall", () => {
    renderOverview(items);
    expect(screen.getByTestId("carryover-fall").textContent).toContain(
      "CHEM 11",
    );
  });

  it("shows the Winter course under Winter, using the rolled-over year", () => {
    renderOverview(items);
    const winter = screen.getByTestId("carryover-winter").textContent ?? "";
    expect(winter).toContain("MATH 12");
    expect(winter).toContain("2027");
  });

  it("shows the Spring course under Spring, using the rolled-over year", () => {
    renderOverview(items);
    const spring = screen.getByTestId("carryover-spring").textContent ?? "";
    expect(spring).toContain("PHYS 33");
    expect(spring).toContain("2027");
  });

  it("keeps each quarter's courses in its own quarter", () => {
    renderOverview(items);
    expect(screen.getByTestId("carryover-fall").textContent).not.toContain(
      "MATH 12",
    );
    expect(screen.getByTestId("carryover-winter").textContent).not.toContain(
      "CHEM 11",
    );
  });

  it("does not leak a course from a different academic year", () => {
    renderOverview([
      makeItem(1, "CHEM 11", "fall", 2026),
      makeItem(9, "NEXTYR 1", "fall", 2027),
    ]);
    const fall = screen.getByTestId("carryover-fall").textContent ?? "";
    expect(fall).toContain("CHEM 11");
    expect(fall).not.toContain("NEXTYR 1");
  });

  it("says so plainly when a quarter has nothing planned", () => {
    renderOverview([makeItem(1, "CHEM 11", "fall", 2026)]);
    expect(screen.getByTestId("carryover-winter").textContent).toContain(
      "nothing planned",
    );
  });

  it("REGRESSION: Winter shows THIS academic year, not the next one", () => {
    // The bug: Quarter Plan looked up Winter by calendar year (2027), which is
    // the anchor of the NEXT academic year — so Winter showed year-2 courses.
    renderOverview([
      makeItem(2, "MATH 12", "winter", 2026),
      makeItem(8, "AMTH 106", "winter", 2027),
    ]);
    const winter = screen.getByTestId("carryover-winter").textContent ?? "";
    expect(winter).toContain("MATH 12");
    expect(winter).not.toContain("AMTH 106");
  });

  it("shows the requirement's descriptive label, not just a count, without pretending it is a course", () => {
    const placeholder = {
      ...makeItem(4, "", "fall", 2026),
      itemType: "requirement_placeholder",
      courseCode: null,
      requirementLabel: "Core: Civic Engagement",
    } as unknown as PlanItem;
    renderOverview([placeholder]);
    const text = screen.getByTestId("carryover-fall").textContent ?? "";
    expect(text).toContain("Core: Civic Engagement");
    expect(text).not.toContain("1 requirement");
  });

  it("falls back to requirementCategory, then a generic label, when no descriptive label is set", () => {
    const withCategory = {
      ...makeItem(5, "", "fall", 2026),
      itemType: "requirement_placeholder",
      courseCode: null,
      requirementLabel: null,
      requirementCategory: "Upper-Division Public Health Science",
    } as unknown as PlanItem;
    renderOverview([withCategory]);
    expect(screen.getByTestId("carryover-fall").textContent).toContain(
      "Upper-Division Public Health Science",
    );
  });

  it("shows both a concrete course and a generic requirement together in the same quarter", () => {
    const course = makeItem(6, "CHEM 11", "fall", 2026);
    const placeholder = {
      ...makeItem(7, "", "fall", 2026),
      itemType: "requirement_placeholder",
      courseCode: null,
      requirementLabel: "Core Elective",
    } as unknown as PlanItem;
    renderOverview([course, placeholder]);
    const text = screen.getByTestId("carryover-fall").textContent ?? "";
    expect(text).toContain("CHEM 11");
    expect(text).toContain("Core Elective");
  });
});

describe("carryover is read-only", () => {
  const items = [
    makeItem(1, "CHEM 11", "fall", 2026),
    makeItem(2, "MATH 12", "winter", 2026),
  ];

  it("offers no move-to-another-quarter control for a planned course", () => {
    const { container } = renderOverview(items);
    expect(
      container.querySelectorAll('[data-testid^="overview-move-"]'),
    ).toHaveLength(0);
    expect(screen.queryByLabelText(/Move CHEM 11 to/)).toBeNull();
  });

  it("exposes no per-course interactive control at all", () => {
    const { container } = renderOverview(items);
    const carryover = container.querySelector(
      '[data-testid="degree-plan-carryover"]',
    ) as HTMLElement;
    expect(carryover.querySelectorAll("button")).toHaveLength(0);
    expect(carryover.querySelectorAll("select")).toHaveLength(0);
  });

  it("sends the student to the Degree Plan to change quarters", () => {
    renderOverview(items);
    const link = screen.getByTestId("link-edit-degree-plan");
    expect(link.textContent).toContain("Edit Degree Plan");
    expect(link.getAttribute("href")).toBe("/degree-plan");
  });

  it("explains that changing quarters happens in the Degree Plan", () => {
    renderOverview(items);
    expect(
      screen.getByText(/edit the Degree Plan so it stays accurate/),
    ).toBeTruthy();
  });
});

describe("quarter focus", () => {
  it("marks the focused quarter and focuses another on click", () => {
    const { onFocusQuarter } = renderOverview(
      [makeItem(1, "CHEM 11", "fall", 2026)],
      "fall",
      2026,
    );

    expect(
      screen.getByTestId("focus-quarter-fall").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("focus-quarter-winter").getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(screen.getByTestId("focus-quarter-spring"));
    expect(onFocusQuarter).toHaveBeenCalledWith("spring", 2027);
  });

  it("offers a focus button for each of Fall, Winter and Spring", () => {
    renderOverview([]);
    expect(screen.getByTestId("focus-quarter-fall")).toBeTruthy();
    expect(screen.getByTestId("focus-quarter-winter")).toBeTruthy();
    expect(screen.getByTestId("focus-quarter-spring")).toBeTruthy();
  });
});
