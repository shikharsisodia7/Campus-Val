/**
 * Where CampusVal will offer an in-place tracking control — and, more
 * importantly, where it will not.
 */
import { describe, it, expect } from "vitest";
import { detectTrackingLayout, normalizeHeader, type LayoutRow } from "./tracking-layout";

type Cell = string | null;

/** Rows of plain cells -> the sparse shape the detector reads. */
function grid(rows: Cell[][], emphasizedRows: number[] = []): LayoutRow[] {
  return rows
    .map((cells, r) => ({
      r,
      cells: cells
        .map((text, c) => ({ c, text: text ?? "", emphasized: emphasizedRows.includes(r) }))
        .filter((cell) => cell.text !== ""),
    }))
    .filter((row) => row.cells.length > 0);
}

const NONE = new Set<string>();
const at = (layout: ReturnType<typeof detectTrackingLayout>) => layout.cells.map((c) => `${c.r}:${c.c}:${c.field}`);

describe("normalizeHeader", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeHeader("  Quarter  Completed: ")).toBe("quarter completed");
    expect(normalizeHeader("Quarter/Year")).toBe("quarter year");
    expect(normalizeHeader("Quarter & Year")).toBe("quarter and year");
    expect(normalizeHeader("Completed?")).toBe("completed");
  });
});

describe("a checksheet with explicit student columns", () => {
  const rows = grid(
    [
      ["Requirement", "Course", "Status", "Quarter Completed", "Notes"],
      ["Lower Division", null, null, null, null],
      ["Introduction to Widgetry", "WIDG 101", null, null, "Recommended first course"],
      ["Widget Mathematics I", "WIDG 111", null, null, null],
    ],
    [0, 1],
  );
  const layout = detectTrackingLayout(rows, NONE, "sheet:0:Major");

  it("finds the Status and Quarter Completed columns by their headers", () => {
    expect(layout.columns.map((c) => [c.c, c.field, c.header, c.headerRow])).toEqual([
      [2, "status", "Status", 0],
      [3, "term", "Quarter Completed", 0],
    ]);
  });

  it("offers a cell on each item row, and none on the header or a section heading", () => {
    expect(at(layout)).toEqual(["2:2:status", "3:2:status", "2:3:term", "3:3:term"]);
  });

  it("never offers the Notes column, which is the department's", () => {
    expect(layout.cells.some((c) => c.c === 4)).toBe(false);
  });

  it("gives every cell a fingerprint that depends on the row it sits in", () => {
    const prints = layout.cells.map((c) => c.fingerprint);
    expect(prints.every((p) => /^[0-9a-f]{32}$/.test(p))).toBe(true);
    const [row2Status, row3Status] = layout.cells.filter((c) => c.field === "status");
    expect(row2Status!.fingerprint).not.toBe(row3Status!.fingerprint);
  });

  it("changes a row's fingerprint when that row's wording changes, and only that row's", () => {
    const reworded = detectTrackingLayout(
      grid(
        [
          ["Requirement", "Course", "Status", "Quarter Completed", "Notes"],
          ["Lower Division", null, null, null, null],
          ["History of Widgets", "WIDG 105", null, null, null],
          ["Widget Mathematics I", "WIDG 111", null, null, null],
        ],
        [0, 1],
      ),
      NONE,
      "sheet:0:Major",
    );
    const print = (l: typeof layout, r: number, c: number) => l.cells.find((x) => x.r === r && x.c === c)!.fingerprint;
    expect(print(reworded, 2, 2)).not.toBe(print(layout, 2, 2));
    expect(print(reworded, 3, 2)).toBe(print(layout, 3, 2));
  });

  it("changes every fingerprint when the same table sits in a different sheet", () => {
    const other = detectTrackingLayout(rows, NONE, "sheet:1:Other");
    expect(other.cells.map((c) => c.fingerprint)).not.toEqual(layout.cells.map((c) => c.fingerprint));
  });
});

