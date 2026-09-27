import { describe, it, expect } from "vitest";
import { buildAprFixture, FIXTURE_PRIVATE_MARKERS, type AprFixtureName } from "../../__fixtures__/apr/build-workbooks";
import { readAprWorkbook } from "./workbook-reader";
import { isOmittedHeader, projectForSidebar, projectionStats, type SidebarSheet } from "./sidebar-projection";
import type { AprWorkbook } from "./workbook-model";

async function project(name: AprFixtureName) {
  const workbook = await readAprWorkbook(await buildAprFixture(name));
  return { workbook, projection: projectForSidebar(workbook) };
}

const allCells = (sheet: SidebarSheet) => sheet.groups.flatMap((g) => g.rows.flatMap((r) => r.cells));

describe("sidebar projection — what is left out", () => {
  it("omits the Academic Period, Units and Grade columns", async () => {
    const { projection } = await project("finance-major");
    const sheet = projection.sheets[0]!;
    expect(sheet.structured).toBe(true);
    expect(sheet.columns.map((c) => c.header)).toEqual(["Requirement", "Status", "Remaining", "Satisfied With"]);
    expect(sheet.omittedColumns.sort()).toEqual(["Academic Period", "Grade", "Units"]);
  });

  it("never carries a period, a unit value or a grade anywhere in the payload", async () => {
    for (const name of ["finance-major", "computer-science-major", "data-science-minor", "two-row-header"] as const) {
      const { projection } = await project(name);
      const payload = JSON.stringify(projection);
      for (const period of FIXTURE_PRIVATE_MARKERS.academicPeriods) expect(payload, name).not.toContain(period);
      // Grades and units are short tokens, so they are checked cell by cell.
      const cells = projection.sheets.flatMap(allCells);
      for (const token of [...FIXTURE_PRIVATE_MARKERS.grades, ...FIXTURE_PRIVATE_MARKERS.units]) {
        expect(cells, `${name}: ${token}`).not.toContain(token);
      }
    }
  });

  it("the full workbook, by contrast, has all three", async () => {
    const { workbook } = await project("finance-major");
    const text = JSON.stringify(workbook);
    expect(text).toContain("Fall 2026 Quarter");
    expect(text).toContain('"text":"B+"');
    expect(text).toContain('"text":"4.5"');
  });

  it("recognises the omitted headers by name, whatever their position or case", () => {
    for (const h of ["Academic Period", "ACADEMIC PERIOD", "Units", "Unit", "Credits", "Grade", "Grades", " grade: "]) {
      expect(isOmittedHeader(h), h).toBe(true);
    }
    for (const h of ["Requirement", "Status", "Remaining", "Satisfied With", "Registrations Used"]) {
      expect(isOmittedHeader(h), h).toBe(false);
    }
  });

  it("handles a two-row header, labelling the column under 'Satisfied With' by its own sub-header", async () => {
    const { projection } = await project("two-row-header");
    const sheet = projection.sheets[0]!;
    expect(sheet.structured).toBe(true);
    expect(sheet.columns.map((c) => c.header)).toEqual(["Requirement", "Status", "Remaining", "Registrations Used"]);
    expect(sheet.omittedColumns.sort()).toEqual(["Academic Period", "Grade", "Units"]);
    // The sub-header row is header, not data.
    expect(allCells(sheet)).not.toContain("Registrations Used");
  });
});

