// @vitest-environment jsdom
/**
 * Degree Completion Assessment UI: textual statuses (never colour alone), the
 * disclaimer, which APR it is based on, the Tentative-plan limit, the student's
 * corrections beside the automatic result, and the inspector for admins only.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DegreeCompletionAssessment as Response, DegreeCompletionItem } from "@workspace/api-client-react";
import { testReport } from "./apr-test-data";

let data: Response;
let admin = false;
const correct = vi.fn();
const reset = vi.fn();

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useGetDegreeCompletionAssessment: () => ({ data, isLoading: false, isError: false }),
    useCorrectDegreeCompletionItem: () => ({ mutate: correct, isPending: false }),
    useResetDegreeCompletionItem: () => ({ mutate: reset, isPending: false }),
  };
});
vi.mock("@/hooks/use-is-admin", () => ({ useIsAdmin: () => admin }));

import { DegreeCompletionAssessment } from "./DegreeCompletionAssessment";

const DISCLAIMER =
  "CampusVal's Degree Completion Assessment is a planning aid generated from your uploaded APR. Verify all requirements against Workday. Workday is the definitive reference for degree completion.";

function item(over: Partial<DegreeCompletionItem> & { key: string; label: string }): DegreeCompletionItem {
  return {
    aprStatus: "Not Satisfied",
    remaining: "Minimum 1 Course(s)",
    remainingKind: "courses",
    remainingAmount: 1,
    registrations: [],
    group: "Biology Major",
    groupKind: "major",
    automatic: { state: "CLEAR_REMAINING", reason: "apr_not_satisfied", explanation: "Your APR marks this Not Satisfied.", code: "NOT_SATISFIED_EXPLICIT", remainingCourses: { count: 1, basis: "SOURCE_COUNT_AVAILABLE" }, minimumCombination: null, statusDetail: null },
    correction: null,
    effective: "remaining",
    confidence: "CLEAR_REMAINING",
    adjusted: false,
    trace: { sheet: "View My Academic Progress", sheetIndex: 0, row: 7, block: "Biology Major Requirements", blockIndex: 0, rule: "apr_not_satisfied", ruleVersion: "x", fingerprint: "f" },
    ...over,
  };
}

const ITEMS = [
  item({ key: "0000000000000001", label: "Biology Major: BIOL 101" }),
  item({
    key: "0000000000000002",
    label: "Biology Major: Upper Division Theme Courses",
    aprStatus: "In Progress",
    remaining: "Minimum 2 Course(s)",
    automatic: { state: "AMBIGUOUS", reason: "in_progress_with_remaining", explanation: "Your APR marks this In Progress and also lists an amount remaining.", code: "MULTI_COURSE_AMBIGUOUS", remainingCourses: { count: null, basis: "SOURCE_COUNT_UNAVAILABLE" as const }, minimumCombination: null, statusDetail: null },
    effective: "needs_review",
    confidence: "AMBIGUOUS",
  }),
  item({
    key: "0000000000000003",
    label: "Core: CAS: CTW 1",
    group: "Core",
    aprStatus: "Satisfied",
    remaining: null,
    automatic: { state: "LIKELY_COMPLETE", reason: "apr_satisfied", explanation: "Your APR marks this Satisfied.", code: "SATISFIED_EXPLICIT", remainingCourses: { count: 0, basis: "SOURCE_COUNT_AVAILABLE" }, minimumCombination: null, statusDetail: null },
    effective: "appears_complete",
    confidence: "LIKELY_COMPLETE",
  }),
  item({
    key: "0000000000000004",
    label: "Biology Major: BIOL 1B",
    aprStatus: "In Progress",
    remaining: null,
    automatic: { state: "AMBIGUOUS", reason: "in_progress_pending_grade", explanation: "Not complete until graded.", code: "USER_OVERRIDE", remainingCourses: { count: null, basis: "SOURCE_COUNT_UNAVAILABLE" as const }, minimumCombination: null, statusDetail: null },
    correction: { status: "complete", hidden: false, note: "Graded A last week", sourceChanged: false, updatedAt: "2026-10-09T00:00:00Z" },
    effective: "complete_for_planning",
    confidence: "USER_CORRECTED",
    adjusted: true,
  }),
];

function response(over: Partial<Response> = {}): Response {
  return {
    enabled: true,
    available: true,
    disclaimer: DISCLAIMER,
    ruleVersion: "x",
    documents: [
      {
        report: testReport({ id: 1, label: "Biology", category: "primary_major" }),
        state: "ready",
        programs: [
          {
            key: "s0b0",
            sheet: "View My Academic Progress",
            block: "Biology Major Requirements",
            items: ITEMS,
            summary: { remaining: 1, needsReview: 1, appearsComplete: 2, adjusted: 1, hidden: 0 },
          },
        ],
        unassessableSheets: [],
        orphaned: [],
        summary: { remaining: 1, needsReview: 1, appearsComplete: 2, adjusted: 1, hidden: 0 },
      },
      {
        report: testReport({ id: 2, label: "Chemistry Minor", category: "minor" }),
        state: "ready",
        programs: [],
        unassessableSheets: [],
        orphaned: [],
        summary: { remaining: 0, needsReview: 0, appearsComplete: 0, adjusted: 0, hidden: 0 },
      },
    ],
    ...over,
  };
}

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  data = response();
  admin = false;
  correct.mockReset();
  reset.mockReset();
});
afterEach(cleanup);

describe("Degree Completion Assessment", () => {
  it("shows the disclaimer, the planning-aid label and the APR it is based on, never official wording", () => {
    wrap(<DegreeCompletionAssessment />);
    expect(screen.getByTestId("dca-disclaimer").textContent).toBe(DISCLAIMER);
    expect(screen.getByText("Planning aid")).toBeTruthy();
    expect(screen.getByTestId("dca-basis").textContent).toMatch(/Based on Biology \(Primary Major\)/);
    const text = screen.getByTestId("degree-completion-assessment").textContent ?? "";
    expect(text).not.toMatch(/official degree audit|graduation audit|cleared to graduate/i);
  });

  it("writes every status in words, and by default lists what remains or needs review", () => {
    wrap(<DegreeCompletionAssessment />);
    expect(screen.getByTestId("dca-status-0000000000000001").textContent).toBe("Remaining");
    expect(screen.getByTestId("dca-status-0000000000000002").textContent).toBe("Needs review");
    expect(screen.queryByTestId("dca-item-0000000000000003")).toBeNull();
    fireEvent.click(screen.getByTestId("dca-view-all"));
    expect(screen.getByTestId("dca-status-0000000000000003").textContent).toBe("Appears complete");
    expect(screen.getByTestId("dca-status-0000000000000004").textContent).toBe("Complete for planning");
  });

  it("marks a student's correction as Adjusted and keeps CampusVal's own result visible", () => {
    wrap(<DegreeCompletionAssessment />);
    fireEvent.click(screen.getByTestId("dca-view-all"));
    const row = screen.getByTestId("dca-item-0000000000000004");
    expect(within(row).getByTestId("dca-adjusted-0000000000000004").textContent).toMatch(/Adjusted/);
    expect(row.textContent).toMatch(/CampusVal's APR-based result: Needs review/);
    expect(within(row).getByTestId("dca-note-0000000000000004").textContent).toMatch(/Graded A last week/);
  });

  it("shows Workday's own status and remaining words for each item", () => {
    wrap(<DegreeCompletionAssessment />);
    const row = screen.getByTestId("dca-item-0000000000000002");
    expect(row.textContent).toMatch(/Workday statusIn Progress/);
    expect(row.textContent).toMatch(/Remaining \(Workday\)Minimum 2 Course\(s\)/);
  });

  it("lets the student switch between their APRs instead of merging them", () => {
    wrap(<DegreeCompletionAssessment />);
    expect(screen.getByTestId("dca-doc-1").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("dca-doc-2"));
    expect(screen.getByTestId("dca-basis").textContent).toMatch(/Chemistry Minor \(Minor\)/);
  });

  it("says a Tentative Degree Plan's programs are not assessed", () => {
    wrap(<DegreeCompletionAssessment variant="compact" planContext={{ planType: "tentative", planName: "Neuroscience idea" }} />);
    expect(screen.getByTestId("dca-tentative-note").textContent).toMatch(/does not assess the programs of this Tentative Degree Plan \(Neuroscience idea\)/);
    // Compact: collapsed until asked for, with the counts on the button.
    expect(screen.queryByTestId("dca-basis")).toBeNull();
    expect(screen.getByTestId("dca-toggle").textContent).toMatch(/1 remaining · 1 to review/);
    fireEvent.click(screen.getByTestId("dca-toggle"));
    expect(screen.getByTestId("dca-basis")).toBeTruthy();
  });

  it("shows the source inspector only to administrators", () => {
    wrap(<DegreeCompletionAssessment />);
    expect(screen.queryByTestId("dca-inspector-0000000000000001")).toBeNull();
    cleanup();
    admin = true;
    wrap(<DegreeCompletionAssessment />);
    const inspector = screen.getByTestId("dca-inspector-0000000000000001");
    expect(inspector.textContent).toMatch(/row8 \(Excel\)/);
    expect(inspector.textContent).toMatch(/apr_not_satisfied/);
  });

  it("renders nothing when the assessment is switched off", () => {
    data = response({ enabled: false, documents: [] });
    wrap(<DegreeCompletionAssessment />);
    expect(screen.queryByTestId("degree-completion-assessment")).toBeNull();
  });

  it("flags a correction whose APR row changed, offering keep or reset", () => {
    const changed = item({
      key: "0000000000000005",
      label: "Biology Major: BIOL 1C",
      correction: { status: "complete", hidden: false, note: null, sourceChanged: true, updatedAt: "2026-10-09T00:00:00Z" },
    });
    data.documents[0]!.programs[0]!.items = [changed];
    wrap(<DegreeCompletionAssessment />);
    const notice = screen.getByTestId("dca-source-changed-0000000000000005");
    fireEvent.click(within(notice).getByText("Keep my correction"));
    expect(correct).toHaveBeenCalledWith(
      { id: 1, itemKey: "0000000000000005", data: { status: "complete", hidden: false, note: null } },
      expect.anything(),
    );
    fireEvent.click(within(notice).getByText("Use the APR-based result"));
    expect(reset).toHaveBeenCalledWith({ id: 1, itemKey: "0000000000000005" }, expect.anything());
  });
});
