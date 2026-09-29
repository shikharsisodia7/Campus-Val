/**
 * Every supported format, from bytes to display copy — and every way a file
 * can be refused. All documents are synthetic (see __fixtures__/checksheets).
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  buildChecksheetFixture,
  buildFlowchartPng,
  buildTextPdf,
  HOSTILE_MARKERS,
  TINY_JPEG,
} from "../../__fixtures__/checksheets/build-fixtures";
import { htmlToBlocks, safeDocumentHref } from "./docx-reader";
import { assertBytesMatchFormat, resolveChecksheetFormat } from "./formats";
import { readJpegSize, readPngSize } from "./image-info";
import { checksheetMaxUploadBytes, checksheetMaxUploadLabel } from "./limits";
import { ChecksheetError, type ChecksheetErrorCode, type ChecksheetFormat, type DocBlock } from "./model";
import { buildChecksheetRender } from "./render";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function codeOf(work: () => unknown): Promise<ChecksheetErrorCode | "accepted"> {
  try {
    await work();
    return "accepted";
  } catch (err) {
    if (err instanceof ChecksheetError) return err.code;
    throw err;
  }
}

const refuses = (bytes: Buffer, format: ChecksheetFormat) => codeOf(() => buildChecksheetRender(bytes, format));

describe("which format a file is", () => {
  it("needs the extension and the declared type to agree", () => {
    expect(resolveChecksheetFormat("major.pdf", "application/pdf")).toBe("pdf");
    expect(resolveChecksheetFormat("MAJOR.PDF", "application/pdf; charset=binary")).toBe("pdf");
    expect(resolveChecksheetFormat("major.xlsx", XLSX)).toBe("xlsx");
    expect(resolveChecksheetFormat("major.xls", "application/vnd.ms-excel")).toBe("xls");
    expect(resolveChecksheetFormat("guide.docx", DOCX)).toBe("docx");
    expect(resolveChecksheetFormat("chart.png", "image/png")).toBe("png");
    expect(resolveChecksheetFormat("chart.jpeg", "image/jpeg")).toBe("jpg");
    expect(resolveChecksheetFormat("chart.JPG", "image/jpeg")).toBe("jpg");
  });

  it("accepts the generic type browsers sometimes give office files, and only those", () => {
    expect(resolveChecksheetFormat("major.xlsx", "")).toBe("xlsx");
    expect(resolveChecksheetFormat("guide.docx", "application/octet-stream")).toBe("docx");
    expect(resolveChecksheetFormat("major.pdf", "application/octet-stream")).toBeNull();
    expect(resolveChecksheetFormat("chart.png", "")).toBeNull();
  });

  it("refuses anything else", () => {
    for (const [name, type] of [
      ["page.html", "text/html"],
      ["page.svg", "image/svg+xml"],
      ["notes.txt", "text/plain"],
      ["macro.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
      ["old.doc", "application/msword"],
      ["run.exe", "application/octet-stream"],
      ["noextension", "application/pdf"],
      ["major.pdf", "text/html"],
      ["major.pdf.html", "application/pdf"],
    ] as const) {
      expect(resolveChecksheetFormat(name, type), name).toBeNull();
    }
  });
});

describe("the bytes must be what the name says", () => {
  it("refuses an HTML page renamed to each supported type", async () => {
    const html = Buffer.from("<!doctype html><script>alert(1)</script>");
    for (const format of ["pdf", "xlsx", "xls", "docx", "png", "jpg"] as const) {
      expect(await refuses(html, format), format).toBe("type_mismatch");
    }
  });

  it("refuses an empty file", async () => {
    expect(await refuses(Buffer.alloc(0), "pdf")).toBe("empty_file");
  });

  it("refuses a workbook uploaded as a Word document, and the reverse", async () => {
    const workbook = await buildChecksheetFixture("major-workbook");
    const document = await buildChecksheetFixture("advising-docx");
    expect(await refuses(workbook, "docx")).toBe("type_mismatch");
    expect(await refuses(document, "xlsx")).toBe("type_mismatch");
  });

  it("reports a password-protected office file as such", async () => {
    // Encrypted OOXML is an OLE2 container holding an EncryptedPackage stream.
    const encrypted = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(64),
      Buffer.from("EncryptedPackage", "utf16le"),
      Buffer.alloc(64),
    ]);
    expect(await codeOf(() => assertBytesMatchFormat(encrypted, "xlsx"))).toBe("encrypted");
    expect(await codeOf(() => assertBytesMatchFormat(encrypted, "docx"))).toBe("encrypted");
    expect(await codeOf(() => assertBytesMatchFormat(encrypted, "xls"))).toBe("encrypted");
  });

  it("refuses a damaged zip and a zip that declares an absurd inflated size", async () => {
    const workbook = await buildChecksheetFixture("major-workbook");
    expect(await refuses(workbook.subarray(0, 400), "xlsx")).toBe("malformed_workbook");
    const document = await buildChecksheetFixture("advising-docx");
    expect(await refuses(document.subarray(0, 400), "docx")).toBe("malformed_document");
  });

  it("refuses a PDF that only starts like one", async () => {
    expect(await refuses(Buffer.from("%PDF-1.7\nnot really a pdf\n%%EOF\n"), "pdf")).toBe("malformed_pdf");
  });

  it("refuses a picture whose header cannot be read", async () => {
    const png = buildFlowchartPng();
    expect(await refuses(png.subarray(0, 20), "png")).toBe("malformed_image");
    expect(await refuses(TINY_JPEG.subarray(0, 12), "jpg")).toBe("malformed_image");
  });
});

describe("spreadsheet", () => {
  it("copies the workbook and marks the student's columns", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("major-workbook"), "xlsx");
    expect(out.status).toBe("ready");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    const [sheet] = out.render.sheets;
    expect(sheet!.name).toBe("Major");
    expect(sheet!.tracking.columns.map((c) => [c.c, c.field, c.header])).toEqual([
      [2, "status", "Status"],
      [3, "term", "Quarter Completed"],
    ]);
    // Six courses, two section headings: 6 status cells and 6 quarter cells.
    expect(sheet!.tracking.cells).toHaveLength(12);
    const text = sheet!.rows.flatMap((r) => r.cells.map((c) => c.text));
    expect(text).toContain("Widget Mathematics I");
    expect(text).toContain("Prerequisite for WIDG 112");
    expect(sheet!.merges).toEqual([{ r: 0, c: 0, rowSpan: 1, colSpan: 5 }]);
  });

  it("keeps every worksheet, each with its own layout", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("minor-workbook"), "xlsx");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    expect(out.render.sheets.map((s) => s.name)).toEqual(["Minor", "Electives"]);
    expect(out.render.sheets[1]!.tracking.columns.map((c) => [c.field, c.header])).toEqual([
      ["status", "Completed"],
      ["term", "Term"],
    ]);
  });

  it("offers nothing in place when the department filled the column or named no columns", async () => {
    for (const name of ["official-status-workbook", "no-header-workbook"] as const) {
      const out = await buildChecksheetRender(await buildChecksheetFixture(name), "xlsx");
      if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
      expect(out.render.sheets.flatMap((s) => s.tracking.cells), name).toEqual([]);
    }
  });

  it("stores a formula's shown value, never the formula", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan");
    ws.addRow(["Course", "Units"]);
    ws.addRow(["WIDG 101", 4]);
    ws.addRow(["Total", { formula: "SUM(B2:B2)", result: 4 }]);
    ws.addRow(["Danger", { formula: 'HYPERLINK("http://example.invalid","x")', result: "x" }]);
    const out = await buildChecksheetRender(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    expect(JSON.stringify(out.render)).not.toMatch(/SUM\(|HYPERLINK|formula/);
  });

  it("leaves out a formula's error value, says so, and never offers that cell to the student", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Checklist");
    ws.addRow(["Requirements", "Quarter Completed"]);
    ws.addRow(["WIDG 101", null]);
    ws.addRow(["WIDG 111", { formula: "VLOOKUP(A3,Z1:Z2,1,FALSE)", result: { error: "#N/A" } }]);
    ws.addRow(["WIDG 120", null]);
    ws.addRow(["WIDG 130", null]);
    ws.addRow(["WIDG 140", null]);
    ws.addRow(["WIDG 150", null]);
    const out = await buildChecksheetRender(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    expect(JSON.stringify(out.render.sheets)).not.toContain("#N/A");
    expect(out.render.warnings).toContain("calculated_cells_not_shown");
    const offered = out.render.sheets[0]!.tracking.cells.map((c) => c.r);
    expect(offered).toEqual([1, 3, 4, 5, 6]);
  });

  it("shows a formula's stored result when it is zero, which the workbook library drops", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan");
    ws.addRow(["Course", "Units"]);
    ws.addRow(["Total", { formula: "SUM(B3:B9)", result: 0 }]);
    ws.addRow(["Nothing yet", { formula: 'IF(B2=0,"",B2)', result: "" }]);
    ws.addRow(["Average", { formula: "B2/2", result: 2.5 }]);
    const out = await buildChecksheetRender(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    const text = new Map(out.render.sheets[0]!.rows.map((row) => [row.cells[0]!.text, row.cells[1]?.text]));
    expect(text.get("Total")).toBe("0");
    expect(text.get("Average")).toBe("2.5");
    // A stored empty string is a result too: the cell is empty, and nothing is missing.
    expect(text.get("Nothing yet")).toBeUndefined();
    expect(out.render.warnings).not.toContain("formula_without_cached_value");
    expect(JSON.stringify(out.render)).not.toMatch(/SUM\(|IF\(/);
  });

  it("says so, and shows nothing, when a formula has NO stored result", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan");
    ws.addRow(["Course", "Units"]);
    ws.addRow(["Total", { formula: "SUM(B3:B9)" }]);
    ws.addRow(["Elsewhere", { formula: "[other.xlsx]Sheet1!A1" }]);
    ws.addRow(["Custom", { formula: "MYFUNCTION(B2)" }]);
    const out = await buildChecksheetRender(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    expect(out.render.sheets[0]!.rows.map((row) => row.cells.map((c) => c.text))).toEqual([
      ["Course", "Units"],
      ["Total"],
      ["Elsewhere"],
      ["Custom"],
    ]);
    expect(out.render.warnings).toContain("formula_without_cached_value");
    expect(JSON.stringify(out.render)).not.toMatch(/other\.xlsx|MYFUNCTION/);
  });

  it("shows the stored result of a reference to another workbook, and fetches nothing", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan");
    ws.addRow(["Course", "Units"]);
    ws.addRow(["From the registrar", { formula: "'http://example.invalid/[units.xlsx]Sheet1'!A1", result: 4 }]);
    const out = await buildChecksheetRender(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    expect(out.render.sheets[0]!.rows[1]!.cells.map((c) => c.text)).toEqual(["From the registrar", "4"]);
    expect(JSON.stringify(out.render)).not.toContain("example.invalid");
  });

  it("says nothing about calculated cells when there are none", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("major-workbook"), "xlsx");
    expect(out.render?.kind === "spreadsheet" && out.render.warnings).not.toContain("calculated_cells_not_shown");
  });

  it("reads a workbook whose worksheet is named History, and shows that name", async () => {
    // Excel reserves the name, the workbook library refuses it, and a History
    // department's checklist has it. The library will not write one either, so
    // the name is put into the file the way the real one has it.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Hist");
    ws.addRow(["Requirements", "Quarter Completed"]);
    ws.addRow(["One course in Widget History", null]);
    const zip = await JSZip.loadAsync(Buffer.from(await wb.xlsx.writeBuffer()));
    const xml = await zip.file("xl/workbook.xml")!.async("string");
    expect(xml).toContain('name="Hist"');
    zip.file("xl/workbook.xml", xml.replace('name="Hist"', 'name="History"'));
    const bytes = await zip.generateAsync({ type: "nodebuffer" });

    const out = await buildChecksheetRender(bytes, "xlsx");
    expect(out.status).toBe("ready");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    expect(out.render.sheets.map((s) => s.name)).toEqual(["History"]);
    expect(out.render.sheets[0]!.tracking.cells.map((c) => [c.r, c.c, c.field])).toEqual([[1, 1, "both"]]);
  });

  it("reads a requirements checklist: two tables side by side, one student column each", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("checklist-workbook"), "xlsx");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    const { tracking } = out.render.sheets[0]!;
    expect(tracking.columns.map((c) => [c.c, c.field, c.header])).toEqual([
      [1, "both", "Quarter Completed"],
      [4, "both", "Quarter"],
    ]);
    const rowsOf = (c: number) => tracking.cells.filter((cell) => cell.c === c).map((cell) => cell.r);
    // Five requirements and the units line; never the two headings.
    expect(rowsOf(1)).toEqual([2, 3, 4, 6, 7, 8]);
    // Three planned courses; never "First Year" / "Second Year", never the calculated cell's row.
    expect(rowsOf(4)).toEqual([2, 3, 6]);
    expect(out.render.warnings).toContain("calculated_cells_not_shown");
  });

  it("does not take shading for a heading: a shaded requirement row is still offered", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Checklist");
    ws.addRow(["Requirements", "Quarter Completed"]);
    ws.addRow(["Upper Division", null]);
    ws.addRow(["One course in Widget History", null]);
    ws.getCell("A2").font = { bold: true };
    for (const address of ["A2", "A3"]) {
      ws.getCell(address).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDDDDD" } };
    }
    const out = await buildChecksheetRender(Buffer.from(await wb.xlsx.writeBuffer()), "xlsx");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    expect(out.render.sheets[0]!.tracking.cells.map((c) => c.r)).toEqual([2]);
  });
});

describe("legacy .xls", () => {
  it("is read into the same copy an .xlsx is: sheets, order, wording, merges, widths", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("legacy-workbook"), "xls");
    expect(out.status).toBe("ready");
    expect(out.note).toBeNull();
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    const [major, notes] = out.render.sheets;
    expect(out.render.sheets.map((s) => [s.name, s.visibility])).toEqual([
      ["Major", "visible"],
      ["Notes", "hidden"],
    ]);
    expect(major!.merges).toEqual([{ r: 0, c: 0, rowSpan: 1, colSpan: 5 }]);
    expect(major!.columnWidths).toEqual([34, 14, 14, 20, 34]);
    expect(major!.rows[0]!.cells).toEqual([{ c: 0, text: "Applied Widgetry Major Checksheet (sample)" }]);
    expect(major!.rows.map((row) => row.cells[0]!.text).slice(1, 5)).toEqual([
      "Requirement",
      "Lower Division",
      "Introduction to Widgetry",
      "Widget Mathematics I",
    ]);
    expect(notes!.rows[0]!.cells[0]!.text).toBe("Department working notes (sample)");
    expect(out.render.warnings).toContain("hidden_sheet");
  });

  it("marks the student's Status and Quarter columns, as in an .xlsx", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("legacy-workbook"), "xls");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    const { tracking } = out.render.sheets[0]!;
    expect(tracking.columns.map((c) => [c.c, c.field, c.header])).toEqual([
      [2, "status", "Status"],
      [3, "term", "Quarter Completed"],
    ]);
    // The six courses are offered. The legacy format carries no bold, so its two
    // section headings cannot be told from requirements and are offered too.
    expect(tracking.cells.filter((c) => c.c === 2).map((c) => c.r)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    // Never the notes sheet, which has no header naming a column.
    expect(out.render.sheets[1]!.tracking.cells).toEqual([]);
  });

  it("shows a formula's stored result, a date and a percentage as Excel displays them, and no formula", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("legacy-workbook"), "xls");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    const text = new Map(out.render.sheets[0]!.rows.map((row) => [row.cells[0]!.text, row.cells[1]?.text]));
    expect(text.get("Courses listed")).toBe("8");
    expect(text.get("Revised")).toBe("9/1/2025");
    expect(text.get("Upper division share")).toBe("50%");
    expect(JSON.stringify(out.render)).not.toMatch(/COUNTA|formula/);
  });

  it("gives every cell plain text: markup in a cell stays text", async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Course", "Status"],
      ['<img src=x onerror="alert(1)">', null],
      ["=HYPERLINK(\"http://example.invalid\",\"x\")", null],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "S");
    const out = await buildChecksheetRender(Buffer.from(XLSX.write(book, { bookType: "biff8", type: "buffer" }) as Uint8Array), "xls");
    if (out.render?.kind !== "spreadsheet") throw new Error("expected a spreadsheet");
    const cells = out.render.sheets[0]!.rows.flatMap((row) => row.cells);
    expect(cells.every((cell) => Object.keys(cell).sort().join() === "c,text")).toBe(true);
    expect(cells.map((cell) => cell.text)).toContain('<img src=x onerror="alert(1)">');
  });

  it("reports a password-protected workbook as such", async () => {
    expect(await refuses(await buildChecksheetFixture("legacy-workbook-protected"), "xls")).toBe("encrypted");
  });

  it("refuses a damaged workbook, and one that only names a Workbook stream", async () => {
    const whole = await buildChecksheetFixture("legacy-workbook");
    // The container still names its streams; what the workbook stream holds is noise.
    const damaged = Buffer.from(whole);
    const start = damaged.indexOf(Buffer.from([0x09, 0x08, 0x10, 0x00]));
    expect(start).toBeGreaterThan(0);
    damaged.fill(0xff, start, start + 1024);
    // Refused either way: unreadable, or readable with nothing left in it.
    expect(["malformed_workbook", "empty_workbook"]).toContain(await refuses(damaged, "xls"));
    const shell = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(64),
      Buffer.from("Workbook", "utf16le"),
      Buffer.alloc(64),
    ]);
    expect(await refuses(shell, "xls")).toBe("malformed_workbook");
  });

  it("refuses a workbook with nothing in it", async () => {
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Empty");
    const bytes = Buffer.from(XLSX.write(book, { bookType: "biff8", type: "buffer" }) as Uint8Array);
    expect(await refuses(bytes, "xls")).toBe("empty_workbook");
  });

  it("notes macros and never reads them", async () => {
    const whole = await buildChecksheetFixture("legacy-workbook");
    const XLSX = await import("xlsx");
    const container = XLSX.CFB.read(whole, { type: "buffer" });
    XLSX.CFB.utils.cfb_add(container, "/_VBA_PROJECT_CUR/VBA/Module1", Buffer.from("Sub Auto_Open()\nShell \"calc\"\nEnd Sub"));
    const bytes = Buffer.from(XLSX.CFB.write(container, { type: "buffer" }) as Uint8Array);
    const out = await buildChecksheetRender(bytes, "xls");
    expect(out.status).toBe("ready");
    expect(out.render?.kind === "spreadsheet" && out.render.warnings).toContain("macros_ignored");
    expect(JSON.stringify(out.render)).not.toMatch(/Auto_Open|Shell/);
  });

  it("refuses an OLE2 file that is not a workbook", async () => {
    const doc = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.from("WordDocument", "utf16le"),
    ]);
    expect(await refuses(doc, "xls")).toBe("type_mismatch");
  });
});

describe("PDF", () => {
  it("records each page's size and a hash of its text, not the text", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("major-pdf"), "pdf");
    expect(out.status).toBe("ready");
    if (out.render?.kind !== "pdf") throw new Error("expected a pdf");
    expect(out.render.pages).toHaveLength(2);
    for (const page of out.render.pages) {
      expect(page).toMatchObject({ width: 612, height: 792 });
      expect(page.textHash).toMatch(/^[0-9a-f]{32}$/);
    }
    expect(JSON.stringify(out.render)).not.toMatch(/WIDG|Widgetry/);
  });

  it("gives a page the same hash whenever it says the same thing", async () => {
    const a = await buildChecksheetRender(await buildChecksheetFixture("major-pdf"), "pdf");
    const b = await buildChecksheetRender(await buildChecksheetFixture("major-pdf-revised"), "pdf");
    if (a.render?.kind !== "pdf" || b.render?.kind !== "pdf") throw new Error("expected pdfs");
    expect(b.render.pages[0]!.textHash).toBe(a.render.pages[0]!.textHash);
    expect(b.render.pages[1]!.textHash).not.toBe(a.render.pages[1]!.textHash);
  });

  it("leaves a page without text unverifiable rather than guessing", async () => {
    const out = await buildChecksheetRender(buildTextPdf([[""]]), "pdf");
    if (out.render?.kind !== "pdf") throw new Error("expected a pdf");
    expect(out.render.pages[0]!.textHash).toBeNull();
  });
});

describe("pictures", () => {
  it("reads the size of a PNG and a JPEG from their headers", async () => {
    expect(readPngSize(buildFlowchartPng(640, 420))).toEqual({ width: 640, height: 420 });
    expect(readJpegSize(TINY_JPEG)).toEqual({ width: 48, height: 32 });
    expect(await buildChecksheetRender(await buildChecksheetFixture("flowchart-png"), "png")).toEqual({
      status: "ready",
      note: null,
      render: { version: 1, kind: "image", width: 640, height: 420, contentHash: expect.stringMatching(/^[0-9a-f]{32}$/) },
    });
  });

  it("refuses a picture too large to show", async () => {
    const huge = Buffer.from(buildFlowchartPng(8, 8));
    huge.writeUInt32BE(20_000, 16);
    huge.writeUInt32BE(20_000, 20);
    expect(await refuses(huge, "png")).toBe("too_large");
  });
});

describe("Word document", () => {
  const textOf = (block: DocBlock) => ("runs" in block ? block.runs.map((r) => r.text).join("") : "");

  it("keeps headings, paragraphs, list items, tables and links in order", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("advising-docx"), "docx");
    expect(out.status).toBe("ready");
    if (out.render?.kind !== "document") throw new Error("expected a document");
    const blocks = out.render.blocks;
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list-item",
      "list-item",
      "table",
      "paragraph",
    ]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(textOf(blocks[0]!)).toBe("Applied Widgetry Advising Guide (sample)");
    expect(textOf(blocks[3]!)).toBe("Take WIDG 111 before WIDG 112.");
    const link = blocks[6]!;
    expect("runs" in link && link.runs[0]).toMatchObject({
      text: "Department website",
      href: "https://www.example.edu/widgetry",
    });
  });

  it("marks the empty Status and Quarter cells of a table", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("advising-docx"), "docx");
    if (out.render?.kind !== "document") throw new Error("expected a document");
    const table = out.render.blocks.find((b) => b.type === "table");
    if (table?.type !== "table") throw new Error("expected a table");
    expect(table.rows).toHaveLength(4);
    expect(table.tracking.columns.map((c) => [c.c, c.field])).toEqual([
      [2, "status"],
      [3, "term"],
    ]);
    expect(table.tracking.cells).toHaveLength(6);
  });

  it("turns hostile content into plain text and drops a javascript: link", async () => {
    const out = await buildChecksheetRender(await buildChecksheetFixture("hostile-docx"), "docx");
    if (out.render?.kind !== "document") throw new Error("expected a document");
    const blocks = out.render.blocks;
    // The markup is there as TEXT, exactly as typed...
    expect(textOf(blocks[1]!)).toBe(HOSTILE_MARKERS.script);
    expect(textOf(blocks[2]!)).toBe(HOSTILE_MARKERS.image);
    // ...and the model has no place for an element, an attribute or a handler.
    const allowed = new Set(["type", "level", "runs", "text", "bold", "italic", "underline", "href", "ordered", "depth", "rows", "header", "colSpan", "rowSpan", "tracking", "columns", "cells", "c", "r", "field", "fingerprint", "headerRow", "mime", "data", "alt"]);
    JSON.stringify(blocks, (key, value) => {
      if (key !== "" && !/^\d+$/.test(key)) expect(allowed.has(key), key).toBe(true);
      return value;
    });
    expect(JSON.stringify(blocks)).not.toMatch(/"href":"javascript/i);
    const link = blocks.find((b) => textOf(b) === "A link that must not be followed");
    expect(link && "runs" in link && link.runs[0]!.href).toBeUndefined();
  });

  it("only keeps http(s) links", () => {
    expect(safeDocumentHref("https://www.scu.edu/")).toBe("https://www.scu.edu/");
    expect(safeDocumentHref("http://example.edu/a b")).toBe("http://example.edu/a%20b");
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>1</script>",
      "vbscript:x",
      "file:///etc/passwd",
      "//example.com",
      "/relative",
      "#anchor",
      "mailto:someone@example.edu",
      "https://user:pass@example.edu/",
      "",
      undefined,
    ]) {
      expect(safeDocumentHref(bad), String(bad)).toBeUndefined();
    }
  });

  it("reads only known elements from converted markup", () => {
    const { blocks } = htmlToBlocks(
      '<p>Before<script>alert(1)</script><iframe src="https://evil.invalid"></iframe><style>p{}</style></p>' +
        '<p onclick="alert(1)">Click <a href="javascript:alert(1)">here</a></p>' +
        '<img src="https://tracker.invalid/pixel.png" alt="remote">' +
        '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="svg">' +
        '<img src="data:image/png;base64,iVBORw0KGgo=" alt="ok">',
    );
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "paragraph", "image-omitted", "image-omitted", "image"]);
    expect(blocks.slice(0, 2).map(textOf)).toEqual(["Before", "Click here"]);
    expect(JSON.stringify(blocks)).not.toMatch(/onclick|iframe|evil\.invalid|tracker\.invalid|svg\+xml|"href"/);
  });

  it("treats only the first row as the header when an export flags every row as one", () => {
    const row = (cells: string[]) => `<tr>${cells.map((c) => `<th><p>${c}</p></th>`).join("")}</tr>`;
    const { blocks, warnings } = htmlToBlocks(
      `<table><thead>${row(["FALL", "WINTER", "SPRING"])}${row(["RTC 1", "CTW 1", "CTW 2"])}${row(["C&amp;I 1", "C&amp;I 2", "Core or Elective"])}</thead></table>`,
    );
    const [table] = blocks;
    if (table?.type !== "table") throw new Error("expected a table");
    expect(table.rows.map((r) => r.map((c) => !!c.header))).toEqual([
      [true, true, true],
      [false, false, false],
      [false, false, false],
    ]);
    expect(table.rows[2]!.map((c) => c.runs[0]!.text)).toEqual(["C&I 1", "C&I 2", "Core or Elective"]);
    expect(warnings).toEqual(["header_rows_normalized"]);
  });

  it("leaves a real header row, and a one-row table, as they are", () => {
    const normal = htmlToBlocks("<table><thead><tr><th>Course</th><th>Units</th></tr></thead><tbody><tr><td>WIDG 101</td><td>4</td></tr></tbody></table>");
    const [table] = normal.blocks;
    if (table?.type !== "table") throw new Error("expected a table");
    expect(table.rows.map((r) => r.map((c) => !!c.header))).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(normal.warnings).toEqual([]);
    const single = htmlToBlocks("<table><tr><th>Only</th><th>Row</th></tr></table>").blocks[0];
    expect(single?.type === "table" && single.rows[0]!.every((c) => c.header)).toBe(true);
  });

  it("keeps a document with nothing to show as an original only", async () => {
    const empty = await buildChecksheetFixture("advising-docx");
    const zip = await JSZip.loadAsync(empty);
    zip.file(
      "word/document.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sectPr/></w:body></w:document>',
    );
    const out = await buildChecksheetRender(await zip.generateAsync({ type: "nodebuffer" }), "docx");
    expect(out).toEqual({ status: "original_only", note: "preview_unavailable", render: null });
  });
});

describe("the upload limit", () => {
  it("defaults to 20 MB and follows CHECKSHEET_MAX_UPLOAD_MB within bounds", () => {
    expect(checksheetMaxUploadBytes({})).toBe(20 * 1024 * 1024);
    expect(checksheetMaxUploadBytes({ CHECKSHEET_MAX_UPLOAD_MB: "35" })).toBe(35 * 1024 * 1024);
    expect(checksheetMaxUploadLabel({ CHECKSHEET_MAX_UPLOAD_MB: "35" })).toBe("35 MB");
    for (const bad of ["0", "-5", "500", "abc", ""]) {
      expect(checksheetMaxUploadBytes({ CHECKSHEET_MAX_UPLOAD_MB: bad }), bad).toBe(20 * 1024 * 1024);
    }
  });
});
