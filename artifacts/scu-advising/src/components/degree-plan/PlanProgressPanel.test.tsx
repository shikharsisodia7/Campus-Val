// @vitest-environment jsdom
/**
 * REGRESSION: GET /progress-report 404s (a real error, not a 200 envelope)
 * when the user hasn't uploaded a report yet. The old
 * `reportEnvelope === undefined` check couldn't distinguish "still
 * loading" from "errored with no data" and got stuck showing "Loading..."
 * forever in the Progress Report section instead of the "none uploaded"
 * state.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

let mockReportQuery: { data: any; isLoading: boolean; error: any } = {
  data: { available: true, report: null },
  isLoading: false,
  error: null,
};

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useGetProgressReport: () => mockReportQuery,
    useGetDashboardSummary: () => ({ data: undefined }),
  };
});

vi.mock("./usePlanItemMutations", () => ({
  useOptimisticUpdatePlanItem: () => ({ mutate: vi.fn() }),
  useBulkImportReportCourses: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { PlanProgressPanel } from "./PlanProgressPanel";
import { DegreePlanProvider } from "./DegreePlanContext";

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DegreePlanProvider
        value={{
          activePlan: {
            id: 1,
            name: "Degree Plan",
            planType: "degree" as any,
            items: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          } as any,
          activePlanId: 1,
          setActivePlanId: vi.fn(),
          profile: { major: "CSE" } as any,
          requirements: [],
          scheduleAvailability: undefined,
          catalog: [],
          aprCompletedCodes: new Set(),
        }}
      >
        <PlanProgressPanel />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("PlanProgressPanel — Progress Report loading/error states", () => {
  it("shows a loading state while the request is in flight", () => {
    mockReportQuery = { data: undefined, isLoading: true, error: null };
    renderPanel();
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("REGRESSION: treats the real 404 as 'no report uploaded yet', not a stuck loading spinner", () => {
    mockReportQuery = {
      data: undefined,
      isLoading: false,
      error: { status: 404, message: "No progress report found." },
    };
    renderPanel();
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(screen.getByTestId("report-none-uploaded")).toBeTruthy();
  });

  it("shows a distinct error state for a real load failure, not 'no report uploaded'", () => {
    mockReportQuery = {
      data: undefined,
      isLoading: false,
      error: { status: 500, message: "Internal Server Error" },
    };
    renderPanel();
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(screen.getByTestId("report-load-error")).toBeTruthy();
    expect(screen.queryByTestId("report-none-uploaded")).toBeNull();
  });

  it("still renders the report once it successfully loads", () => {
    mockReportQuery = {
      data: {
        available: true,
        report: {
          id: 1,
          fileName: "APR.pdf",
          parsed: { completedCourses: [] },
        },
      },
      isLoading: false,
      error: null,
    };
    renderPanel();
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(screen.queryByTestId("report-none-uploaded")).toBeNull();
    expect(screen.getByTestId("report-empty-parse")).toBeTruthy();
  });
});
