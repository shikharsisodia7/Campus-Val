/**
 * SYNTHETIC APR data for component tests — invented courses, grades and dates,
 * in the same shapes the API returns. Mirrors the server fixtures in
 * artifacts/api-server/src/__fixtures__/apr/build-workbooks.ts.
 */
import type {
  AprSheet,
  AprWorkbook,
  ProgressReportDocument,
  ProgressReportSidebar,
  ProgressReportSidebarDocument,
} from "@workspace/api-client-react";

export function testReport(over: Partial<ProgressReportDocument> = {}): ProgressReportDocument {
  return {
    id: 1,
    label: "Finance Major",
    category: "primary_major",
    displayOrder: 0,
    fileName: "finance.xlsx",
    fileSize: 7168,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sourceFormat: "xlsx",
    uploadedAt: "2026-09-26T19:30:00.000Z",
    importStatus: "ready",
    importErrorCode: null,
    importErrorMessage: null,
    sheetCount: 1,
    tableFromPdf: false,
    fileFingerprint: "0123456789ab",
    createdAt: "2026-09-26T19:30:00.000Z",
    updatedAt: "2026-09-26T19:30:00.000Z",
    ...over,
  };
}

const COLUMNS = [
  { index: 0, header: "Requirement" },
  { index: 1, header: "Status" },
  { index: 2, header: "Remaining" },
  { index: 3, header: "Satisfied With" },
];

export function financeSidebarDocument(over: Partial<ProgressReportDocument> = {}): ProgressReportSidebarDocument {
  return {
    report: testReport(over),
    state: "ready",
    sheets: [
      {
        name: "View My Academic Progress",
        index: 0,
        structured: true,
        columns: COLUMNS,
        omittedColumns: ["Academic Period", "Units", "Grade"],
        preambleRowCount: 2,
        warnings: ["preamble_rows_in_full_view_only"],
        groups: [
          {
            key: "university",
            kind: "university",
            label: "University Requirements",
            block: null,
            blockIndex: 0,
            rows: [
              { r: 4, cells: ["University Requirement: Must have a minimum 2.000 Cumulative GPA", "Satisfied", "", ""] },
            ],
          },
          {
            key: "core",
            kind: "core",
            label: "Core",
            block: null,
            blockIndex: 0,
            rows: [
              { r: 7, cells: ["Core: LSB: CTW 1", "Satisfied", "", "ENGL 1A - Critical Thinking and Writing I"] },
              { r: 9, cells: ["Core: LSB: C&I 2", "Not Satisfied", "Minimum 1 Course(s)", ""] },
            ],
          },
          {
            key: "p:finance major",
            kind: "major",
            label: "Finance Major",
            block: null,
            blockIndex: 0,
            rows: [
              { r: 13, cells: ["Finance Major : FNCE 121 & 124", "In Progress", "Minimum 1 Course(s)", "FNCE 121 - Corporate Finance"] },
            ],
          },
        ],
      },
    ],
  };
}

export function minorSidebarDocument(): ProgressReportSidebarDocument {
  return {
    report: testReport({
      id: 3,
      label: "Data Science Minor",
      category: "minor",
      uploadedAt: "2026-09-23T18:00:00.000Z",
    }),
    state: "ready",
    sheets: [
      {
        name: "View My Academic Progress",
        index: 0,
        structured: true,
        columns: COLUMNS,
        omittedColumns: ["Academic Period", "Units", "Grade"],
        preambleRowCount: 2,
        warnings: [],
        groups: [
          {
            key: "p:data science minor",
            kind: "minor",
            label: "Data Science Minor",
            block: null,
            blockIndex: 0,
            rows: [{ r: 4, cells: ["Data Science Minor : Minor GPA", "Not Satisfied", "Minimum 2.000 GPA", ""] }],
          },
        ],
      },
    ],
  };
}

export function sidebar(documents: ProgressReportSidebarDocument[]): ProgressReportSidebar {
  return { available: true, documents };
}

const text = (c: number, t: string, extra: object = {}) => ({ c, text: t, ...extra });

export const financeSheet: AprSheet = {
  name: "View My Academic Progress",
  index: 0,
  visibility: "visible",
  rowCount: 7,
  columnCount: 7,
  columnWidths: [46, 14, 22, 46, 20, 8, 8],
  merges: [],
  rows: [
    { r: 0, cells: [text(0, "View My Academic Progress — Finance Major", { bold: true })] },
    {
      r: 2,
      cells: ["Requirement", "Status", "Remaining", "Satisfied With", "Academic Period", "Units", "Grade"].map((h, c) =>
        text(c, h, { bold: true, filled: true }),
      ),
    },
    {
      r: 3,
      cells: [
        text(0, "Core: LSB: CTW 1"),
        text(1, "Satisfied"),
        text(3, "ENGL 1A - Critical Thinking and Writing I"),
        text(4, "Fall 2025 Quarter"),
        text(5, "4"),
        text(6, "A-"),
      ],
    },
    {
      r: 4,
      cells: [text(3, "ECON 2 - Principles of Macroeconomics (Transfer Credit)", { indent: 1 }), text(5, "4.5"), text(6, "CR")],
    },
    { r: 5, cells: [text(0, "Core: LSB: C&I 2"), text(1, "Not Satisfied"), text(2, "Minimum 1 Course(s)")] },
    { r: 6, cells: [text(0, '<script>alert("x")</script>'), text(1, "Satisfied")] },
  ],
};

export const financeWorkbook: AprWorkbook = {
  version: 1,
  sourceFormat: "xlsx",
  sheets: [financeSheet],
  warnings: [],
};
