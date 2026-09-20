// @vitest-environment jsdom
/**
 * The APR page (ReportCard) shows the SAME structured view as the sidebar,
 * hides grades until asked, and handles processing / failure / missing-source
 * states without going blank.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return { ...actual, useListProgressReportMappings: () => ({ data: { mappings: [] } }), };
});

import { ReportCard } from "./ReportCard";

afterEach(cleanup);

const base = {
  id: 1, fileName: "Fall2026-APR.pdf", fileSize: 2048, contentType: "application/pdf",
  uploadedAt: "2026-09-01T00:00:00.000Z", createdAt: "", updatedAt: "", parseStatus: "parsed",
  parsed: {
    completedCourses: [{ code: "CSCI 10", title: "Intro", units: 5, confidence: "high" }],
    possibleCourses: [], notes: ["Extraction is conservative and may be incomplete."],
    summary: { totalUnits: { name: "Total", status: "in_progress", requiredUnits: 180, detail: null, order: 1 } },
    groups: [{ name: "X Major Requirements", kind: "major", requirements: [
      { name: "Core", status: "completed", courses: [{ code: "CSCI 10", title: "Intro", units: 5, grade: "A", inCatalog: true }] },
      { name: "Mystery", status: "needs_review", sourceText: "Mystery ??", courses: [] },
    ] }],
  },
} as any;

const renderCard = (report: any) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ReportCard report={report} onDelete={vi.fn()} onReplace={vi.fn()} isDeleting={false} />
    </QueryClientProvider>,
  );

describe("ReportCard (APR page)", () => {
  it("renders the shared structured view in its page variant with the processing notes", () => {
    renderCard(base);
    expect(screen.getByTestId("apr-structured-view").getAttribute("data-variant")).toBe("page");
    expect(screen.getByTestId("list-parsed-notes").textContent).toMatch(/conservative/);
    expect(screen.getByTestId("apr-units-total")).toBeTruthy();
  });

  it("hides grades by default and shows them only after the explicit toggle", () => {
    renderCard(base);
    expect(document.body.textContent).not.toMatch(/\(A\)/);
    const toggle = screen.getByTestId("toggle-show-grades") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(document.body.textContent).toMatch(/\(A\)/);
    fireEvent.click(toggle);
    expect(document.body.textContent).not.toMatch(/\(A\)/);
  });

  it("offers no grade toggle when the report has no grades at all", () => {
    const noGrades = structuredClone(base);
    noGrades.parsed.groups[0].requirements[0].courses[0].grade = null;
    renderCard(noGrades);
    expect(screen.queryByTestId("toggle-show-grades")).toBeNull();
  });

  it("shows the original file link and upload metadata", () => {
    renderCard(base);
    expect(screen.getByTestId("link-view-file").getAttribute("href")).toContain("/api/progress-report/file");
    expect(screen.getByTestId("text-file-name").textContent).toBe("Fall2026-APR.pdf");
  });

  it("original file gone: alerts, removes the dead link, still shows the extracted structure and replace/delete", () => {
    renderCard({ ...base, sourceFile: "missing" });
    expect(screen.getByTestId("alert-source-missing").textContent).toMatch(/can no longer be read/);
    expect(screen.queryByTestId("link-view-file")).toBeNull();
    expect(screen.getByTestId("apr-structured-view")).toBeTruthy();
    expect(screen.getByTestId("button-replace-report")).toBeTruthy();
    expect(screen.getByTestId("button-delete-report")).toBeTruthy();
  });

  it("still processing", () => {
    renderCard({ ...base, parseStatus: "pending", parsed: null });
    expect(screen.getByTestId("apr-pending").textContent).toMatch(/still being processed/);
    expect(screen.queryByTestId("apr-structured-view")).toBeNull();
  });

  it("processing failed: says so and keeps replace available", () => {
    renderCard({ ...base, parseStatus: "failed", parsed: { completedCourses: [], possibleCourses: [], notes: ["An unexpected error occurred during parsing."] } });
    expect(screen.getByTestId("card-parse-error").textContent).toMatch(/couldn't be read reliably/);
    expect(screen.getByTestId("button-replace-report")).toBeTruthy();
  });

  it("parsed but nothing recognizable: explains, never blank", () => {
    renderCard({ ...base, parsed: { completedCourses: [], possibleCourses: [], notes: ["No course rows could be reliably identified."] } });
    expect(screen.getByTestId("apr-no-structure")).toBeTruthy();
    expect(screen.getByTestId("list-parse-notes").textContent).toMatch(/No course rows/);
  });

  it("replacement is confirmed before it discards the old report", () => {
    const onReplace = vi.fn();
    render(<ReportCard report={base} onDelete={vi.fn()} onReplace={onReplace} isDeleting={false} />);
    fireEvent.click(screen.getByTestId("button-replace-report"));
    expect(onReplace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-replace-confirm"));
    expect(onReplace).toHaveBeenCalledTimes(1);
  });
});
