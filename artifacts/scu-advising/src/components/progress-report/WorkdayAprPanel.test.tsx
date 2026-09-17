// @vitest-environment jsdom
/**
 * Coverage for the 2026-09 professor-feedback pass:
 * - the sidebar must never show grades (a simple completion benchmark), and
 * - a neutral, non-destructive major-mismatch warning against the uploaded
 *   Workday APR, shown only when both sides are confidently known.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getGetProgressReportQueryKey } from "@workspace/api-client-react";
import { WorkdayAprPanel } from "./WorkdayAprPanel";

afterEach(cleanup);

function makeReportEnvelope(program: string, overrides: Partial<any> = {}) {
  return {
    available: true,
    report: {
      fileName: "apr.pdf",
      uploadedAt: new Date().toISOString(),
      parsed: {
        completedCourses: [],
        possibleCourses: [],
        program,
        groups: [
          {
            name: `${program} Major Requirements`,
            requirements: [
              {
                name: "Sample requirement",
                status: "completed",
                courses: [
                  { code: "CSCI 10", title: "Intro to CS", units: 5, grade: "A", inCatalog: true },
                ],
              },
            ],
          },
        ],
        notes: [],
      },
      ...overrides,
    },
  };
}

function renderPanel(reportEnvelope: any, planningMajorTitle?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(getGetProgressReportQueryKey(), reportEnvelope);
  return render(
    <QueryClientProvider client={client}>
      <WorkdayAprPanel planningMajorTitle={planningMajorTitle} />
    </QueryClientProvider>,
  );
}

describe("WorkdayAprPanel", () => {
  it("never shows a grade in the sidebar's requirement groups (collapsed by default — expand it, the way a student would)", () => {
    renderPanel(makeReportEnvelope("Computer Science and Engineering"), "Computer Science & Engineering");
    fireEvent.click(screen.getByText("Computer Science and Engineering Major Requirements"));
    const course = screen.getByTestId("requirement-course-0-0-0");
    expect(course.textContent).not.toContain("(A)");
    expect(course.textContent).toContain("CSCI 10");
  });

  it("shows the neutral mismatch warning when the APR program clearly differs from the CampusVal planning major", () => {
    renderPanel(makeReportEnvelope("Finance"), "Computer Science & Engineering");
    const warning = screen.getByTestId("apr-major-mismatch-warning");
    expect(warning.textContent).toMatch(/differ from the uploaded/i);
    expect(warning.textContent).toMatch(/Workday is the university-record reference/i);
  });

  it("shows no warning when the APR program matches the CampusVal planning major", () => {
    renderPanel(makeReportEnvelope("Computer Science and Engineering"), "Computer Science & Engineering");
    expect(screen.queryByTestId("apr-major-mismatch-warning")).toBeNull();
  });

  it("shows no warning when no planning major is available to compare (e.g. a Tentative Degree Plan, which never passes one)", () => {
    renderPanel(makeReportEnvelope("Finance"), undefined);
    expect(screen.queryByTestId("apr-major-mismatch-warning")).toBeNull();
  });

  it("never claims a mismatch when no report has been uploaded", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(getGetProgressReportQueryKey(), { available: true, report: null });
    render(
      <QueryClientProvider client={client}>
        <WorkdayAprPanel planningMajorTitle="Computer Science & Engineering" />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("apr-major-mismatch-warning")).toBeNull();
    expect(screen.getByTestId("apr-none-uploaded")).toBeTruthy();
  });
});
