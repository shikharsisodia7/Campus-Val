// @vitest-environment jsdom
/**
 * Right panel must default to Academic Progress (not Plan Controls).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
    useListGraduationMajors: () => ({ data: { majors: [] } }),
    useListGraduationMinors: () => ({ data: { minors: [] } }),
    useGetProgressReport: () => ({ data: { available: false, report: null } }),
    useGetDegreeRequirements: () => ({ data: { groups: [] } }),
  };
});

vi.mock("./PlanProgressPanel", () => ({
  PlanProgressPanel: () => (
    <div data-testid="plan-progress-panel">progress body</div>
  ),
}));

import { ContextPanel } from "./ContextPanel";
import { DegreePlanProvider } from "./DegreePlanContext";

const plan = {
  id: 1,
  name: "Official Degree Plan",
  planType: "degree" as const,
  sourcePlanId: null,
  metadata: {},
  programs: {
    additionalMajors: ["ECEN"],
    minors: ["Anthropology"],
    professionalGoals: [],
  },
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ContextPanel Academic Progress default", () => {
  afterEach(() => cleanup());

  it("defaults to the Progress tab and titles the panel Academic Progress", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
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
          <ContextPanel plans={[plan as any]} />
        </DegreePlanProvider>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Academic Progress" }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("tab-academic-progress").getAttribute("data-state"),
    ).toBe("active");
    expect(
      screen.getByTestId("tab-plan-controls").getAttribute("data-state"),
    ).toBe("inactive");
    expect(screen.getByTestId("plan-progress-panel")).toBeTruthy();
  });
});
