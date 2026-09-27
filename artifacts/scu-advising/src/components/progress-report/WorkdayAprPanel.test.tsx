// @vitest-environment jsdom
/**
 * The planning sidebar APR: several documents, each collapsible, rows grouped
 * under Workday's own headings, upload date always visible, and no Academic
 * Period / Units / Grade anywhere.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProgressReportSidebar } from "@workspace/api-client-react";
import { financeSidebarDocument, minorSidebarDocument, sidebar, testReport } from "./apr-test-data";

let query: { data?: ProgressReportSidebar; isLoading: boolean; isError: boolean; refetch: () => void };

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return { ...actual, useGetProgressReportSidebar: () => query };
});

import { WorkdayAprPanel } from "./WorkdayAprPanel";

beforeEach(() => {
  query = {
    data: sidebar([
      financeSidebarDocument(),
      {
        ...financeSidebarDocument({ id: 2, label: "Computer Science Major", category: "second_major" }),
      },
      minorSidebarDocument(),
    ]),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
});
afterEach(cleanup);

const doc = (id: number) => screen.getByTestId(`apr-sidebar-document-${id}`);
const docToggle = (id: number) => screen.getByTestId(`apr-sidebar-document-toggle-${id}`);
/** The toggle of a GROUP (never the document header, which can share its wording). */
const groupToggle = (scope: HTMLElement, name: RegExp): HTMLElement => {
  const hit = [...scope.querySelectorAll<HTMLElement>("[data-group-key] button")].filter((b) =>
    name.test(b.textContent ?? ""),
  );
  expect(hit, String(name)).toHaveLength(1);
  return hit[0]!;
};

describe("several APR documents", () => {
  it("lists every APR with its label, what it is for, and its upload date", () => {
    render(<WorkdayAprPanel />);
    expect(docToggle(1).textContent).toMatch(/^Finance Major/);
    expect(docToggle(2).textContent).toMatch(/^Computer Science Major/);
    expect(docToggle(3).textContent).toMatch(/^Data Science Minor/);
    expect(screen.getByTestId("apr-sidebar-uploaded-1").textContent).toBe("Uploaded Sep 26, 2026");
    expect(screen.getByTestId("apr-sidebar-uploaded-3").textContent).toBe("Uploaded Sep 23, 2026");
    expect(doc(2).textContent).toMatch(/Second Major/);
    expect(doc(3).textContent).toMatch(/Minor/);
  });

  it("never words the upload date as a Workday timestamp", () => {
    render(<WorkdayAprPanel />);
    expect(document.body.textContent).not.toMatch(/last updated by workday|updated by workday|as of workday/i);
  });

  it("opens the first APR and leaves the others collapsed to their header", () => {
    render(<WorkdayAprPanel />);
    expect(docToggle(1).getAttribute("aria-expanded")).toBe("true");
    expect(docToggle(2).getAttribute("aria-expanded")).toBe("false");
    expect(docToggle(3).getAttribute("aria-expanded")).toBe("false");
    // A collapsed APR renders none of its rows.
    expect(within(doc(3)).queryByText(/Minor GPA/)).toBeNull();
  });

  it("collapses an entire APR so only its header remains, and expands another", () => {
    render(<WorkdayAprPanel />);
    fireEvent.click(docToggle(1));
    expect(docToggle(1).getAttribute("aria-expanded")).toBe("false");
    expect(doc(1).querySelectorAll("[data-group-key]").length).toBe(0);
    expect(docToggle(1).textContent).toMatch(/^Finance Major/);

    fireEvent.click(docToggle(3));
    expect(docToggle(3).getAttribute("aria-expanded")).toBe("true");
    // A single-group APR opens its one group.
    expect(within(doc(3)).getByText("Data Science Minor : Minor GPA")).toBeTruthy();
  });
});