describe("sidebar projection — grouping is navigation, from Workday's own words", () => {
  it("files rows under University Requirements, Core and the literal program heading, in source order", async () => {
    const { projection } = await project("finance-major");
    const groups = projection.sheets[0]!.groups;
    expect(groups.map((g) => [g.kind, g.label])).toEqual([
      ["university", "University Requirements"],
      ["core", "Core"],
      ["program", "Sample School of Business Core Knowledge"],
      ["major", "Finance Major"],
    ]);
  });

  it("keeps Workday's wording and status text untouched", async () => {
    const { projection } = await project("finance-major");
    const core = projection.sheets[0]!.groups.find((g) => g.kind === "core")!;
    expect(core.rows.map((r) => r.cells)).toEqual([
      ["Core: LSB: CTW 1", "Satisfied", "", "ENGL 1A - Critical Thinking and Writing I"],
      ["Core: LSB: C&I 1", "In Progress", "", "HIST 11A - Cultures and Ideas I (In Progress)"],
      ["Core: LSB: C&I 2", "Not Satisfied", "Minimum 1 Course(s)", ""],
      ["Core: LSB: 2nd Language (Level 2)", "Not Satisfied", "Minimum Combination Required", ""],
    ]);
  });

  it("keeps a registration row (no requirement text) with the requirement above it", async () => {
    const { projection } = await project("finance-major");
    const university = projection.sheets[0]!.groups.find((g) => g.kind === "university")!;
    expect(university.rows.map((r) => r.cells[3])).toEqual([
      "",
      "FNCE 121 - Corporate Finance",
      "ECON 2 - Principles of Macroeconomics (Transfer Credit)",
    ]);
    expect(university.rows[2]!.indent).toBeUndefined(); // indent belongs to the lead cell only
  });

  it("joins 'Minor :' and 'Minor:' spellings under one literal heading", async () => {
    const { projection } = await project("data-science-minor");
    const groups = projection.sheets[0]!.groups;
    expect(groups.map((g) => [g.kind, g.label, g.rows.length])).toEqual([["minor", "Data Science Minor", 3]]);
  });

  it("does not assume Core rows are the same for every program", async () => {
    const finance = (await project("finance-major")).projection.sheets[0]!.groups.find((g) => g.kind === "core")!;
    const cs = (await project("computer-science-major")).projection.sheets[0]!.groups.find((g) => g.kind === "core")!;
    expect(finance.rows[0]!.cells[0]).toBe("Core: LSB: CTW 1");
    expect(cs.rows[0]!.cells[0]).toBe("Core: CAS: CTW 1");
  });

  it("never drops a row: every table row is in exactly one group", async () => {
    for (const name of ["finance-major", "computer-science-major", "data-science-minor"] as const) {
      const { workbook, projection } = await project(name);
      const sheet = workbook.sheets[0]!;
      const headerPosition = sheet.rows.findIndex((r) => r.cells[0]?.text === "Requirement");
      const tableRows = sheet.rows.slice(headerPosition + 1).map((r) => r.r);
      const projected = projection.sheets[0]!.groups.flatMap((g) => g.rows.map((r) => r.r));
      expect([...projected].sort((a, b) => a - b), name).toEqual(tableRows);
      expect(new Set(projected).size).toBe(projected.length);
    }
  });

  it("puts rows with no recognisable heading under Other instead of discarding them", () => {
    const workbook: AprWorkbook = {
      version: 1,
      sourceFormat: "xlsx",
      warnings: [],
      sheets: [
        {
          name: "S",
          index: 0,
          visibility: "visible",
          rowCount: 4,
          columnCount: 3,
          columnWidths: [null, null, null],
          merges: [],
          rows: [
            { r: 0, cells: [{ c: 0, text: "Requirement" }, { c: 1, text: "Status" }, { c: 2, text: "Grade" }] },
            { r: 1, cells: [{ c: 1, text: "Satisfied" }, { c: 2, text: "A" }] },
            { r: 2, cells: [{ c: 0, text: "A requirement with no category prefix" }, { c: 1, text: "Not Satisfied" }] },
            { r: 3, cells: [{ c: 2, text: "B" }] },
          ],
        },
      ],
    };
    const sheet = projectForSidebar(workbook).sheets[0]!;
    expect(sheet.groups).toEqual([
      {
        key: "b0:other",
        kind: "other",
        label: "Other",
        block: null,
        blockIndex: 0,
        rows: [
          { r: 1, cells: ["", "Satisfied"] },
          { r: 2, cells: ["A requirement with no category prefix", "Not Satisfied"] },
        ],
      },
    ]);
    expect(sheet.warnings).toContain("rows_without_heading");
    expect(JSON.stringify(sheet)).not.toMatch(/"A"|"B"/);
  });

  it("does not mistake a data row that mentions units for a header row", () => {
    const workbook: AprWorkbook = {
      version: 1,
      sourceFormat: "xlsx",
      warnings: [],
      sheets: [
        {
          name: "S",
          index: 0,
          visibility: "visible",
          rowCount: 2,
          columnCount: 3,
          columnWidths: [null, null, null],
          merges: [],
          rows: [
            { r: 0, cells: [{ c: 0, text: "Requirement" }, { c: 1, text: "Status" }, { c: 2, text: "Remaining" }] },
            { r: 1, cells: [{ c: 0, text: "Core: X" }, { c: 1, text: "Not Satisfied" }, { c: 2, text: "Minimum 4 Unit(s)" }] },
          ],
        },
      ],
    };
    const sheet = projectForSidebar(workbook).sheets[0]!;
    expect(sheet.columns.map((c) => c.header)).toEqual(["Requirement", "Status", "Remaining"]);
    expect(sheet.groups[0]!.rows[0]!.cells).toEqual(["Core: X", "Not Satisfied", "Minimum 4 Unit(s)"]);
  });
});

