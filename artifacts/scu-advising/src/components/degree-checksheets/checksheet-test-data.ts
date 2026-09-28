/**
 * SYNTHETIC documents for component tests. Every program and course is
 * invented; no real department document or student file is used.
 */
import type {
  ChecksheetDocBlock,
  ChecksheetSheet,
  DegreeChecksheetAnnotation,
  DegreeChecksheetDocument,
  DegreeChecksheetRender,
} from "@workspace/api-client-react";
import type { ChecksheetTracking, TrackingEntry } from "@/hooks/use-degree-checksheets";

export function testDocument(overrides: Partial<DegreeChecksheetDocument> = {}): DegreeChecksheetDocument {
  return {
    id: 1,
    title: "Applied Widgetry Major Checksheet",
    category: "major_checksheet",
    programName: "Applied Widgetry",
    programRole: "major",
    school: "Sample School of Widgets",
    academicYearLabel: "Fall 2025 and Later",
    sourceUrl: null,
    sortOrder: 0,
    fileName: "applied-widgetry-major.xlsx",
    fileSize: 7036,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sourceFormat: "xlsx",
    sourceVersion: 1,
    uploadedAt: "2026-09-28T19:30:00.000Z",
    renderStatus: "ready",
    renderNoteCode: null,
    renderNoteMessage: null,
    previewKind: "spreadsheet",
    inlineTracking: true,
    fileFingerprint: "aaaaaaaaaaaa",
    createdAt: "2026-09-28T19:30:00.000Z",
    updatedAt: "2026-09-28T19:30:00.000Z",
    ...overrides,
  };
}

/** Title, blank, header, a section heading, then three courses. Columns C and D are the student's. */
export const majorSheet: ChecksheetSheet = {
  name: "Major",
  index: 0,
  visibility: "visible",
  rowCount: 7,
  columnCount: 5,
  columnWidths: [34, 14, 14, 20, 34],
  merges: [{ r: 0, c: 0, rowSpan: 1, colSpan: 5 }],
  rows: [
    { r: 0, cells: [{ c: 0, text: "Applied Widgetry Major Checksheet (sample)", bold: true }] },
    {
      r: 2,
      cells: [
        { c: 0, text: "Requirement", bold: true, filled: true },
        { c: 1, text: "Course", bold: true, filled: true },
        { c: 2, text: "Status", bold: true, filled: true },
        { c: 3, text: "Quarter Completed", bold: true, filled: true },
        { c: 4, text: "Notes", bold: true, filled: true },
      ],
    },
    { r: 3, cells: [{ c: 0, text: "Lower Division", bold: true }] },
    { r: 4, cells: [{ c: 0, text: "Introduction to Widgetry" }, { c: 1, text: "WIDG 101" }, { c: 4, text: "Recommended first course" }] },
    { r: 5, cells: [{ c: 0, text: "Widget Mathematics I" }, { c: 1, text: "WIDG 111" }, { c: 4, text: "Prerequisite for WIDG 112" }] },
    { r: 6, cells: [{ c: 0, text: "Widget Ethics" }, { c: 1, text: "WIDG 130" }, { c: 2, text: "Waived by department" }] },
  ],
  tracking: {
    columns: [
      { c: 2, field: "status", header: "Status", headerRow: 2 },
      { c: 3, field: "term", header: "Quarter Completed", headerRow: 2 },
    ],
    cells: [
      { r: 4, c: 2, field: "status" },
      { r: 5, c: 2, field: "status" },
      { r: 4, c: 3, field: "term" },
      { r: 5, c: 3, field: "term" },
      { r: 6, c: 3, field: "term" },
    ],
  },
};

export const electivesSheet: ChecksheetSheet = {
  name: "Electives",
  index: 1,
  visibility: "visible",
  rowCount: 2,
  columnCount: 2,
  columnWidths: [30, 14],
  merges: [],
  rows: [
    { r: 0, cells: [{ c: 0, text: "Course", bold: true }, { c: 1, text: "Completed", bold: true }] },
    { r: 1, cells: [{ c: 0, text: "SPRK 110 Sprocket History" }] },
  ],
  tracking: {
    columns: [{ c: 1, field: "status", header: "Completed", headerRow: 0 }],
    cells: [{ r: 1, c: 1, field: "status" }],
  },
};

/**
 * Laid out as a department "requirements checklist" is: the requirements with
 * one student column on the left, and a year-by-year grid with its own student
 * column on the right. Every cell is shaded, headings are bold.
 */
export const checklistSheet: ChecksheetSheet = {
  name: "Checklist",
  index: 0,
  visibility: "visible",
  rowCount: 5,
  columnCount: 5,
  columnWidths: [40, 18, 4, 24, 18],
  merges: [],
  rows: [
    {
      r: 0,
      cells: [
        { c: 0, text: "Requirements", bold: true, filled: true },
        { c: 1, text: "Quarter Completed", bold: true, filled: true },
        { c: 3, text: "Course", bold: true, filled: true },
        { c: 4, text: "Quarter", bold: true, filled: true },
      ],
    },
    { r: 1, cells: [{ c: 0, text: "Lower Division", bold: true, filled: true }, { c: 3, text: "First Year", bold: true, filled: true }] },
    { r: 2, cells: [{ c: 0, text: "Introduction to Widgetry", filled: true }, { c: 3, text: "WIDG 101", filled: true }] },
    { r: 3, cells: [{ c: 0, text: "Widget Mathematics I", filled: true }] },
    { r: 4, cells: [{ c: 3, text: "GADG 10", filled: true }] },
  ],
  tracking: {
    columns: [
      { c: 1, field: "both", header: "Quarter Completed", headerRow: 0 },
      { c: 4, field: "both", header: "Quarter", headerRow: 0 },
    ],
    cells: [
      { r: 2, c: 1, field: "both" },
      { r: 3, c: 1, field: "both" },
      { r: 2, c: 4, field: "both" },
      { r: 4, c: 4, field: "both" },
    ],
  },
};

