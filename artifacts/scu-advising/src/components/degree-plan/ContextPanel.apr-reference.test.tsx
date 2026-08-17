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

let mockReportEnvelope: any = { available: true, report: null };

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
    useGetProgressReport: () => ({ data: mockReportEnvelope }),
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
    mockReportEnvelope = { available: true, report: null };
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
    mockReportEnvelope = {
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
    mockReportEnvelope = { available: true, report: null };
    renderPanel();
    expect(
      screen.getByText(
        "This report reflects official university records. CampusVal does not modify the report. Always verify your official academic record directly in Workday.",
      ),
    ).toBeTruthy();
  });

  it("keeps parsed/derived planning data visually and textually distinct from the official report", () => {
    mockReportEnvelope = { available: true, report: null };
    renderPanel();
    expect(
      screen.getByText("CampusVal planning support (not the official record)"),
    ).toBeTruthy();
  });
});