describe("sidebar projection — when Workday's layout is not recognised", () => {
  it("fails visibly and sends no rows, rather than guessing which columns hold grades", async () => {
    const { workbook, projection } = await project("unrecognized-layout");
    const sheet = projection.sheets[0]!;
    expect(sheet.structured).toBe(false);
    expect(sheet.groups).toEqual([]);
    expect(sheet.warnings).toEqual(["header_not_found"]);
    expect(JSON.stringify(projection)).not.toMatch(/A-|B\+|Fall 2025/);
    // Nothing is lost: the full workbook still has every cell.
    expect(JSON.stringify(workbook)).toContain("Calculus");
  });

  it("projects each worksheet independently", async () => {
    const { projection } = await project("two-sheets");
    expect(projection.sheets.map((s) => [s.name, s.structured])).toEqual([
      ["Finance Major", true],
      ["Data Science Minor", true],
      ["Empty", false],
    ]);
  });

  it("counts the rows above the table instead of showing them", async () => {
    const { projection } = await project("finance-major");
    const sheet = projection.sheets[0]!;
    expect(sheet.preambleRowCount).toBe(2);
    expect(sheet.warnings).toContain("preamble_rows_in_full_view_only");
    expect(allCells(sheet).join("|")).not.toContain("synthetic test data");
  });

  it("projectionStats reports counts only", async () => {
    const { projection } = await project("finance-major");
    expect(projectionStats(projection)).toEqual({ sheets: 1, structuredSheets: 1, blocks: 1, groups: 4, rows: 11 });
  });
});

describe("sidebar projection — the layout of a real Workday export", () => {
  // Structure checked against a real "View My Academic Progress" export
  // (never committed); the fixture reproduces it with invented content.
  it("keeps every program block apart, under Workday's own block title", async () => {
    const { projection } = await project("workday-combined");
    const sheet = projection.sheets[0]!;
    expect(sheet.structured).toBe(true);
    const blocks = [...new Map(sheet.groups.map((g) => [g.blockIndex, g.block])).entries()];
    expect(blocks).toEqual([
      [0, "Finance Major Requirements"],
      [1, "Mathematics Major Requirements"],
      [2, "Healthcare Innovation and Design Minor Requirements"],
      [3, "Sample Center Requirements"],
    ]);
  });

  it("does not merge one program's University / Core rows into another's", async () => {
    const { projection } = await project("workday-combined");
    const groups = projection.sheets[0]!.groups;
    const core = groups.filter((g) => g.kind === "core");
    expect(core.map((g) => [g.blockIndex, g.rows[0]!.cells[0]])).toEqual([
      [0, "Core: LSB: CTW 1"],
      [1, "Core: CAS: CTW 1"],
    ]);
    expect(groups.filter((g) => g.kind === "university").map((g) => g.blockIndex)).toEqual([0, 1]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });

  it("files a row written WITHOUT a colon with its own program", async () => {
    const { projection } = await project("workday-combined");
    const groups = projection.sheets[0]!.groups;
    const math = groups.find((g) => g.label === "Mathematics Major")!;
    expect(math.kind).toBe("major");
    expect(math.rows.map((r) => r.cells[0])).toEqual([
      "Mathematics Major GPA",
      "Mathematics Major: MATH 11",
      "Mathematics Major: MATH 13",
      "Mathematics Major: Four Upper Division Math Electives (or CSCI 162)",
    ]);
    const minor = groups.find((g) => g.kind === "minor")!;
    expect(minor.label).toBe("Healthcare Innovation Minor");
    expect(minor.rows[0]!.cells[0]).toBe("Healthcare Innovation Minor GPA");
    expect(groups.some((g) => g.kind === "other")).toBe(false);
  });

  it("reads the two-row header that spans 'Satisfied With'", async () => {
    const { projection } = await project("workday-combined");
    const sheet = projection.sheets[0]!;
    expect(sheet.columns.map((c) => c.header)).toEqual(["Requirement", "Status", "Remaining", "Registrations Used"]);
    expect(sheet.omittedColumns.sort()).toEqual(["Academic Period", "Grade", "Units"]);
  });

  it("keeps the summary lines around each table out of the sidebar — GPA values included", async () => {
    const { workbook, projection } = await project("workday-combined");
    const payload = JSON.stringify(projection);
    for (const text of ["Program of Study GPA", "Requirements Effective", "Last Evaluated", "Requirements Not Assigned", "Unused Registrations", "3.100", "2.800", "01/12/2027"]) {
      expect(payload, text).not.toContain(text);
    }
    for (const period of FIXTURE_PRIVATE_MARKERS.academicPeriods) expect(payload).not.toContain(period);
    const cells = projection.sheets[0]!.groups.flatMap((g) => g.rows.flatMap((r) => r.cells));
    for (const token of ["A-", "B+", "CR", "4.5", "4", "1", "3"]) expect(cells, token).not.toContain(token);
    // …and they are all still in the full workbook.
    const full = JSON.stringify(workbook);
    for (const text of ["Program of Study GPA", "3.100", "Last Evaluated", "Fall 2025 Quarter"]) expect(full).toContain(text);
  });

  it("drops no requirement row", async () => {
    const { workbook, projection } = await project("workday-combined");
    const statuses = new Set(["Satisfied", "Not Satisfied", "In Progress"]);
    const source = workbook.sheets[0]!.rows.filter((r) => statuses.has(r.cells.find((c) => c.c === 1)?.text ?? "")).map((r) => r.r);
    const projected = new Set(projection.sheets[0]!.groups.flatMap((g) => g.rows.map((r) => r.r)));
    expect(source.length).toBe(21);
    for (const r of source) expect(projected.has(r), `source row ${r + 1}`).toBe(true);
  });
});