describe("conservative: when in doubt, nothing is editable", () => {
  it("does not treat blank columns as student columns when no header names them", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Introduction to Widgetry", "WIDG 101", null, null, "Recommended first course"],
        ["Widget Mathematics I", "WIDG 111", null, null, null],
      ]),
      NONE,
      "s",
    );
    expect(layout).toEqual({ columns: [], cells: [] });
  });

  it("does not treat a DATA row containing the word Completed as a header", () => {
    const layout = detectTrackingLayout(
      grid([
        ["WIDG 101", "Introduction to Widgetry", "Completed", "Fall 2025"],
        ["WIDG 111", "Widget Mathematics I", null, null],
      ]),
      NONE,
      "s",
    );
    expect(layout.cells).toEqual([]);
  });

  it("leaves a Status column alone when the department has filled it in", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Requirement", "Course", "Status", "Notes"],
        ["Introduction to Widgetry", "WIDG 101", "Required", null],
        ["Widget Mathematics I", "WIDG 111", "Required", null],
        ["Widget Ethics", "WIDG 130", "Elective", null],
      ]),
      NONE,
      "s",
    );
    expect(layout.cells).toEqual([]);
  });

  it("offers only the EMPTY cells of a column that is mostly empty", () => {
    const rows: Cell[][] = [["Course", "Status"]];
    for (let i = 0; i < 9; i++) rows.push([`WIDG ${100 + i}`, null]);
    rows.push(["WIDG 199", "Waived by department"]);
    const layout = detectTrackingLayout(grid(rows), NONE, "s");
    expect(layout.cells).toHaveLength(9);
    expect(layout.cells.some((c) => c.r === 10)).toBe(false);
  });

  it("accepts a bare 'Year' column only when it is completely empty", () => {
    const empty = detectTrackingLayout(grid([["Course", "Year"], ["WIDG 101", null], ["WIDG 111", null]]), NONE, "s");
    expect(at(empty)).toEqual(["1:1:both", "2:1:both"]);

    const rows: Cell[][] = [["Course", "Year"]];
    for (let i = 0; i < 9; i++) rows.push([`WIDG ${100 + i}`, null]);
    rows.push(["WIDG 199", "Senior"]);
    expect(detectTrackingLayout(grid(rows), NONE, "s").cells).toEqual([]);
  });

  it("requires the header row to say what is being tracked", () => {
    // "Status" and "Quarter" alone, with nothing naming the items.
    const layout = detectTrackingLayout(grid([["Status", "Quarter"], ["x", null]]), NONE, "s");
    expect(layout.cells).toEqual([]);
  });

  it("ignores long sentences that merely contain a header word", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Course", "Status of this requirement as determined by the department chair each year"],
        ["WIDG 101", null],
      ]),
      NONE,
      "s",
    );
    expect(layout.cells).toEqual([]);
  });

  it("never offers a cell hidden under a merged range", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Course", "Status"],
        ["WIDG 101", null],
        ["WIDG 111", null],
      ]),
      new Set(["1:1"]),
      "s",
    );
    expect(at(layout)).toEqual(["2:1:both"]);
  });
});

describe("tables with more than one region", () => {
  it("handles two lists side by side, each with its own Status column", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Course", "Status", "Course", "Status"],
        ["WIDG 101", null, "GADG 10", null],
        ["WIDG 111", null, "GADG 20", null],
      ]),
      NONE,
      "s",
    );
    expect(layout.columns.map((c) => c.c)).toEqual([1, 3]);
    expect(at(layout)).toEqual(["1:1:both", "2:1:both", "1:3:both", "2:3:both"]);
  });

  it("starts a new region at each header row", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Course", "Status"],
        ["WIDG 101", null],
        ["Course", "Units", "Quarter"],
        ["WIDG 120", "4", null],
      ]),
      NONE,
      "s",
    );
    expect(at(layout)).toEqual(["1:1:both", "3:2:both"]);
    expect(layout.columns.map((c) => c.headerRow)).toEqual([0, 2]);
  });
});

describe("what a student column holds", () => {
  it("holds both a status and a quarter when it is the table's only kind of student column", () => {
    const layout = detectTrackingLayout(grid([["Course", "Quarter Completed"], ["WIDG 101", null]]), NONE, "s");
    expect(layout.columns.map((c) => c.field)).toEqual(["both"]);
    expect(at(layout)).toEqual(["1:1:both"]);
  });

  it("holds one value each when the table has a status column AND a quarter column", () => {
    const layout = detectTrackingLayout(grid([["Course", "Status", "Quarter"], ["WIDG 101", null, null]]), NONE, "s");
    expect(at(layout)).toEqual(["1:1:status", "1:2:term"]);
  });
});