describe("grouping inside an APR", () => {
  it("offers University Requirements, Core and the literal major heading, in source order", () => {
    render(<WorkdayAprPanel />);
    const groups = [...doc(1).querySelectorAll("[data-group-key] button")].map((b) => b.textContent);
    expect(groups).toEqual(["University Requirements1 row", "Core2 rows", "Finance Major1 row"]);
  });

  it("expands and collapses each group; the controls carry aria-expanded and aria-controls", () => {
    render(<WorkdayAprPanel />);
    for (const name of [/^University Requirements/, /^Core/, /^Finance Major/]) {
      const toggle = groupToggle(doc(1), name);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      const panel = document.getElementById(toggle.getAttribute("aria-controls")!)!;
      expect(panel.hidden).toBe(true);
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(panel.hidden).toBe(false);
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("shows Workday's text exactly, in a table, with the status as words", () => {
    render(<WorkdayAprPanel />);
    fireEvent.click(groupToggle(doc(1), /^Core/));
    const table = within(doc(1)).getByRole("table", { name: /Core/ });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Requirement",
      "Status",
      "Remaining",
      "Satisfied With",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["Core: LSB: CTW 1", "Satisfied", "", "ENGL 1A - Critical Thinking and Writing I"],
      ["Core: LSB: C&I 2", "Not Satisfied", "Minimum 1 Course(s)", ""],
    ]);
  });

  it("keeps the major's own wording inside a generic-looking accordion", () => {
    render(<WorkdayAprPanel />);
    fireEvent.click(groupToggle(doc(1), /^Finance Major/));
    expect(within(doc(1)).getByText("Finance Major : FNCE 121 & 124")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Major Requirements/);
  });
});

describe("what the sidebar leaves out", () => {
  it("has no Academic Period, Units or Grade column, and says so", () => {
    render(<WorkdayAprPanel />);
    for (const name of [/^University Requirements/, /^Core/, /^Finance Major/]) {
      fireEvent.click(groupToggle(doc(1), name));
    }
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).not.toContain("Academic Period");
    expect(headers).not.toContain("Units");
    expect(headers).not.toContain("Grade");
    expect(within(doc(1)).getByTestId("apr-sidebar-omitted").textContent).toBe(
      "Not shown here: Academic Period, Units, Grade.",
    );
  });

  it("draws no conclusion of its own: no tallies, matches, checkmarks or verdicts", () => {
    render(<WorkdayAprPanel />);
    for (const name of [/^University Requirements/, /^Core/, /^Finance Major/]) {
      fireEvent.click(groupToggle(doc(1), name));
    }
    expect(document.body.textContent).not.toMatch(
      /verified|needs review|matched|completed \d|remaining \d|\d+ of \d+|not in the campusval catalog|verify in workday/i,
    );
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    const source = readFileSync(resolve(__dirname, "./WorkdayAprPanel.tsx"), "utf8");
    expect(source).not.toMatch(/useListCourses|useGetDegreeRequirements|catalog|completedCourses|reconcile/);
  });
});