export const spreadsheetRender: DegreeChecksheetRender = {
  version: 1,
  kind: "spreadsheet",
  sheets: [majorSheet, electivesSheet],
  warnings: [],
};

export const pdfRender: DegreeChecksheetRender = {
  version: 1,
  kind: "pdf",
  pages: [
    { width: 612, height: 792 },
    { width: 612, height: 792 },
  ],
};

export const imageRender: DegreeChecksheetRender = { version: 1, kind: "image", width: 640, height: 420 };

export const HOSTILE = {
  script: "<script>window.__checksheetPwned = true</script>",
  image: '<img src=x onerror="window.__checksheetPwned = true">',
};

export const documentBlocks: ChecksheetDocBlock[] = [
  { type: "heading", level: 1, runs: [{ text: "Applied Widgetry Advising Guide (sample)" }] },
  { type: "paragraph", runs: [{ text: "Start with " }, { text: "WIDG 101", bold: true }, { text: " in your first fall quarter." }] },
  { type: "list-item", ordered: false, depth: 0, runs: [{ text: "Take WIDG 111 before WIDG 112." }] },
  { type: "list-item", ordered: false, depth: 0, runs: [{ text: "WIDG 120 is offered in fall only." }] },
  {
    type: "table",
    rows: [
      [{ runs: [{ text: "Course" }], header: true }, { runs: [{ text: "Units" }], header: true }, { runs: [{ text: "Status" }], header: true }, { runs: [{ text: "Quarter" }], header: true }],
      [{ runs: [{ text: "WIDG 101 Introduction to Widgetry" }] }, { runs: [{ text: "4" }] }, { runs: [] }, { runs: [] }],
      [{ runs: [{ text: "WIDG 111 Widget Mathematics I" }] }, { runs: [{ text: "5" }] }, { runs: [] }, { runs: [] }],
    ],
    tracking: {
      columns: [
        { c: 2, field: "status", header: "Status", headerRow: 0 },
        { c: 3, field: "term", header: "Quarter", headerRow: 0 },
      ],
      cells: [
        { r: 1, c: 2, field: "status" },
        { r: 2, c: 2, field: "status" },
        { r: 1, c: 3, field: "term" },
        { r: 2, c: 3, field: "term" },
      ],
    },
  },
  { type: "paragraph", runs: [{ text: "Department website", href: "https://www.example.edu/widgetry" }] },
  { type: "paragraph", runs: [{ text: HOSTILE.script }] },
  { type: "paragraph", runs: [{ text: HOSTILE.image }] },
  { type: "paragraph", runs: [{ text: "A link that must not be followed", href: "javascript:window.__checksheetPwned=true" }] },
  { type: "image-omitted", alt: "Course flowchart" },
];

export const documentRender: DegreeChecksheetRender = { version: 1, kind: "document", blocks: documentBlocks, warnings: [] };

export function testAnnotation(overrides: Partial<DegreeChecksheetAnnotation> = {}): DegreeChecksheetAnnotation {
  return {
    id: 11,
    documentId: 1,
    anchorType: "manual",
    anchor: {},
    field: null,
    detached: false,
    itemLabel: null,
    status: null,
    term: null,
    termYear: null,
    note: null,
    sortOrder: 0,
    revision: 1,
    createdAt: "2026-09-28T19:30:00.000Z",
    updatedAt: "2026-09-28T19:30:00.000Z",
    ...overrides,
  };
}

export function testEntry(overrides: Partial<TrackingEntry> = {}): TrackingEntry {
  return {
    key: "id:11",
    id: 11,
    anchorType: "manual",
    anchor: {},
    field: null,
    detached: false,
    sortOrder: 0,
    itemLabel: null,
    status: null,
    term: null,
    termYear: null,
    note: null,
    ...overrides,
  };
}

type Spy = (...args: never[]) => unknown;

/** A stand-in for a document's tracking, recording what the view asks of it. */
export function fakeTracking(
  entries: TrackingEntry[],
  spies: Partial<
    Record<
      "change" | "remove" | "setCell" | "addItem" | "addPoint" | "addManual" | "movePoint" | "placeInCell" | "keepAsListEntry" | "retry",
      Spy
    >
  > = {},
): ChecksheetTracking {
  const nothing = () => undefined;
  return {
    entries,
    isLoading: false,
    isError: false,
    refetch: nothing as never,
    saveState: { status: "idle", failedKeys: [] },
    notice: null,
    dismissNotice: nothing,
    change: (spies.change ?? nothing) as never,
    remove: (spies.remove ?? nothing) as never,
    setCell: (spies.setCell ?? nothing) as never,
    addItem: (spies.addItem ?? (() => "item")) as never,
    addPoint: (spies.addPoint ?? (() => "new:1")) as never,
    addManual: (spies.addManual ?? (() => "new:1")) as never,
    movePoint: (spies.movePoint ?? nothing) as never,
    placeInCell: (spies.placeInCell ?? nothing) as never,
    keepAsListEntry: (spies.keepAsListEntry ?? nothing) as never,
    retry: (spies.retry ?? nothing) as never,
    flush: async () => undefined,
    reload: async () => undefined,
  };
}
