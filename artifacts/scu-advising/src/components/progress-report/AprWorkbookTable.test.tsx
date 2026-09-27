// @vitest-environment jsdom
/**
 * The full APR: a faithful, read-only copy of the uploaded workbook.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AprSheet } from "@workspace/api-client-react";
import { AprWorkbookTable } from "./AprWorkbookTable";
import { financeSheet } from "./apr-test-data";

afterEach(cleanup);

const bodyRows = () => within(screen.getByTestId("apr-workbook-table")).getAllByRole("row").slice(1);
const cellsOf = (row: HTMLElement) => within(row).queryAllByRole("cell").map((c) => c.textContent);

describe("AprWorkbookTable", () => {
  it("shows every column Workday exported, including Academic Period, Units and Grade", () => {
    render(<AprWorkbookTable sheet={financeSheet} caption="Finance Major" />);
    const header = bodyRows().find((r) => cellsOf(r)[0] === "Requirement")!;
    expect(cellsOf(header)).toEqual([
      "Requirement",
      "Status",
      "Remaining",
      "Satisfied With",
      "Academic Period",
      "Units",
      "Grade",
    ]);
    const text = screen.getByTestId("apr-workbook-table").textContent!;
    expect(text).toContain("Fall 2025 Quarter");
    expect(text).toContain("4.5");
    expect(text).toContain("A-");
  });

  it("keeps source row order and numbers rows as they are numbered in Excel", () => {
    render(<AprWorkbookTable sheet={financeSheet} caption="Finance Major" />);
    const numbers = bodyRows().map((r) => within(r).getByRole("rowheader").textContent);
    // Row 2 is the blank row the export left between the title and the table.
    expect(numbers).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(bodyRows().map((r) => cellsOf(r)[0])).toEqual([
      "View My Academic Progress — Finance Major",
      "",
      "Requirement",
      "Core: LSB: CTW 1",
      "",
      "Core: LSB: C&I 2",
      '<script>alert("x")</script>',
    ]);
  });

  it("preserves blank cells so every value stays under its own column", () => {
    render(<AprWorkbookTable sheet={financeSheet} caption="Finance Major" />);
    const transfer = bodyRows()[4]!;
    expect(cellsOf(transfer)).toEqual([
      "",
      "",
      "",
      "ECON 2 - Principles of Macroeconomics (Transfer Credit)",
      "",
      "4.5",
      "CR",
    ]);
  });

  it("carries bold headings, fills and indentation", () => {
    render(<AprWorkbookTable sheet={financeSheet} caption="Finance Major" />);
    const headerCell = within(bodyRows()[2]!).getAllByRole("cell")[0]!;
    expect(headerCell.className).toMatch(/font-semibold/);
    expect(headerCell.className).toMatch(/bg-muted/);
    const indented = within(bodyRows()[4]!).getAllByRole("cell")[3]!;
    expect(indented.style.paddingLeft).not.toBe("");
  });

  it("renders spreadsheet text literally — markup in a cell never becomes an element", () => {
    const { container } = render(<AprWorkbookTable sheet={financeSheet} caption="Finance Major" />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("td a")).toBeNull();
    expect(screen.getByText('<script>alert("x")</script>')).toBeTruthy();
  });

  it("is read-only: nothing to type into, tick or press inside the table", () => {
    const { container } = render(<AprWorkbookTable sheet={financeSheet} caption="Finance Major" />);
    expect(container.querySelectorAll("input, textarea, select, button, [contenteditable]").length).toBe(0);
  });

  it("scrolls in both directions inside its own labelled, keyboard-reachable region", () => {
    render(<AprWorkbookTable sheet={financeSheet} caption="Finance Major" />);
    const region = screen.getByRole("region", { name: /Finance Major — scrollable/ });
    expect(region.className).toMatch(/overflow-auto/);
    expect(region.className).toMatch(/max-h-/);
    expect(region.getAttribute("tabindex")).toBe("0");
    // The table may be wider than the page; it is never squeezed to fit.
    expect(screen.getByTestId("apr-workbook-table").className).toMatch(/w-max/);
  });

  it("honours merged cells", () => {
    const sheet: AprSheet = {
      ...financeSheet,
      columnCount: 4,
      columnWidths: [null, null, null, null],
      merges: [{ r: 0, c: 1, rowSpan: 1, colSpan: 3 }],
      rows: [
        { r: 0, cells: [{ c: 0, text: "Requirement" }, { c: 1, text: "Satisfied With" }] },
        { r: 1, cells: [{ c: 1, text: "Registrations Used" }, { c: 2, text: "Units" }, { c: 3, text: "Grade" }] },
      ],
    };
    render(<AprWorkbookTable sheet={sheet} caption="Merged" />);
    const merged = screen.getByText("Satisfied With");
    expect(merged.getAttribute("colspan")).toBe("3");
    expect(cellsOf(bodyRows()[0]!)).toEqual(["Requirement", "Satisfied With"]);
  });

  it("says so when a worksheet is empty", () => {
    render(<AprWorkbookTable sheet={{ ...financeSheet, rows: [], rowCount: 0 }} caption="Empty" />);
    expect(screen.getByTestId("apr-sheet-empty").textContent).toMatch(/empty/);
  });
});
