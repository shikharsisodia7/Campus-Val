/**
 * Anchors: an entry may only sit where the document offers a place, and after
 * a replacement it stays only where that place provably means the same thing.
 */
import { describe, it, expect } from "vitest";
import { describeAnchor, reconcileAnchor, resolveAnchor } from "./anchors";
import { cleanLine, cleanNote, cleanSourceUrl, titleFromFileName } from "./metadata";
import type { ChecksheetRender, DocumentRender, ImageRender, PdfRender, SpreadsheetRender } from "./model";

const sheet = (rowText: string, fingerprint: string): SpreadsheetRender => ({
  version: 1,
  kind: "spreadsheet",
  warnings: [],
  sheets: [
    {
      name: "Major",
      index: 0,
      visibility: "visible",
      rowCount: 3,
      columnCount: 4,
      columnWidths: [null, null, null, null],
      merges: [],
      rows: [
        { r: 0, cells: [{ c: 0, text: "Requirement" }, { c: 1, text: "Course" }, { c: 2, text: "Status" }, { c: 3, text: "Quarter" }] },
        { r: 1, cells: [{ c: 0, text: rowText }, { c: 1, text: "WIDG 101" }] },
      ],
      tracking: {
        columns: [
          { c: 2, field: "status", header: "Status", headerRow: 0 },
          { c: 3, field: "term", header: "Quarter", headerRow: 0 },
        ],
        cells: [
          { r: 1, c: 2, field: "status", fingerprint },
          { r: 1, c: 3, field: "term", fingerprint: `${fingerprint}-term` },
        ],
      },
    },
  ],
});

const pdf = (hashes: (string | null)[], size = { width: 612, height: 792 }): PdfRender => ({
  version: 1,
  kind: "pdf",
  pages: hashes.map((textHash) => ({ ...size, textHash })),
});

const image: ImageRender = { version: 1, kind: "image", width: 640, height: 420 };

const document: DocumentRender = {
  version: 1,
  kind: "document",
  warnings: [],
  blocks: [
    { type: "paragraph", runs: [{ text: "Guide" }] },
    {
      type: "table",
      rows: [
        [{ runs: [{ text: "Course" }] }, { runs: [{ text: "Status" }] }],
        [{ runs: [{ text: "WIDG 101 Introduction" }] }, { runs: [] }],
      ],
      tracking: {
        columns: [{ c: 1, field: "status", header: "Status", headerRow: 0 }],
        cells: [{ r: 1, c: 1, field: "status", fingerprint: "doc-print" }],
      },
    },
  ],
};

