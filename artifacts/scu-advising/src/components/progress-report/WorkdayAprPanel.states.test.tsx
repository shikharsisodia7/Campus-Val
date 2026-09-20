// @vitest-environment jsdom
/**
 * Every state the planning-page APR sidebar can be in must render something
 * useful with a next step — never a blank or crashed column — and the sidebar
 * must ask the server for the grade-free planning projection.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

let mockQuery: { data: any; isLoading: boolean; error: any; refetch: () => void } = {
  data: undefined, isLoading: false, error: null, refetch: () => {},
};
const calls: any[] = [];

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useGetProgressReport: (...args: any[]) => {
      calls.push(args);
      return mockQuery;
    },
  };
});

import { WorkdayAprPanel } from "./WorkdayAprPanel";

afterEach(() => {
  cleanup();
  calls.length = 0;
});

const report = (over: object = {}) => ({
  id: 1, fileName: "apr.pdf", fileSize: 1, contentType: "application/pdf",
  uploadedAt: "2026-09-01T00:00:00.000Z", createdAt: "", updatedAt: "", parseStatus: "parsed",
  parsed: {
    completedCourses: [], possibleCourses: [], notes: [],
    groups: [{ name: "X Major Requirements", kind: "major", requirements: [{ name: "Core", status: "remaining", courses: [] }] }],
  },
  ...over,
});
const set = (q: Partial<typeof mockQuery>) => {
  mockQuery = { data: undefined, isLoading: false, error: null, refetch: () => {}, ...q };
};

describe("WorkdayAprPanel states", () => {
  it("asks for the grade-free planning view of the report", () => {
    set({ data: { available: true, report: report() } });
    render(<WorkdayAprPanel />);
    expect(calls[0]![0]).toEqual({ view: "planning" });
  });

  it("loading", () => {
    set({ isLoading: true });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId("apr-loading")).toBeTruthy();
  });

  it("no APR uploaded: says so and links to upload (works for 404 and for a null report)", () => {
    set({ error: { status: 404 } });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId("apr-upload-link").getAttribute("href")).toBe("/progress-report");
    cleanup();
    set({ data: { available: true, report: null } });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId("apr-none-uploaded")).toBeTruthy();
  });

  it("unauthorized viewer: explains and offers no data", () => {
    set({ error: { status: 403 } });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId("apr-unauthorized").textContent).toMatch(/only ever visible to the student who uploaded/);
    expect(screen.queryByTestId("apr-structured-view")).toBeNull();
    expect(screen.queryByTestId("apr-original-report")).toBeNull();
  });

  it("load failure: retry + a path to the APR page", () => {
    const refetch = vi.fn();
    set({ error: { status: 500 }, refetch });
    render(<WorkdayAprPanel />);
    fireEvent.click(screen.getByTestId("apr-retry"));
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByTestId("apr-goto-page").getAttribute("href")).toBe("/progress-report");
  });

  it("uploads not configured", () => {
    set({ data: { available: false, report: null } });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId("apr-uploads-unavailable")).toBeTruthy();
  });

  it.each([
    ["pending", "apr-pending", /still being processed/],
    ["failed", "apr-failed", /couldn't process your report/],
    ["unsupported", "apr-unsupported", /format couldn't be read/],
  ])("%s report: names the problem, links back to the APR page, and still offers the original file", (parseStatus, testId, text) => {
    set({ data: { available: true, report: report({ parseStatus, parsed: null }) } });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId(testId).textContent).toMatch(text);
    expect(screen.getByTestId("apr-goto-page").getAttribute("href")).toBe("/progress-report");
    expect(screen.getByTestId("button-view-original-report")).toBeTruthy();
    expect(screen.queryByTestId("apr-structured-view")).toBeNull();
  });

  it("parsed but unreadable: never blank", () => {
    set({ data: { available: true, report: report({ parsed: { completedCourses: [], possibleCourses: [], notes: [] } }) } });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId("apr-no-structure").textContent).toMatch(/source of truth/);
  });

  it("ready: shows the structured view (sidebar variant)", () => {
    set({ data: { available: true, report: report() } });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId("apr-structured-view").getAttribute("data-variant")).toBe("sidebar");
    expect(screen.getByText("X Major Requirements")).toBeTruthy();
  });

  it("scrolls in a native, keyboard-focusable region (Radix ScrollArea's display:table wrapper let long text widen and clip the column)", () => {
    set({ data: { available: true, report: report({ fileName: "a-very-long-unbreakable-file-name-Fall2026-Academic-Progress-Report-FINAL-v2.pdf" }) } });
    render(<WorkdayAprPanel />);
    const region = screen.getByTestId("apr-scroll-region");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("Workday Academic Progress Report contents");
    expect(region.className).toMatch(/overflow-y-auto/);
    expect(region.className).toMatch(/overflow-x-hidden/);
    // Nothing inside is a table-layout wrapper that could grow past the panel.
    expect(region.querySelector("[data-radix-scroll-area-viewport]")).toBeNull();
    // The file name is truncatable rather than forcing width.
    expect(screen.getByTitle(/a-very-long-unbreakable/).className).toMatch(/truncate/);
  });

  it("ready but the original file is gone: warns, keeps the summary", () => {
    set({ data: { available: true, report: report({ sourceFile: "missing" }) } });
    render(<WorkdayAprPanel />);
    expect(screen.getByTestId("apr-source-missing").textContent).toMatch(/no longer available/);
    expect(screen.getByTestId("apr-structured-view")).toBeTruthy();
  });
});
