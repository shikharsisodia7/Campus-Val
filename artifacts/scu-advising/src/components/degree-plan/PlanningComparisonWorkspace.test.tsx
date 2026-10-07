// @vitest-environment jsdom
/**
 * The comparison workspace: Planning Requirements | main | compact APR on Degree
 * Checksheets, Planning Requirements | full APR on the APR page. It composes the
 * canonical sidebars, never creates a plan, and each region is its own labelled scroller.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const workspace = {
  plans: [
    { id: 1, name: "Degree Plan", planType: "degree" },
    { id: 2, name: "Finance", planType: "tentative" },
  ],
  degreePlan: { id: 1 },
  plansLoading: false,
  planLoading: false,
  activePlan: { id: 1, name: "Degree Plan", planType: "degree", items: [] },
  activePlanId: 1 as number | null,
  selectPlan: vi.fn(),
  contextValue: {
    activePlan: { id: 1, name: "Degree Plan", planType: "degree", items: [] },
    activePlanId: 1,
    setActivePlanId: vi.fn(),
    profile: undefined,
    requirements: [],
    requirementsMeta: null,
    scheduleAvailability: undefined,
    catalog: [],
  },
};
vi.mock("./usePlanningWorkspace", () => ({ usePlanningWorkspace: () => workspace }));
vi.mock("./Palette", () => ({ Palette: () => <div data-testid="requirements-palette">Palette</div> }));
vi.mock("@/components/progress-report/WorkdayAprPanel", () => ({ WorkdayAprPanel: () => <div data-testid="workday-apr-panel">Compact APR</div> }));
vi.mock("@/components/progress-report/AprReferenceSheet", () => ({ AprReferenceSheet: ({ children }: { children: React.ReactNode }) => <div data-testid="apr-sheet">{children}</div> }));

import { PlanningComparisonWorkspace } from "./PlanningComparisonWorkspace";

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  workspace.selectPlan.mockClear();
  workspace.plansLoading = false;
});

describe("Degree Checksheets layout", () => {
  it("has Planning Requirements on the left, the checksheet in the middle and the compact APR on the right, in that order", () => {
    render(<PlanningComparisonWorkspace main={<div data-testid="checksheet-main">Checksheet</div>} mainLabel="Degree Checksheets" showCompactApr />);
    const layout = screen.getByTestId("compare-layout");
    const regions = within(layout).getAllByRole("region");
    expect(regions.map((r) => r.getAttribute("aria-label"))).toEqual(["Planning Requirements", "Degree Checksheets", "Workday APR"]);
    expect(within(screen.getByTestId("compare-left")).getByTestId("requirements-palette")).toBeTruthy();
    expect(within(screen.getByTestId("compare-main")).getByTestId("checksheet-main")).toBeTruthy();
    expect(within(screen.getByTestId("compare-right")).getByTestId("workday-apr-panel")).toBeTruthy();
    expect(layout.getAttribute("data-rails")).toBe("LR");
  });

  it("gives each region its own scrolling on wide screens, with the main region able to take keyboard focus", () => {
    render(<PlanningComparisonWorkspace main={<p>m</p>} mainLabel="Degree Checksheets" showCompactApr />);
    const mainClasses = screen.getByTestId("compare-main").className.split(/\s+/);
    expect(mainClasses).toContain("xl:overflow-y-auto");
    // Below xl the page itself scrolls: no scroll region inside a phone screen.
    expect(mainClasses).not.toContain("overflow-y-auto");
    expect(screen.getByTestId("compare-layout").className).toMatch(/xl:h-\[calc\(100dvh-/);
    expect(screen.getByTestId("compare-left").className).toContain("overflow-hidden");
    expect(screen.getByTestId("compare-right").className).toContain("overflow-hidden");
    expect(screen.getByTestId("compare-main").getAttribute("tabindex")).toBe("-1");
  });

  it("collapses either side panel, remembers it, and restores it", () => {
    const { unmount } = render(<PlanningComparisonWorkspace main={<p>m</p>} mainLabel="Degree Checksheets" showCompactApr />);
    fireEvent.click(screen.getByTestId("toggle-left-rail"));
    expect(screen.queryByTestId("compare-left")).toBeNull();
    expect(screen.getByTestId("compare-layout").getAttribute("data-rails")).toBe("R");
    fireEvent.click(screen.getByTestId("toggle-right-rail"));
    expect(screen.getByTestId("compare-layout").getAttribute("data-rails")).toBe("");
    expect(screen.getByTestId("toggle-left-rail").getAttribute("aria-pressed")).toBe("false");
    unmount();
    render(<PlanningComparisonWorkspace main={<p>m</p>} mainLabel="Degree Checksheets" showCompactApr />);
    expect(screen.getByTestId("compare-layout").getAttribute("data-rails")).toBe("");
    fireEvent.click(screen.getByTestId("toggle-left-rail"));
    expect(screen.getByTestId("compare-layout").getAttribute("data-rails")).toBe("L");
  });
});

describe("while the plan loads", () => {
  it("shows the main content at once, and a placeholder only where the requirements will be", () => {
    workspace.plansLoading = true;
    render(<PlanningComparisonWorkspace main={<div data-testid="checksheet-main">Checksheet</div>} mainLabel="Degree Checksheets" showCompactApr />);
    expect(within(screen.getByTestId("compare-main")).getByTestId("checksheet-main")).toBeTruthy();
    expect(within(screen.getByTestId("compare-left")).getByRole("status", { name: "Loading your Planning Requirements" })).toBeTruthy();
    expect(screen.queryByTestId("requirements-palette")).toBeNull();
    expect(within(screen.getByTestId("compare-right")).getByTestId("workday-apr-panel")).toBeTruthy();
  });

  it("names a tentative plan the same way everywhere", () => {
    render(<PlanningComparisonWorkspace main={<p>m</p>} mainLabel="Degree Checksheets" showCompactApr />);
    fireEvent.keyDown(screen.getByTestId("compare-plan-trigger"), { key: "Enter" });
    expect(screen.getAllByText("Tentative Degree Plan — Finance").length).toBeGreaterThan(0);
  });
});

describe("Academic Progress Report layout", () => {
  it("has Planning Requirements and the full APR only: no duplicate compact APR sidebar", () => {
    render(<PlanningComparisonWorkspace main={<div data-testid="full-apr">Full APR</div>} mainLabel="Full Academic Progress Reports" showCompactApr={false} />);
    const regions = within(screen.getByTestId("compare-layout")).getAllByRole("region");
    expect(regions.map((r) => r.getAttribute("aria-label"))).toEqual(["Planning Requirements", "Full Academic Progress Reports"]);
    expect(screen.queryByTestId("compare-right")).toBeNull();
    expect(screen.queryByTestId("workday-apr-panel")).toBeNull();
    expect(screen.queryByTestId("toggle-right-rail")).toBeNull();
    expect(screen.queryByTestId("apr-sheet")).toBeNull();
    expect(screen.getByTestId("compare-layout").getAttribute("data-rails")).toBe("L");
  });
});

describe("the plan being compared against", () => {
  it("is chosen in a labelled selector, uses the existing plans, and never creates one", () => {
    render(<PlanningComparisonWorkspace main={<p>m</p>} mainLabel="Degree Checksheets" showCompactApr />);
    const trigger = screen.getByTestId("compare-plan-trigger");
    expect(trigger.textContent).toContain("Degree Plan");
    expect(screen.getByText("Compare against")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /create|new plan/i })).toBeNull();
  });

  it("says so, and creates nothing, when there is no plan", () => {
    workspace.plans = [];
    (workspace as { activePlan: unknown }).activePlan = undefined;
    workspace.activePlanId = null;
    render(<PlanningComparisonWorkspace main={<p>m</p>} mainLabel="Degree Checksheets" showCompactApr />);
    expect(screen.getByTestId("compare-no-plan").textContent).toMatch(/nothing is created for you/);
    workspace.plans = [
      { id: 1, name: "Degree Plan", planType: "degree" },
      { id: 2, name: "Finance", planType: "tentative" },
    ];
    (workspace as { activePlan: unknown }).activePlan = { id: 1, name: "Degree Plan", planType: "degree", items: [] };
    workspace.activePlanId = 1;
  });
});

describe("below the desktop width", () => {
  it("offers the same two panels in drawers rather than three crushed columns", () => {
    render(<PlanningComparisonWorkspace main={<p>m</p>} mainLabel="Degree Checksheets" showCompactApr />);
    expect(screen.getByTestId("button-open-requirements").textContent).toContain("Planning Requirements");
    expect(screen.getByTestId("apr-sheet")).toBeTruthy();
  });

  it("offers only the requirements drawer on the APR page", () => {
    render(<PlanningComparisonWorkspace main={<p>m</p>} mainLabel="Full Academic Progress Reports" showCompactApr={false} />);
    expect(screen.getByTestId("button-open-requirements")).toBeTruthy();
    expect(screen.queryByTestId("apr-sheet")).toBeNull();
  });
});