describe("resolveAnchor", () => {
  it("accepts a worksheet cell the document offers, and says which value it holds", () => {
    expect(resolveAnchor(sheet("Intro", "aaa"), "sheet_cell", { sheet: 0, row: 1, col: 2 })).toEqual({
      type: "sheet_cell",
      anchor: { sheet: 0, row: 1, col: 2 },
      key: "sheet:0:1:2",
      fingerprint: "aaa",
      field: "status",
    });
    expect(resolveAnchor(sheet("Intro", "aaa"), "sheet_cell", { sheet: 0, row: 1, col: 3 })?.field).toBe("term");
  });

  it("refuses any cell the document does not offer", () => {
    const render = sheet("Intro", "aaa");
    for (const anchor of [
      { sheet: 0, row: 1, col: 0 }, // the requirement text itself
      { sheet: 0, row: 1, col: 1 }, // the course column
      { sheet: 0, row: 0, col: 2 }, // the header row
      { sheet: 0, row: 9, col: 2 },
      { sheet: 5, row: 1, col: 2 },
      { sheet: -1, row: 1, col: 2 },
      { sheet: 0, row: 1.5, col: 2 },
      { sheet: "0", row: 1, col: 2 },
      {},
      null,
    ]) {
      expect(resolveAnchor(render, "sheet_cell", anchor), JSON.stringify(anchor)).toBeNull();
    }
  });

  it("refuses an anchor type that does not belong to the document's format", () => {
    expect(resolveAnchor(sheet("Intro", "aaa"), "point", { page: 0, x: 0.5, y: 0.5 })).toBeNull();
    expect(resolveAnchor(pdf(["h"]), "sheet_cell", { sheet: 0, row: 1, col: 2 })).toBeNull();
    expect(resolveAnchor(image, "doc_cell", { block: 1, row: 1, col: 1 })).toBeNull();
    expect(resolveAnchor(pdf(["h"]), "nonsense", {})).toBeNull();
    expect(resolveAnchor(null, "point", { page: 0, x: 0.5, y: 0.5 })).toBeNull();
  });

  it("accepts a Word table cell the document offers", () => {
    expect(resolveAnchor(document, "doc_cell", { block: 1, row: 1, col: 1 })).toMatchObject({
      key: "block:1:1:1",
      field: "status",
      fingerprint: "doc-print",
    });
    expect(resolveAnchor(document, "doc_cell", { block: 0, row: 0, col: 0 })).toBeNull();
    expect(resolveAnchor(document, "doc_cell", { block: 1, row: 1, col: 0 })).toBeNull();
  });

  it("places a point by fractions of the page, inside the page, on a page that exists", () => {
    expect(resolveAnchor(pdf(["h1", "h2"]), "point", { page: 1, x: 0.123456789, y: 1 })).toEqual({
      type: "point",
      anchor: { page: 1, x: 0.1235, y: 1 },
      key: null,
      fingerprint: "612x792:h2",
      field: null,
    });
    for (const anchor of [
      { page: 2, x: 0.5, y: 0.5 },
      { page: 0, x: -0.01, y: 0.5 },
      { page: 0, x: 0.5, y: 1.01 },
      { page: 0, x: Number.NaN, y: 0.5 },
      { page: 0, x: "0.5", y: 0.5 },
      { page: 0, x: 0.5 },
    ]) {
      expect(resolveAnchor(pdf(["h1", "h2"]), "point", anchor), JSON.stringify(anchor)).toBeNull();
    }
    expect(resolveAnchor(image, "point", { page: 0, x: 0, y: 0 })?.fingerprint).toBeNull();
    expect(resolveAnchor(image, "point", { page: 1, x: 0, y: 0 })).toBeNull();
  });

  it("lets a list entry exist on any document, previewed or not", () => {
    const manual = { type: "manual", anchor: {}, key: null, fingerprint: null, field: null };
    expect(resolveAnchor(null, "manual", { sheet: 0 })).toEqual(manual);
    expect(resolveAnchor(pdf(["h"]), "manual", undefined)).toEqual(manual);
  });
});

