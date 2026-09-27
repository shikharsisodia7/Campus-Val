import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildAprFixture, APR_HEADER } from "../../__fixtures__/apr/build-workbooks";
import { readAprWorkbook, parseMergeRange } from "./workbook-reader";
import { guardXlsxBytes, readZipDirectory } from "./file-guard";
import { cellDisplayText, cleanCellText } from "./cell-text";
import { AprImportError, type AprSheet } from "./workbook-model";

const rowTexts = (sheet: AprSheet) =>
  sheet.rows.map((row) => {
    const out: string[] = Array(sheet.columnCount).fill("");
    for (const cell of row.cells) out[cell.c] = cell.text;
    return out;
  });

async function importError(buf: Buffer): Promise<string> {
  try {
    await readAprWorkbook(buf);
  } catch (err) {
    if (err instanceof AprImportError) return err.code;
    throw err;
  }
  return "no error";
}

describe("readAprWorkbook — the full APR is a faithful copy", () => {
  it("keeps every column, including Academic Period, Units and Grade", async () => {
    const wb = await readAprWorkbook(await buildAprFixture("finance-major"));
    const [sheet] = wb.sheets;
    const rows = rowTexts(sheet!);
    const header = rows.find((r) => r[0] === "Requirement")!;
    expect(header).toEqual(APR_HEADER);

    const flat = rows.flat();
    expect(flat).toContain("Fall 2026 Quarter"); // Academic Period
    expect(flat).toContain("4.5"); // Units
    expect(flat).toContain("B+"); // Grade
    expect(flat).toContain("CR");
  });

  it("preserves source row order and source wording exactly", async () => {
    const wb = await readAprWorkbook(await buildAprFixture("finance-major"));
    const requirementColumn = rowTexts(wb.sheets[0]!)
      .map((r) => r[0])
      .filter(Boolean);
    expect(requirementColumn).toEqual([
      "View My Academic Progress — Finance Major",
      "Santa Clara University — synthetic test data",
      "Requirement",
      "University Requirement: Must have a minimum 2.000 Cumulative GPA",
      "University Requirement: Must complete a minimum 60 Upper Division Units",
      "Core: LSB: CTW 1",
      "Core: LSB: C&I 1",
      "Core: LSB: C&I 2",
      "Core: LSB: 2nd Language (Level 2)",
      "Sample School of Business Core Knowledge: Accounting 11",
      "Finance Major : Major GPA",
      "Finance Major : FNCE 121 & 124",
      "Finance Major : Upper Division Electives",
    ]);
    // Source row indexes are strictly increasing and keep the blank row's gap.
    const indexes = wb.sheets[0]!.rows.map((r) => r.r);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(indexes).not.toContain(2);
  });

  it("keeps basic formatting that shows structure: bold headings, fills, indentation, widths", async () => {
    const wb = await readAprWorkbook(await buildAprFixture("finance-major"));
    const sheet = wb.sheets[0]!;
    const header = sheet.rows.find((r) => r.cells[0]?.text === "Requirement")!;
    expect(header.cells.every((c) => c.bold && c.filled)).toBe(true);
    const registration = sheet.rows.find((r) => r.cells[0]?.c === 3)!;
    expect(registration.cells[0]!.indent).toBe(1);
    expect(sheet.columnWidths[0]).toBe(46);
  });

  it("keeps merged ranges and does not repeat the merged text", async () => {
    const wb = await readAprWorkbook(await buildAprFixture("two-row-header"));
    const sheet = wb.sheets[0]!;
    expect(sheet.merges).toContainEqual({ r: 3, c: 3, rowSpan: 1, colSpan: 4 });
    const top = sheet.rows.find((r) => r.r === 3)!;
    expect(top.cells.filter((c) => c.text === "Satisfied With")).toHaveLength(1);
  });

  it("keeps every worksheet in order, including an empty one", async () => {
    const wb = await readAprWorkbook(await buildAprFixture("two-sheets"));
    expect(wb.sheets.map((s) => s.name)).toEqual(["Finance Major", "Data Science Minor", "Empty"]);
    expect(wb.sheets.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(wb.sheets[2]!.rows).toEqual([]);
    expect(wb.warnings).toContain("empty_sheet");
  });

  it("is deterministic: the same file always produces the same workbook", async () => {
    const buf = await buildAprFixture("computer-science-major");
    expect(await readAprWorkbook(buf)).toEqual(await readAprWorkbook(buf));
  });
});

describe("readAprWorkbook — untrusted content", () => {
  it("keeps markup as inert text and never emits a formula or a link", async () => {
    const wb = await readAprWorkbook(await buildAprFixture("hostile-content"));
    const flat = rowTexts(wb.sheets[0]!).flat();
    // Stored verbatim as text — escaping is the renderer's job, and React does it.
    expect(flat).toContain('Core: <script>alert("x")</script>');
    // A cached formula value is shown; the formula itself never is.
    expect(flat).toContain("2");
    expect(flat.join("|")).not.toMatch(/1\+1|NOW\(\)/);
    // A hyperlink cell contributes its text only.
    expect(flat).toContain("FNCE 124 - Investments");
    expect(JSON.stringify(wb)).not.toMatch(/javascript:/);
    expect(wb.warnings).toContain("formula_without_cached_value");
  });

  it("refuses a legacy .xls / password-protected file by its signature", async () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)]);
    expect(await importError(ole)).toBe("legacy_xls_or_encrypted");
  });

  it("refuses bytes that are not a zip, an empty file, and a truncated workbook", async () => {
    expect(await importError(Buffer.from("%PDF-1.7 not a workbook at all, just text pretending"))).toBe("not_a_workbook");
    expect(await importError(Buffer.alloc(0))).toBe("empty_workbook");
    const good = await buildAprFixture("finance-major");
    expect(await importError(good.subarray(0, Math.floor(good.length / 2)))).toBe("malformed_workbook");
  });

  it("refuses a zip that is not a spreadsheet", async () => {
    // A real zip (an .xlsx) with its workbook part renamed is no longer SpreadsheetML.
    const good = await buildAprFixture("finance-major");
    const renamed = Buffer.from(good);
    let at = renamed.indexOf("xl/workbook.xml");
    while (at >= 0) {
      renamed.write("xl/workbook.xmx", at, "utf8");
      at = renamed.indexOf("xl/workbook.xml", at + 1);
    }
    expect(await importError(renamed)).toBe("not_a_workbook");
  });

  it("refuses a workbook with no content", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Blank");
    expect(await importError(Buffer.from(await wb.xlsx.writeBuffer()))).toBe("empty_workbook");
  });

  it("refuses an archive that declares an enormous inflated size", async () => {
    const good = await buildAprFixture("finance-major");
    const bomb = Buffer.from(good);
    // Rewrite every central-directory entry's uncompressed size to ~4 GB.
    let p = 0;
    while ((p = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), p)) >= 0) {
      bomb.writeUInt32LE(0xfffffff0, p + 24);
      p += 4;
    }
    expect(() => guardXlsxBytes(bomb)).toThrowError(/too_large/);
  });

  it("notes macros but never runs them", async () => {
    const dir = readZipDirectory(await buildAprFixture("finance-major"));
    expect(dir.entryNames).toContain("xl/workbook.xml");
    expect(dir.entryNames.map((n) => n.toLowerCase())).not.toContain("xl/vbaproject.bin");
  });

  it("error objects carry a category only — never file content", async () => {
    const good = await buildAprFixture("finance-major");
    try {
      await readAprWorkbook(good.subarray(0, 900));
      throw new Error("expected a failure");
    } catch (err) {
      expect(err).toBeInstanceOf(AprImportError);
      expect((err as Error).message).toMatch(/^[a-z_]+$/);
    }
  });
});

