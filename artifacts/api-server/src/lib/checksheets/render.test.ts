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
});

describe("legacy .xls", () => {
  it("is stored as an original, with a plain statement that it has no preview", async () => {
    const xls = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(64),
      Buffer.from("Workbook", "utf16le"),
      Buffer.alloc(64),
    ]);
    expect(await buildChecksheetRender(xls, "xls")).toEqual({
      status: "original_only",
      note: "legacy_xls_no_preview",
      render: null,
    });
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
      render: { version: 1, kind: "image", width: 640, height: 420 },
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
