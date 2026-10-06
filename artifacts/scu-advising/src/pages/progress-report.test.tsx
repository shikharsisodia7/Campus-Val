// @vitest-environment jsdom
/**
 * The full APR page: every uploaded APR in its own collapsible container,
 * each with its upload date and its own actions, showing the whole workbook.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProgressReportList } from "@workspace/api-client-react";
import { financeWorkbook, testReport } from "@/components/progress-report/apr-test-data";

let listQuery: { data?: ProgressReportList; isLoading: boolean; isError: boolean; refetch: () => void };
const deleteMutate = vi.fn();
const workbookRequests: number[] = [];

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useListProgressReports: () => listQuery,
    useGetProgressReportWorkbook: (id: number) => {
      workbookRequests.push(id);
      return { data: { report: testReport({ id }), workbook: financeWorkbook }, isLoading: false, isError: false, refetch: vi.fn() };
    },
    useDeleteProgressReportDocument: () => ({ mutate: deleteMutate, isPending: false }),
    useUpdateProgressReportDocument: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: any) => <div>{children}</div>,
  PageHeader: ({ title, subtitle }: any) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  ),
  PageContent: ({ children }: any) => <main>{children}</main>,
}));
vi.mock("@/hooks/use-track-usage", () => ({ useTrackUsage: () => {} }));
// These tests are about the page's own content (the center region). The comparison shell, the Planning Requirements and the compact APR have their own tests.
vi.mock("@/components/degree-plan/PlanningComparisonWorkspace", () => ({
  PlanningComparisonWorkspace: ({ main }: { main: React.ReactNode }) => <>{main}</>,
}));

import ProgressReportPage from "./progress-report";

const three: ProgressReportList = {
  available: true,
  maxUploadBytes: 10 * 1024 * 1024,
  maxDocuments: 12,
  reports: [
    testReport({ id: 1, label: "Finance Major", category: "primary_major" }),
    testReport({ id: 2, label: "Computer Science Major", category: "second_major" }),
    testReport({ id: 3, label: "Data Science Minor", category: "minor", uploadedAt: "2026-09-23T18:00:00.000Z" }),
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProgressReportPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listQuery = { data: three, isLoading: false, isError: false, refetch: vi.fn() };
  workbookRequests.length = 0;
  deleteMutate.mockClear();
});
afterEach(cleanup);

const card = (id: number) => screen.getByTestId(`apr-document-${id}`);
const toggle = (id: number) => screen.getByTestId(`apr-document-toggle-${id}`);

describe("APR page with several documents", () => {
  it("lists every APR with its own header and upload date", () => {
    renderPage();
    expect(screen.getByTestId("apr-document-count").textContent).toMatch(/^3 APRs uploaded/);
    expect(within(card(1)).getByTestId("apr-document-label").textContent).toBe("Finance Major");
    expect(within(card(2)).getByTestId("apr-document-label").textContent).toBe("Computer Science Major");
    expect(within(card(3)).getByTestId("apr-document-label").textContent).toBe("Data Science Minor");
    for (const id of [1, 2, 3]) {
      expect(within(card(id)).getByTestId("apr-document-uploaded").textContent).toMatch(/^Uploaded Sep 2[36], 2026 at /);
    }
    expect(document.body.textContent).not.toMatch(/updated by workday/i);
  });

  it("does not force every workbook open: all start collapsed and none is fetched", () => {
    renderPage();
    for (const id of [1, 2, 3]) expect(toggle(id).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("apr-workbook-table")).toBeNull();
    expect(workbookRequests).toEqual([]);
  });

  it("opens one APR at a time, independently, and collapses it again", () => {
    renderPage();
    fireEvent.click(toggle(2));
    expect(toggle(2).getAttribute("aria-expanded")).toBe("true");
    expect(toggle(1).getAttribute("aria-expanded")).toBe("false");
    expect(within(card(2)).getByTestId("apr-workbook-table")).toBeTruthy();
    expect(new Set(workbookRequests)).toEqual(new Set([2]));

    fireEvent.click(toggle(2));
    expect(toggle(2).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("apr-workbook-table")).toBeNull();
  });

  it("the opened APR shows grades, units and academic period, and says it is unmodified", () => {
    renderPage();
    fireEvent.click(toggle(1));
    const table = within(card(1)).getByTestId("apr-workbook-table");
    for (const text of ["Academic Period", "Units", "Grade", "Fall 2025 Quarter", "4.5", "A-"]) {
      expect(table.textContent).toContain(text);
    }
    expect(within(card(1)).getByTestId("apr-full-notice").textContent).toMatch(/has not changed, matched or judged/);
    expect(document.body.textContent).not.toMatch(/Completed Courses|Remaining Requirements|Needs Review|Auto-verified/i);
  });

  it("offers Upload another APR rather than only a replace", () => {
    renderPage();
    expect(screen.queryByTestId("card-upload-form")).toBeNull();
    fireEvent.click(screen.getByTestId("button-upload-another"));
    const form = screen.getByTestId("card-upload-form");
    expect(form.textContent).toMatch(/Upload another APR/);
    expect(within(form).getByTestId("upload-supported-format").textContent).toMatch(/\.xlsx/);
    // Existing documents stay listed while adding one.
    expect(card(1)).toBeTruthy();
    // A label is required before anything can be uploaded.
    expect((screen.getByTestId("button-upload") as HTMLButtonElement).disabled).toBe(true);
  });

  it("each APR has its own original-file link, by stable id", () => {
    renderPage();
    expect(screen.getByTestId("apr-view-original-2").getAttribute("href")).toMatch(/api\/progress-reports\/2\/file$/);
    expect(screen.getByTestId("apr-view-original-3").getAttribute("href")).toMatch(/api\/progress-reports\/3\/file$/);
  });

  it("deleting asks first and deletes only the selected APR", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("apr-delete-2"));
    expect(deleteMutate).not.toHaveBeenCalled();
    const dialog = screen.getByTestId("apr-delete-dialog");
    expect(dialog.textContent).toMatch(/Delete “Computer Science Major”\?/);
    expect(dialog.textContent).toMatch(/other APRs.*not changed/i);
    fireEvent.click(screen.getByTestId("apr-delete-confirm"));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0]![0]).toEqual({ id: 2 });
  });

  it("replace is scoped to one APR and promises to keep the current file until the new one is read", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("apr-replace-3"));
    const form = within(card(3)).getByTestId("apr-replace-form");
    expect(form.textContent).toMatch(/Replace the file for “Data Science Minor”/);
    expect(form.textContent).toMatch(/Only this APR is replaced/);
    expect(within(card(1)).queryByTestId("apr-replace-form")).toBeNull();
  });

  it("a failed import is reported for that APR alone", () => {
    listQuery = {
      ...listQuery,
      data: {
        ...three,
        reports: [
          testReport({ id: 1 }),
          testReport({
            id: 7,
            label: "Broken",
            importStatus: "failed",
            importErrorCode: "malformed_workbook",
            importErrorMessage: "This workbook is damaged and could not be opened.",
          }),
        ],
      },
    };
    renderPage();
    fireEvent.click(toggle(7));
    expect(within(card(7)).getByTestId("apr-import-problem-7").textContent).toMatch(/Import failed.*damaged/s);
    expect(within(card(7)).getByTestId("apr-document-status").textContent).toBe("Import failed");
    fireEvent.click(toggle(1));
    expect(within(card(1)).getByTestId("apr-workbook-table")).toBeTruthy();
  });
});

describe("APR page without documents", () => {
  it("shows the upload form, Excel-first, and links back to planning", () => {
    listQuery = { ...listQuery, data: { ...three, reports: [] } };
    renderPage();
    expect(screen.getByTestId("card-upload-form").textContent).toMatch(/Excel \(\.xlsx\)/);
    expect(screen.queryByTestId("button-upload-another")).toBeNull();
    expect(screen.getByTestId("link-back-degree-plan").getAttribute("href")).toBe("/degree-plan");
    expect(screen.getByTestId("link-back-quarter-plan").getAttribute("href")).toBe("/planner");
  });

  it("explains when storage is not configured instead of showing a form", () => {
    listQuery = { ...listQuery, data: { ...three, available: false, reports: [] } };
    renderPage();
    expect(screen.getByTestId("card-storage-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("card-upload-form")).toBeNull();
  });
});