describe("a filled cell the student chose to track", () => {
  it("accepts a worksheet cell that says something, and lets it hold status and quarter", () => {
    const resolved = resolveAnchor(sheet("Introduction to Widgetry", "aaa"), "sheet_item", { sheet: 0, row: 1, col: 0 });
    expect(resolved).toMatchObject({
      type: "sheet_item",
      anchor: { sheet: 0, row: 1, col: 0 },
      key: "sheetitem:0:1:0",
      field: null,
    });
    expect(resolved!.fingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses an empty cell, a missing cell, and the wrong kind of document", () => {
    const render = sheet("Intro", "aaa");
    for (const anchor of [
      { sheet: 0, row: 1, col: 2 }, // empty: the student's Status column
      { sheet: 0, row: 1, col: 9 },
      { sheet: 0, row: 7, col: 0 },
      { sheet: 4, row: 1, col: 0 },
      { sheet: 0, row: -1, col: 0 },
      {},
    ]) {
      expect(resolveAnchor(render, "sheet_item", anchor), JSON.stringify(anchor)).toBeNull();
    }
    expect(resolveAnchor(pdf(["h"]), "sheet_item", { sheet: 0, row: 1, col: 0 })).toBeNull();
    expect(resolveAnchor(render, "doc_item", { block: 0, row: 1, col: 0 })).toBeNull();
  });

  it("accepts a filled Word table cell, and nothing outside a table", () => {
    expect(resolveAnchor(document, "doc_item", { block: 1, row: 1, col: 0 })).toMatchObject({
      type: "doc_item",
      key: "blockitem:1:1:0",
      field: null,
    });
    expect(resolveAnchor(document, "doc_item", { block: 1, row: 1, col: 1 })).toBeNull(); // empty
    expect(resolveAnchor(document, "doc_item", { block: 0, row: 0, col: 0 })).toBeNull(); // a paragraph
    expect(resolveAnchor(document, "doc_item", { block: 1, row: 5, col: 0 })).toBeNull();
  });

  it("has a key of its own, so it never collides with the department's empty cell", () => {
    const item = resolveAnchor(sheet("Intro", "aaa"), "sheet_item", { sheet: 0, row: 0, col: 2 });
    const cell = resolveAnchor(sheet("Intro", "aaa"), "sheet_cell", { sheet: 0, row: 1, col: 2 });
    expect(item!.key).not.toBe(cell!.key);
    expect(item!.key!.startsWith("sheetitem:")).toBe(true);
  });

  it("stays after a replacement only while the cell still says the same thing", () => {
    const made = resolveAnchor(sheet("Introduction to Widgetry", "aaa"), "sheet_item", { sheet: 0, row: 1, col: 0 })!;
    const stored = { anchorType: "sheet_item", anchor: made.anchor, anchorFingerprint: made.fingerprint };
    // Same wording, different spacing: the same cell.
    expect(reconcileAnchor(stored, sheet("Introduction   to  Widgetry ", "zzz"), false)).not.toBeNull();
    // Another requirement now sits there.
    expect(reconcileAnchor(stored, sheet("History of Widgets", "aaa"), false)).toBeNull();
    // A different kind of file.
    expect(reconcileAnchor(stored, pdf(["h"]), false)).toBeNull();

    const inDoc = resolveAnchor(document, "doc_item", { block: 1, row: 1, col: 0 })!;
    const storedDoc = { anchorType: "doc_item", anchor: inDoc.anchor, anchorFingerprint: inDoc.fingerprint };
    expect(reconcileAnchor(storedDoc, document, false)).not.toBeNull();
    expect(reconcileAnchor(storedDoc, sheet("x", "y"), false)).toBeNull();
  });

  it("is described by what the cell says", () => {
    expect(
      describeAnchor(sheet("Introduction to Widgetry", "aaa"), { anchorType: "sheet_item", anchor: { sheet: 0, row: 1, col: 1 }, anchorFingerprint: null }),
    ).toBe("WIDG 101");
    expect(describeAnchor(document, { anchorType: "doc_item", anchor: { block: 1, row: 1, col: 0 }, anchorFingerprint: null })).toBe(
      "WIDG 101 Introduction",
    );
    expect(describeAnchor(pdf(["h"]), { anchorType: "doc_item", anchor: { block: 1, row: 1, col: 0 }, anchorFingerprint: null })).toBe(
      "Tracking entry",
    );
  });
});

describe("reconcileAnchor — what survives a replacement", () => {
  const cell = { anchorType: "sheet_cell", anchor: { sheet: 0, row: 1, col: 2 }, anchorFingerprint: "aaa" };

  it("keeps a cell entry when the same place holds the same row", () => {
    expect(reconcileAnchor(cell, sheet("Intro", "aaa"), false)?.key).toBe("sheet:0:1:2");
  });

  it("detaches a cell entry when the row at that place now says something else", () => {
    expect(reconcileAnchor(cell, sheet("History of Widgets", "bbb"), false)).toBeNull();
  });

  it("detaches a cell entry when the new file is a different kind of document", () => {
    expect(reconcileAnchor(cell, pdf(["h"]), false)).toBeNull();
    expect(reconcileAnchor(cell, null, false)).toBeNull();
  });

  it("keeps a PDF marker only on a page that says the same thing at the same size", () => {
    const marker = { anchorType: "point", anchor: { page: 0, x: 0.4, y: 0.2 }, anchorFingerprint: "612x792:h1" };
    expect(reconcileAnchor(marker, pdf(["h1", "different"]), false)).not.toBeNull();
    expect(reconcileAnchor(marker, pdf(["changed"]), false)).toBeNull();
    expect(reconcileAnchor(marker, pdf(["h1"], { width: 792, height: 612 }), false)).toBeNull();
    // Its page is gone from where it was, and no page of the new file is that page.
    expect(reconcileAnchor({ ...marker, anchor: { page: 3, x: 0.4, y: 0.2 } }, pdf(["other"]), false)).toBeNull();
  });

  it("lets a PDF marker follow its page to a new page number, when exactly one page is that page", () => {
    const marker = { anchorType: "point", anchor: { page: 3, x: 0.4, y: 0.2 }, anchorFingerprint: "612x792:h1" };
    expect(reconcileAnchor(marker, pdf(["cover", "h1"]), false)?.anchor).toEqual({ page: 1, x: 0.4, y: 0.2 });
    expect(reconcileAnchor(marker, pdf(["h1", "cover", "h1"]), false)).toBeNull();
  });

  it("never keeps a marker that cannot be verified: a scanned page or a picture", () => {
    const scanned = { anchorType: "point", anchor: { page: 0, x: 0.4, y: 0.2 }, anchorFingerprint: null };
    expect(reconcileAnchor(scanned, pdf([null]), false)).toBeNull();
    expect(reconcileAnchor(scanned, image, false)).toBeNull();
  });

  it("keeps everything when the very same file is uploaded again", () => {
    const scanned = { anchorType: "point", anchor: { page: 0, x: 0.4, y: 0.2 }, anchorFingerprint: null };
    expect(reconcileAnchor(scanned, image, true)).not.toBeNull();
    expect(reconcileAnchor(cell, sheet("Intro", "aaa"), true)).not.toBeNull();
  });

  it("always keeps the student's list entries", () => {
    const manual = { anchorType: "manual", anchor: {}, anchorFingerprint: null };
    for (const next of [pdf(["x"]), image, sheet("a", "b"), null] as (ChecksheetRender | null)[]) {
      expect(reconcileAnchor(manual, next, false)?.type).toBe("manual");
    }
  });
});

describe("describeAnchor", () => {
  it("names a detached cell entry after the row it sat in", () => {
    const stored = { anchorType: "sheet_cell", anchor: { sheet: 0, row: 1, col: 2 }, anchorFingerprint: "aaa" };
    expect(describeAnchor(sheet("Introduction to Widgetry", "aaa"), stored)).toBe("Introduction to Widgetry");
    expect(
      describeAnchor(document, { anchorType: "doc_cell", anchor: { block: 1, row: 1, col: 1 }, anchorFingerprint: "x" }),
    ).toBe("WIDG 101 Introduction");
  });

  it("falls back to the position when there is nothing to quote", () => {
    const stored = { anchorType: "sheet_cell", anchor: { sheet: 0, row: 7, col: 2 }, anchorFingerprint: "aaa" };
    expect(describeAnchor(sheet("x", "aaa"), stored)).toBe("Major, row 8");
    expect(describeAnchor(pdf(["h"]), { anchorType: "point", anchor: { page: 2, x: 0, y: 0 }, anchorFingerprint: null })).toBe(
      "Marker on page 3",
    );
    expect(describeAnchor(image, { anchorType: "point", anchor: { page: 0, x: 0, y: 0 }, anchorFingerprint: null })).toBe(
      "Marker on the picture",
    );
  });

  it("clips a very long row label", () => {
    const stored = { anchorType: "sheet_cell", anchor: { sheet: 0, row: 1, col: 2 }, anchorFingerprint: "aaa" };
    expect(describeAnchor(sheet("x".repeat(500), "aaa"), stored)).toHaveLength(200);
  });
});

describe("what a student types", () => {
  it("cleans a single line", () => {
    expect(cleanLine("  Finance   Major\r\nChecksheet\t", 120)).toBe("Finance Major Checksheet");
    expect(cleanLine("   ", 120)).toBeNull();
    expect(cleanLine(42, 120)).toBeNull();
    expect(cleanLine("x".repeat(300), 120)).toHaveLength(120);
    expect(cleanLine("a\u0000b\u0007c", 120)).toBe("a b c");
  });

  it("keeps line breaks in a note but not control characters", () => {
    expect(cleanNote("first\nsecond\n\n\n\nthird\u0000", 500)).toBe("first\nsecond\n\nthird");
    expect(cleanNote("", 500)).toBeNull();
  });

  it("stores only plain web addresses as a source link", () => {
    expect(cleanSourceUrl("https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/")).toEqual({
      ok: true,
      url: "https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/",
    });
    expect(cleanSourceUrl("  ")).toEqual({ ok: true, url: null });
    expect(cleanSourceUrl(null)).toEqual({ ok: true, url: null });
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://example.edu/file",
      "www.scu.edu/no-scheme",
      "https://user:secret@example.edu/",
      `https://example.edu/${"a".repeat(2100)}`,
      7,
    ]) {
      expect(cleanSourceUrl(bad), String(bad).slice(0, 40)).toEqual({ ok: false });
    }
  });

  it("suggests a title from a file name without reading anything into it", () => {
    expect(titleFromFileName("finance_major-2025.pdf")).toBe("finance major 2025");
    expect(titleFromFileName(".pdf")).toBe(".pdf");
    expect(titleFromFileName("___.xlsx")).toBe("Degree Checksheet");
  });
});
