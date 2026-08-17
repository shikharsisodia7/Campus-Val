// @vitest-environment jsdom
/**
 * The right panel must ALWAYS be the Academic Progress Report reference —
 * never a Progress/Plan toggle. Plan switching and majors/minors/
 * professional-prep editing live behind a separate "Plan Controls" sheet,
 * not sharing the APR column.
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

function renderPanel() {
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
        <ContextPanel plans={[plan as any]} />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}

describe("ContextPanel — APR is the permanent right-hand reference", () => {
  afterEach(() => cleanup());

  it("always shows the Academic Progress Report — no Progress/Plan toggle", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", { name: "Academic Progress Report" }),
    ).toBeTruthy();
    expect(screen.getByText("Official Reference")).toBeTruthy();
    expect(
      screen.getByText(/CampusVal does not modify the report/),
    ).toBeTruthy();

    // The old Progress/Plan tab toggle must be gone entirely.
    expect(screen.queryByTestId("tab-academic-progress")).toBeNull();
    expect(screen.queryByTestId("tab-plan-controls")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();

    // Progress content renders directly, with no tab gating it.
    expect(screen.getByTestId("plan-progress-panel")).toBeTruthy();
  });

  it("moves plan switching and program editing behind a separate Plan Controls sheet", () => {
    const { container } = renderPanel();

    // Not visible until opened.
    expect(screen.queryByText("Select Plan")).toBeNull();

    fireEvent.click(screen.getByTestId("button-open-plan-controls"));

    expect(screen.getByText("Select Plan")).toBeTruthy();
    expect(screen.getByTestId("plan-programs-section")).toBeTruthy();

    // The APR heading is still in the document behind the sheet overlay —
    // it was never replaced by Plan Controls content (Radix correctly
    // marks it aria-hidden while the modal sheet is open).
    expect(container.querySelector("h2")?.textContent).toBe(
      "Academic Progress Report",
    );
  });
});