describe("cell text", () => {
  it("renders numbers, percentages, dates, booleans and blanks as Excel displays them", () => {
    expect(cellDisplayText({ value: 4 }).text).toBe("4");
    expect(cellDisplayText({ value: 4.5 }).text).toBe("4.5");
    expect(cellDisplayText({ value: 3, numFmt: "0.000" }).text).toBe("3.000");
    expect(cellDisplayText({ value: 0.875, numFmt: "0%" }).text).toBe("88%");
    expect(cellDisplayText({ value: 0.875, numFmt: "0.0%" }).text).toBe("87.5%");
    expect(cellDisplayText({ value: 12345.5, numFmt: "#,##0.00" }).text).toBe("12,345.50");
    expect(cellDisplayText({ value: new Date(Date.UTC(2026, 8, 26)) }).text).toBe("09/26/2026");
    expect(cellDisplayText({ value: 46291, numFmt: "mm/dd/yyyy" }).text).toBe("09/26/2026");
    expect(cellDisplayText({ value: true }).text).toBe("TRUE");
    expect(cellDisplayText({ value: null }).text).toBe("");
    expect(cellDisplayText({ value: "  A-  " }).text).toBe("  A-  ");
  });

  it("uses a formula's cached value and never its source", () => {
    expect(cellDisplayText({ value: { formula: "SUM(A1:A3)", result: 12 } }).text).toBe("12");
    expect(cellDisplayText({ value: { formula: "A1" } })).toEqual({ text: "", formulaWithoutValue: true });
    expect(cellDisplayText({ value: { formula: "1/0", result: { error: "#DIV/0!" } } }).text).toBe("#DIV/0!");
  });

  it("strips control characters and caps length", () => {
    expect(cleanCellText("a\u0000b\u0007c\r\nd", 100)).toEqual({ text: "abc\nd", truncated: false });
    expect(cleanCellText("x".repeat(20), 5)).toEqual({ text: "xxxxx", truncated: true });
  });
});

describe("parseMergeRange", () => {
  it("reads A1-style ranges", () => {
    expect(parseMergeRange("D4:G4")).toEqual({ r: 3, c: 3, rowSpan: 1, colSpan: 4 });
    expect(parseMergeRange("A1:A3")).toEqual({ r: 0, c: 0, rowSpan: 3, colSpan: 1 });
    expect(parseMergeRange("nonsense")).toBeNull();
  });
});
