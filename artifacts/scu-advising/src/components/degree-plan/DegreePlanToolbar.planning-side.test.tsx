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

let mockReportQuery: { data: any } = { data: { available: false, report: null } };

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
    useGetProgressReport: () => mockReportQuery,
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
  afterEach(() => {
    cleanup();
    mockReportQuery = { data: { available: false, report: null } };
  });

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

  it("keeps the retired 'Official' wording out of Plan Controls entirely", () => {
    // Caught in live QA: the plan switcher still read "Official Degree Plan"
    // and the promote button "Use as Official". Both were split across source
    // lines, so a phrase search missed them — assert on the rendered text.
    renderToolbar();
    fireEvent.click(screen.getByTestId("button-open-plan-controls"));
    const sheet = screen.getByTestId("sheet-plan-controls");
    expect(sheet.textContent).not.toMatch(/Official/);
    expect(sheet.textContent).toMatch(/Promote to Degree Plan|Degree Plan/);
  });

  it("labels the plan without the retired 'Official Degree Plan' wording", () => {
    renderToolbar();

    expect(screen.getByTestId("toolbar-plan-name").textContent).toBe(
      "My Degree Plan",
    );
    expect(screen.queryByText(/Official Degree Plan/)).toBeNull();
  });

  it("does not repeat the plan-type label inside the executive bar — the page heading above it already says it", () => {
    // Newest professor feedback: repeating "Degree Plan" / "Tentative Degree
    // Plan" inside the toolbar when the page heading already says it is
    // redundant. Only the plan's own (possibly custom) name belongs here.
    renderToolbar("tentative");
    const toolbar = screen.getByTestId("degree-plan-toolbar");
    expect(toolbar.textContent).not.toMatch(/Tentative Degree Plan/);
    expect(toolbar.textContent).not.toMatch(/^Degree Plan$/m);
    expect(screen.getByTestId("toolbar-plan-name").textContent).toBe("My Degree Plan");
  });

  it("opens Plan Controls from the LEFT, reinforcing it affects Planning Requirements", () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId("button-open-plan-controls"));
    const sheet = screen.getByTestId("sheet-plan-controls");
    expect(sheet.getAttribute("data-state")).toBe("open");
    // Radix Dialog content carries the side as a data attribute driven by the
    // `side="left"` prop — assert the actual rendered attribute, not intent.
    expect(sheet.className).toMatch(/left-0/);
  });

  it("gives Plan Controls a concise descriptor tying it to the APR gap it fills", () => {
    renderToolbar();
    expect(
      screen.getByText(/majors, minors, or professional preparation not yet in your APR/i),
    ).toBeTruthy();
  });

  it("shows 'Upload Workday APR' on the right when no report exists yet", () => {
    renderToolbar();
    const link = screen.getByTestId("button-upload-apr-toolbar");
    expect(link.textContent).toMatch(/Upload Workday APR/);
    expect(link.getAttribute("href")).toBe("/progress-report");
  });

  it("shows 'Replace Workday APR' once a report already exists", () => {
    mockReportQuery = {
      data: { available: true, report: { id: 1, fileName: "apr.pdf" } },
    };
    renderToolbar();
    expect(screen.getByTestId("button-upload-apr-toolbar").textContent).toMatch(
      /Replace Workday APR/,
    );
  });

  it("closes Plan Controls on Escape (live QA: Radix's default Escape dismissal silently did nothing on this Sheet, unlike DegreePlanWorkspace's Palette/Progress sheets which already wire onEscapeKeyDown explicitly)", () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId("button-open-plan-controls"));
    expect(screen.getByTestId("sheet-plan-controls").getAttribute("data-state")).toBe("open");

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    expect(screen.queryByTestId("sheet-plan-controls")).toBeNull();
  });

  it("closes the advisor-sharing Sheet on Escape", () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId("button-open-advisor-sharing"));
    expect(screen.getByTestId("sheet-advisor-sharing").getAttribute("data-state")).toBe("open");

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    expect(screen.queryByTestId("sheet-advisor-sharing")).toBeNull();
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
