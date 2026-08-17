// @vitest-environment jsdom
/**
 * The right column must present the APR as an official record reference,
 * not an AI/CampusVal interpretation: original-report access via the
 * existing secure endpoint, a Workday verification disclaimer, and an
 * honest "no report uploaded" state — never silently replaced by parsed
 * data presented as if it were the document itself.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mirrors what useGetProgressReport (a TanStack Query hook) actually
// returns, since GET /progress-report 404s — a real error, not a 200
// envelope — when nothing has been uploaded yet.
let mockReportQuery: { data: any; isLoading: boolean; error: any } = {
  data: { available: true, report: null },
  isLoading: false,
  error: null,
};

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
    useGetProgressReport: () => mockReportQuery,
    useGetDegreeRequirements: () => ({ data: { groups: [] } }),
  };
});

vi.mock("./PlanProgressPanel", () => ({
  PlanProgressPanel: () => <div data-testid="plan-progress-panel" />,
}));

import { ContextPanel } from "./ContextPanel";
import { DegreePlanProvider } from "./DegreePlanContext";

const plan = {
  id: 1,
  name: "Official Degree Plan",
  planType: "degree" as const,
  sourcePlanId: null,
  metadata: {},
  programs: { additionalMajors: [], minors: [], professionalGoals: [] },
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DegreePlanProvider
        value={{
          activePlan: plan as any,
          activePlanId: 1,
          setActivePlanId: vi.fn(),
          profile: { major: "CSE" } as any,
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

afterEach(() => cleanup());

describe("ContextPanel — APR official-reference states", () => {
  it("shows an honest 'no report uploaded' state with an upload link", () => {
    mockReportQuery = { data: { available: true, report: null }, isLoading: false, error: null };
    renderPanel();
    expect(screen.getByTestId("apr-none-uploaded")).toBeTruthy();
    expect(screen.getByText("No Academic Progress Report uploaded.")).toBeTruthy();
    expect(screen.getByTestId("apr-upload-link").getAttribute("href")).toBe(
      "/progress-report",
    );
    // No original-report section should render when nothing is uploaded.
    expect(screen.queryByTestId("apr-original-report")).toBeNull();
  });

  it("labels an uploaded report as an uploaded Workday export and links the secure original file", () => {
    mockReportQuery = {
      data: {
        available: true,
        report: {
          id: 1,
          fileName: "Fall2026-APR.pdf",
          fileSize: 1024,
          contentType: "application/pdf",
          objectPath: "/objects/x",
          uploadedAt: "2026-08-01T00:00:00.000Z",
          parsed: null,
          parseStatus: "ok",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      },
      isLoading: false,
      error: null,
    };
    renderPanel();

    expect(screen.getByText("Uploaded Workday Academic Progress Report")).toBeTruthy();
    expect(screen.getByText(/Fall2026-APR\.pdf/)).toBeTruthy();

    const viewLink = screen.getByTestId("button-view-original-report");
    // Must hit the existing authenticated file endpoint, never a public/raw URL.
    expect(viewLink.getAttribute("href")).toContain("/api/progress-report/file");

    expect(screen.getByTestId("button-replace-report")).toBeTruthy();
  });

  it("always shows the Workday verification disclaimer, regardless of report state", () => {
    mockReportQuery = { data: { available: true, report: null }, isLoading: false, error: null };
    renderPanel();
    expect(
      screen.getByText(
        "This report reflects official university records. CampusVal does not modify the report. Always verify your official academic record directly in Workday.",
      ),
    ).toBeTruthy();
  });

  it("keeps parsed/derived planning data visually and textually distinct from the official report", () => {
    mockReportQuery = { data: { available: true, report: null }, isLoading: false, error: null };
    renderPanel();
    expect(
      screen.getByText("CampusVal planning support (not the official record)"),
    ).toBeTruthy();
  });

  it("shows a loading state while the report request is in flight, not the 'no report' state", () => {
    mockReportQuery = { data: undefined, isLoading: true, error: null };
    renderPanel();
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByTestId("apr-none-uploaded")).toBeNull();
  });

  it("REGRESSION: treats the real 404 GET /progress-report returns when nothing is uploaded as 'no report uploaded', not a stuck loading spinner", () => {
    // The actual API returns a 404 (not a 200 envelope) when the user has no
    // report yet, so data stays undefined and the query settles into an
    // error state. The old `reportEnvelope === undefined` check couldn't
    // tell "still loading" apart from "errored with no data" and got stuck
    // showing "Loading…" forever.
    mockReportQuery = {
      data: undefined,
      isLoading: false,
      error: { status: 404, message: "No progress report found." },
    };
    renderPanel();
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.getByTestId("apr-none-uploaded")).toBeTruthy();
    expect(screen.getByText("No Academic Progress Report uploaded.")).toBeTruthy();
  });

  it("shows a distinct error state for a real load failure (not a 404), never claiming 'no report uploaded' incorrectly", () => {
    mockReportQuery = {
      data: undefined,
      isLoading: false,
      error: { status: 500, message: "Internal Server Error" },
    };
    renderPanel();
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(screen.getByTestId("apr-load-error")).toBeTruthy();
    expect(screen.queryByTestId("apr-none-uploaded")).toBeNull();
  });
});