describe("two tables side by side, as the real checklists are laid out", () => {
  // Requirements on the left; a four-year grid on the right with its own column.
  const rows = grid(
    [
      ["Requirements", "Quarter Completed", null, "Course", "Quarter"],
      ["Lower Division", null, null, "First Year", null],
      ["WIDG 101", null, null, "WIDG 101", null],
      ["WIDG 111", null, null, null, null],
      [null, null, null, "GADG 10", null],
    ],
    [0, 1],
  );
  const layout = detectTrackingLayout(rows, NONE, "s");

  it("offers a cell only in the rows that name something for that column", () => {
    // Left column: rows 2 and 3. Right column: rows 2 and 4. Row 1 is a heading in both.
    expect(at(layout)).toEqual(["2:1:both", "3:1:both", "2:4:both", "4:4:both"]);
  });

  it("fingerprints a cell by its own table's wording, not by its neighbour's", () => {
    const changedNeighbour = detectTrackingLayout(
      grid(
        [
          ["Requirements", "Quarter Completed", null, "Course", "Quarter"],
          ["Lower Division", null, null, "First Year", null],
          ["WIDG 101", null, null, "Something else entirely", null],
          ["WIDG 111", null, null, null, null],
          [null, null, null, "GADG 10", null],
        ],
        [0, 1],
      ),
      NONE,
      "s",
    );
    const print = (l: typeof layout, r: number, c: number) => l.cells.find((x) => x.r === r && x.c === c)!.fingerprint;
    expect(print(changedNeighbour, 2, 1)).toBe(print(layout, 2, 1));
    expect(print(changedNeighbour, 2, 4)).not.toBe(print(layout, 2, 4));
  });
});

describe("section headings", () => {
  it("is a heading when its one label is bold, and an item when it is not", () => {
    const rows: LayoutRow[] = [
      { r: 0, cells: [{ c: 0, text: "Requirements" }, { c: 1, text: "Quarter Completed" }] },
      { r: 1, cells: [{ c: 0, text: "Upper Division", emphasized: true }] },
      { r: 2, cells: [{ c: 0, text: "One course in Widget History" }] },
    ];
    expect(at(detectTrackingLayout(rows, NONE, "s"))).toEqual(["2:1:both"]);
  });
});

describe("what a column holds is decided per table, among the columns really offered", () => {
  it("gives the one student column both values when the header's other column is the department's", () => {
    // As the real checklists are: "Status" for the student, and a "Year" column the department filled in.
    const layout = detectTrackingLayout(
      grid([
        ["Foundations", "Status", "Notes", "Year", "Fall"],
        ["Cultures and Ideas 1", null, null, "Year 1 Course 1", null],
        ["Cultures and Ideas 2", null, null, "Year 1 Course 2", null],
      ]),
      NONE,
      "s",
    );
    expect(layout.columns.map((c) => [c.c, c.field, c.header])).toEqual([[1, "both", "Status"]]);
    expect(at(layout)).toEqual(["1:1:both", "2:1:both"]);
  });

  it("keeps a table's Status and Quarter columns apart even when another table has one column", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Course", "Status", "Quarter", "Elective", "Completed"],
        ["WIDG 101", null, null, "GADG 10", null],
      ]),
      NONE,
      "s",
    );
    expect(at(layout)).toEqual(["1:1:status", "1:2:term", "1:4:both"]);
  });

  it("offers a Quarter column that follows a Status column in the rows of their shared table", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Course", "Status", "Quarter", "Elective", "Completed"],
        ["WIDG 101", null, null, null, null],
        [null, null, null, "GADG 10", null],
      ]),
      NONE,
      "s",
    );
    expect(at(layout)).toEqual(["1:1:status", "1:2:term", "2:4:both"]);
  });
});

describe("a header row whose first cell is the table's title", () => {
  it("is still a header when the title is longer than a column header may be", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Applied Widgetry and Sprocket Studies Minor", "Quarter", "Notes"],
        ["One upper-division course", null, null],
      ]),
      NONE,
      "s",
    );
    expect(at(layout)).toEqual(["1:1:both"]);
  });

  it("is not a header when a cell is a sentence", () => {
    const layout = detectTrackingLayout(
      grid([
        ["Students must complete every course listed below with a grade of C or better before graduating", "Quarter", "Notes"],
        ["One upper-division course", null, null],
      ]),
      NONE,
      "s",
    );
    expect(layout.cells).toEqual([]);
  });
});
