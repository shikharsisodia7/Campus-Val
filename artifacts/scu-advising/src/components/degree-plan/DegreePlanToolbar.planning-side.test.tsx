// @vitest-environment jsdom
/**
 * Plan Controls must live on the PLANNING side, not in the APR column.
 *
 * The professor asked for every control that changes what the student is
 * planning — plan switching, planning major, second major, minors,
 * Professional Preparation, four-year preload — to sit with the plan, leaving
 * the right-hand column free for the Workday record.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useCreatePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useDuplicatePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useDeletePlan: () => ({ mutate: vi.fn(), isPending: false }),
    usePromotePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdatePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useAddPlanItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useListGraduationMajors: () => ({ data: { majors: [] } }),
    useListGraduationMinors: () => ({ data: { minors: [] } }),
    useGetProgressReport: () => ({ data: { available: false, report: null } }),
    useGetDegreeRequirements: () => ({ data: { groups: [] } }),
    useGetProfile: () => ({
      data: { major: "CSE", startYear: 2026, college: "School of Engineering" },
    }),
  };
});

import { DegreePlanToolbar } from "./DegreePlanToolbar";
import { DegreePlanProvider } from "./DegreePlanContext";

const plan = {
  id: 1,
  name: "My Degree Plan",
  planType: "degree" as const,
  sourcePlanId: null,
  metadata: {},
  programs: { additionalMajors: [], minors: [], professionalGoals: [] },
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderToolbar(mode: "degree" | "tentative" = "degree") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DegreePlanProvider
        value={{
          activePlan: plan as any,
          activePlanId: 1,
          setActivePlanId: vi.fn(),
          profile: { major: "CSE", college: "School of Engineering" } as any,
          requirements: [],
          scheduleAvailability: undefined,
          catalog: [],
          aprCompletedCodes: new Set(),
        }}
      >
        <DegreePlanToolbar plans={[plan as any]} mode={mode} />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}

describe("DegreePlanToolbar — plan controls sit on the planning side", () => {
  afterEach(() => cleanup());

  it("renders a Plan Controls trigger outside the APR column", () => {
    renderToolbar();
    expect(screen.getByTestId("button-open-plan-controls")).toBeTruthy();
  });

  it("opens plan switching and program editing from the planning side", () => {
    renderToolbar();

    expect(screen.queryByText("Select Plan")).toBeNull();
    fireEvent.click(screen.getByTestId("button-open-plan-controls"));

    expect(screen.getByText("Select Plan")).toBeTruthy();
    expect(screen.getByTestId("plan-programs-section")).toBeTruthy();
  });

  it("says plainly that program choices are planning only", () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId("button-open-plan-controls"));

    expect(
      screen.getByText(/CampusVal does not declare anything with the university/),
    ).toBeTruthy();
  });

  it("labels the plan without the retired 'Official Degree Plan' wording", () => {
    renderToolbar();

    expect(screen.getByTestId("toolbar-plan-name").textContent).toBe(
      "My Degree Plan",
    );
    expect(screen.queryByText(/Official Degree Plan/)).toBeNull();
  });

  it("names the surface Tentative Degree Plan in tentative mode", () => {
    renderToolbar("tentative");
    expect(screen.getByText("Tentative Degree Plan")).toBeTruthy();
  });

  it("keeps the toolbar to a single compact row", () => {
    const { container } = renderToolbar();
    const toolbar = container.querySelector(
      '[data-testid="degree-plan-toolbar"]',
    ) as HTMLElement;
    expect(toolbar).toBeTruthy();
    // No stacked hero/explanation cards above the board.
    expect(toolbar.querySelectorAll("p").length).toBeLessThanOrEqual(1);
  });
});
