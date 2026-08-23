// @vitest-environment jsdom
/**
 * The Degree Plan right-hand column must be the Workday Academic Progress
 * Report and NOTHING else.
 *
 * The professor's correction: that column exists so a student can compare
 * their editable CampusVal plan against the university record. Plan Controls,
 * major/minor editing, Professional Preparation editing, and CampusVal's own
 * progress widgets all belong on the planning side instead — they are
 * asserted here to be absent from this column, and asserted present in
 * DegreePlanToolbar.planning-side.test.tsx.
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

import { ContextPanel } from "./ContextPanel";
import { DegreePlanProvider } from "./DegreePlanContext";

const plan = {
  id: 1,
  name: "My Degree Plan",
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
        <ContextPanel />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}

describe("ContextPanel — the right column is the APR and nothing else", () => {
  afterEach(() => cleanup());

  it("titles the column as the Workday university record reference", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", {
        name: "Workday Academic Progress Report",
      }),
    ).toBeTruthy();
    expect(screen.getByText("University Record Reference")).toBeTruthy();
  });

  it("tells the student to verify in Workday and never calls itself official CampusVal data", () => {
    renderPanel();

    expect(
      screen.getByText(/CampusVal never\s+modifies it/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Verify your academic and registration information/),
    ).toBeTruthy();
  });

  it("does not put Plan Controls in the APR column", () => {
    renderPanel();

    expect(screen.queryByTestId("button-open-plan-controls")).toBeNull();
    expect(screen.queryByTestId("sheet-plan-controls")).toBeNull();
    expect(screen.queryByText("Select Plan")).toBeNull();
  });

  it("does not put CampusVal progress widgets or plan analytics in the APR column", () => {
    renderPanel();

    expect(screen.queryByTestId("plan-progress-panel")).toBeNull();
    expect(screen.queryByTestId("plan-programs-section")).toBeNull();
    expect(
      screen.queryByText(/CampusVal planning support/),
    ).toBeNull();
  });

  it("keeps the old Progress/Plan tab toggle gone", () => {
    renderPanel();

    expect(screen.queryByTestId("tab-academic-progress")).toBeNull();
    expect(screen.queryByTestId("tab-plan-controls")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("still offers the secure upload path when no report is uploaded", () => {
    renderPanel();

    expect(screen.getByTestId("apr-uploads-unavailable")).toBeTruthy();
  });
});