describe("states", () => {
  it("no APR: a concise, optional invitation to upload", () => {
    query = { ...query, data: sidebar([]) };
    render(<WorkdayAprPanel />);
    const empty = screen.getByTestId("apr-none-uploaded");
    expect(empty.textContent).toMatch(/No APRs uploaded yet/);
    expect(empty.textContent).toMatch(/optional/i);
    expect(screen.getByTestId("apr-upload-link").getAttribute("href")).toBe("/progress-report");
  });

  it("always links to the full APR page", () => {
    render(<WorkdayAprPanel />);
    const link = screen.getByTestId("link-view-full-aprs");
    expect(link.textContent).toMatch(/View Full APRs/);
    expect(link.getAttribute("href")).toBe("/progress-report");
  });

  it("a broken APR is flagged on its own; the healthy ones still render", () => {
    query = {
      ...query,
      data: sidebar([
        {
          report: testReport({
            id: 9,
            label: "Broken",
            importStatus: "failed",
            importErrorCode: "malformed_workbook",
            importErrorMessage: "This workbook is damaged and could not be opened.",
          }),
          state: "import_failed",
          sheets: [],
        },
        financeSidebarDocument(),
      ]),
    };
    render(<WorkdayAprPanel />);
    expect(within(doc(9)).getByTestId("apr-sidebar-failed").textContent).toMatch(/damaged/);
    expect(document.body.textContent).not.toMatch(/Error:|at \w+ \(/);
    fireEvent.click(docToggle(1));
    expect(groupToggle(doc(1), /^Core/)).toBeTruthy();
  });

  it("an unrecognised layout sends the student to the full APR instead of guessing", () => {
    query = {
      ...query,
      data: sidebar([
        {
          report: testReport({ id: 5, label: "New Layout" }),
          state: "unrecognized_layout",
          sheets: [
            { name: "Progress", index: 0, structured: false, columns: [], omittedColumns: [], groups: [], preambleRowCount: 0, warnings: ["header_not_found"] },
          ],
        },
      ]),
    };
    render(<WorkdayAprPanel />);
    const notice = within(doc(5)).getByTestId("apr-sidebar-unrecognized");
    expect(notice.textContent).toMatch(/Nothing was lost/);
    expect(within(notice).getByRole("link").getAttribute("href")).toBe("/progress-report");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a PDF is offered as an original, not summarised", () => {
    query = {
      ...query,
      data: sidebar([{ report: testReport({ id: 6, label: "Old PDF", sourceFormat: "pdf" }), state: "original_only", sheets: [] }]),
    };
    render(<WorkdayAprPanel />);
    expect(within(doc(6)).getByTestId("apr-sidebar-pdf").textContent).toMatch(/Excel \(\.xlsx\)/);
  });

  it("a PDF whose table was read is shown like any other APR, and says where it came from", () => {
    query = {
      ...query,
      data: sidebar([financeSidebarDocument({ id: 7, label: "My PDF", sourceFormat: "pdf", tableFromPdf: true })]),
    };
    render(<WorkdayAprPanel />);
    expect(within(doc(7)).getByTestId("apr-sidebar-from-pdf").textContent).toMatch(/Read from the table in your PDF/);
    expect(groupToggle(doc(7), /^Core/)).toBeTruthy();
    expect(within(doc(7)).queryByTestId("apr-sidebar-pdf")).toBeNull();
  });

  it("a failed load offers a retry and does not claim there is no APR", () => {
    const refetch = vi.fn();
    query = { data: undefined, isLoading: false, isError: true, refetch };
    render(<WorkdayAprPanel />);
    expect(screen.queryByTestId("apr-none-uploaded")).toBeNull();
    fireEvent.click(screen.getByTestId("apr-retry"));
    expect(refetch).toHaveBeenCalled();
  });

  it("the scroll region is keyboard reachable and labelled", () => {
    render(<WorkdayAprPanel />);
    const region = screen.getByRole("region", { name: /Academic Progress Reports from Workday/ });
    expect(region.getAttribute("tabindex")).toBe("0");
  });
});

describe("one export holding several programs", () => {
  const group = (blockIndex: number, block: string, kind: string, label: string, first: string) => ({
    key: `b${blockIndex}:${label}`,
    kind: kind as "core",
    label,
    block,
    blockIndex,
    rows: [{ r: blockIndex * 10 + label.length, cells: [first, "Satisfied", "", ""] }],
  });

  beforeEach(() => {
    const doc = financeSidebarDocument({ id: 8, label: "My Academic Progress" });
    doc.sheets[0]!.groups = [
      group(0, "Finance Major Requirements", "university", "University Requirements", "University Requirement: GPA"),
      group(0, "Finance Major Requirements", "core", "Core", "Core: LSB: CTW 1"),
      group(0, "Finance Major Requirements", "major", "Finance Major", "Finance Major : FNCE 124"),
      group(1, "Mathematics Major Requirements", "university", "University Requirements", "University Requirement: GPA"),
      group(1, "Mathematics Major Requirements", "core", "Core", "Core: CAS: CTW 1"),
      group(1, "Mathematics Major Requirements", "major", "Mathematics Major", "Mathematics Major GPA"),
      group(2, "Real Estate Minor Requirements", "minor", "Real Estate Minor", "Real Estate Minor: FNCE 118"),
    ];
    query = { ...query, data: sidebar([doc]) };
  });

  const blocks = () => [...doc(8).querySelectorAll<HTMLElement>('[data-testid="apr-sidebar-block"]')];
  const blockToggle = (el: HTMLElement) => el.querySelector<HTMLElement>(":scope > h4 > button")!;

  it("shows each program as its own collapsible block, titled as Workday titles it", () => {
    render(<WorkdayAprPanel />);
    expect(blocks().map((b) => b.dataset.blockTitle)).toEqual([
      "Finance Major Requirements",
      "Mathematics Major Requirements",
      "Real Estate Minor Requirements",
    ]);
    expect(blocks().map((b) => blockToggle(b).getAttribute("aria-expanded"))).toEqual(["true", "false", "false"]);
  });

  it("keeps each program's Core apart", () => {
    render(<WorkdayAprPanel />);
    const [finance, math] = blocks();
    fireEvent.click(blockToggle(math!));
    fireEvent.click(groupToggle(finance!, /^Core/));
    fireEvent.click(groupToggle(math!, /^Core/));
    expect(finance!.textContent).toContain("Core: LSB: CTW 1");
    expect(finance!.textContent).not.toContain("Core: CAS: CTW 1");
    expect(math!.textContent).toContain("Core: CAS: CTW 1");
    expect(math!.textContent).not.toContain("Core: LSB: CTW 1");
  });

  it("collapses a whole program block", () => {
    render(<WorkdayAprPanel />);
    const [finance] = blocks();
    fireEvent.click(blockToggle(finance!));
    expect(blockToggle(finance!).getAttribute("aria-expanded")).toBe("false");
    expect(finance!.querySelectorAll("[data-group-key]").length).toBe(0);
  });

  it("opens a single-group block (a minor) straight to its rows", () => {
    render(<WorkdayAprPanel />);
    const minor = blocks()[2]!;
    fireEvent.click(blockToggle(minor));
    expect(minor.textContent).toContain("Real Estate Minor: FNCE 118");
  });
});
