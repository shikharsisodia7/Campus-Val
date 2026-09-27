/**
 * SYNTHETIC Workday Academic Progress Report workbooks for tests and local QA.
 *
 * Every name, course history, grade and date here is invented. The layout
 * follows the structure of Workday's "View My Academic Progress" report, which
 * was checked against a real export (never committed):
 *
 *   - one export holds SEVERAL program blocks, each titled
 *     "<Program> Requirements" and followed by summary lines ("Program of Study
 *     GPA", "Requirements Effective", "Last Evaluated", "Requirements Not
 *     Assigned") and its own table;
 *   - the table header is two rows: "Satisfied With" spans "Registrations Used |
 *     Academic Period | Units | Grade";
 *   - requirement text is prefixed "University Requirement:", "Core: LSB: …",
 *     "<School> Core Knowledge: …", "<Program> Major : …" — and some rows have
 *     no colon at all ("Mathematics Major GPA");
 *   - a requirement's further registrations follow on rows with an empty
 *     requirement cell.
 *
 * "workday-combined" reproduces all of that. The single-program fixtures use a
 * one-row header on purpose, so both header shapes stay covered.
 * No real student's report is, or may be, committed.
 *
 * Workbooks are built in memory so the tests need no binary files:
 *   buildAprFixture("finance-major") -> Buffer
 * and `pnpm --filter @workspace/api-server exec tsx src/__fixtures__/apr/write-fixtures.ts <dir>`
 * writes them to disk for browser QA.
 */
import ExcelJS from "exceljs";

export type AprFixtureName =
  | "finance-major"
  | "computer-science-major"
  | "data-science-minor"
  | "two-row-header"
  | "workday-combined"
  | "unrecognized-layout"
  | "two-sheets"
  | "hostile-content";

type Cell = string | number | null;
type Row = Cell[];

export const APR_HEADER: Row = [
  "Requirement",
  "Status",
  "Remaining",
  "Satisfied With",
  "Academic Period",
  "Units",
  "Grade",
];

/** Text that exists ONLY in the omitted columns — tests assert the sidebar never carries it. */
export const FIXTURE_PRIVATE_MARKERS = {
  academicPeriods: ["Fall 2025 Quarter", "Winter 2026 Quarter", "Spring 2026 Quarter", "Fall 2026 Quarter"],
  grades: ["A-", "B+", "C+", "CR"],
  units: ["4.5"],
};

const FINANCE_ROWS: Row[] = [
  ["University Requirement: Must have a minimum 2.000 Cumulative GPA", "Satisfied", null, null, null, null, null],
  [
    "University Requirement: Must complete a minimum 60 Upper Division Units",
    "In Progress",
    "Minimum 20 Unit(s)",
    "FNCE 121 - Corporate Finance",
    "Fall 2026 Quarter",
    4,
    "B+",
  ],
  [null, null, null, "ECON 2 - Principles of Macroeconomics (Transfer Credit)", null, 4.5, "CR"],
  ["Core: LSB: CTW 1", "Satisfied", null, "ENGL 1A - Critical Thinking and Writing I", "Fall 2025 Quarter", 4, "A-"],
  ["Core: LSB: C&I 1", "In Progress", null, "HIST 11A - Cultures and Ideas I (In Progress)", "Winter 2026 Quarter", 4, null],
  ["Core: LSB: C&I 2", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
  ["Core: LSB: 2nd Language (Level 2)", "Not Satisfied", "Minimum Combination Required", null, null, null, null],
  [
    "Sample School of Business Core Knowledge: Accounting 11",
    "Satisfied",
    null,
    "ACTG 11 - Introduction to Financial Accounting (Transfer Credit)",
    null,
    4.5,
    "CR",
  ],
  ["Finance Major : Major GPA", "Not Satisfied", "Minimum 2.000 GPA", null, null, null, null],
  ["Finance Major : FNCE 121 & 124", "In Progress", "Minimum 1 Course(s)", "FNCE 121 - Corporate Finance", "Fall 2026 Quarter", 4, "B+"],
  ["Finance Major : Upper Division Electives", "Not Satisfied", "Minimum 3 Course(s)", null, null, null, null],
];

const CS_ROWS: Row[] = [
  ["University Requirement: Must have a minimum 2.000 Cumulative GPA", "Satisfied", null, null, null, null, null],
  ["Core: CAS: CTW 1", "Satisfied", null, "ENGL 1A - Critical Thinking and Writing I", "Fall 2025 Quarter", 4, "A-"],
  ["Core: CAS: Mathematics", "Satisfied", null, "MATH 11 - Calculus and Analytic Geometry I", "Fall 2025 Quarter", 4, "A-"],
  ["Computer Science Major : CSCI 10", "Satisfied", null, "CSCI 10 - Introduction to Computer Science", "Winter 2026 Quarter", 5, "B+"],
  ["Computer Science Major : CSCI 60", "In Progress", null, "CSCI 60 - Introduction to C++ (In Progress)", "Fall 2026 Quarter", 5, null],
  ["Computer Science Major : CSCI 61", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
];

const MINOR_ROWS: Row[] = [
  ["Data Science Minor : Minor GPA", "Not Satisfied", "Minimum 2.000 GPA", null, null, null, null],
  ["Data Science Minor : Statistics", "Satisfied", null, "MATH 122 - Probability and Statistics I", "Spring 2026 Quarter", 5, "C+"],
  ["Data Science Minor: Experiential Activity", "Not Satisfied", "Minimum Activities: 1", null, null, null, null],
];

const MATH_ROWS: Row[] = [
  ["University Requirement: Must have a minimum 2.000 Cumulative GPA", "Satisfied", null, null, null, null, null],
  ["Core: CAS: CTW 1", "Satisfied", null, "ENGL 1A - Critical Thinking and Writing I", "Fall 2025 Quarter", 4, "A-"],
  ["Core: CAS: Natural Science", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
  // Workday writes this row WITHOUT a colon.
  ["Mathematics Major GPA", "Satisfied", null, null, null, null, null],
  ["Mathematics Major: MATH 11", "Satisfied", null, "MATH 11 - Calculus and Analytic Geometry I", "Fall 2025 Quarter", 4, "B+"],
  ["Mathematics Major: MATH 13", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
  ["Mathematics Major: Four Upper Division Math Electives (or CSCI 162)", "Not Satisfied", "Minimum 4 Course(s)", null, null, null, null],
];

const HEALTH_MINOR_ROWS: Row[] = [
  ["Healthcare Innovation Minor GPA", "Satisfied", null, null, null, null, null],
  [
    "Healthcare Innovation Minor: Introduction to design thinking and innovation",
    "Satisfied",
    null,
    "ENGR 166A - Introduction to Design Thinking I",
    "Fall 2025 Quarter",
    1,
    "A-",
  ],
  ["Healthcare Innovation Minor: Experiential Activity", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
];

const SPECIAL_ROWS: Row[] = [
  ["Special Interest Program: Sample Center Program", "Satisfied", null, "ENGR 110 - Community Based Engineering Design", "Winter 2026 Quarter", 3, "B+"],
];

export interface FixtureProgram {
  title: string;
  gpa: string;
  effective: string;
  notAssigned?: number;
  rows: Row[];
}

/** The programs of the combined report, shared by the Excel and the PDF fixture. */
export const FIXTURE_PROGRAMS: FixtureProgram[] = [
  { title: "Finance Major Requirements", gpa: "3.000", effective: "3", notAssigned: 2, rows: FINANCE_ROWS },
  { title: "Mathematics Major Requirements", gpa: "2.800", effective: "3", notAssigned: 1, rows: MATH_ROWS },
  {
    title: "Healthcare Innovation and Design Minor Requirements",
    gpa: "0.000",
    effective: "09/10/2025",
    rows: HEALTH_MINOR_ROWS,
  },
  { title: "Sample Center Requirements", gpa: "4.000", effective: "09/10/2025", rows: SPECIAL_ROWS },
];

/** One program block, laid out as Workday prints it. */
function addProgramBlock(
  ws: ExcelJS.Worksheet,
  title: string,
  summary: { gpa: string; effective: string; notAssigned?: number },
  rows: Row[],
): void {
  ws.addRow([title]).font = { bold: true };
  ws.addRow(["Program of Study GPA", summary.gpa]);
  ws.addRow(["Requirements Effective", summary.effective]);
  ws.addRow(["Last Evaluated", "01/12/2027 08:00:00 AM GMT-08:00 Pacific Time (Los Angeles)"]);
  if (summary.notAssigned !== undefined) ws.addRow(["Requirements Not Assigned", summary.notAssigned]);
  const top = ws.addRow(["Requirement", "Status", "Remaining", "Satisfied With", null, null, null]);
  const bottom = ws.addRow([null, null, null, "Registrations Used", "Academic Period", "Units", "Grade"]);
  for (const row of [top, bottom]) {
    row.font = { bold: true };
    row.alignment = { horizontal: "center" };
    for (let c = 1; c <= 7; c++) {
      row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD0D0D0" } };
    }
  }
  ws.mergeCells(top.number, 4, top.number, 7);
  ws.mergeCells(top.number, 1, bottom.number, 1);
  ws.mergeCells(top.number, 2, bottom.number, 2);
  ws.mergeCells(top.number, 3, bottom.number, 3);
  for (const r of rows) ws.addRow(r);
  ws.addRow([]);
}

function addTable(ws: ExcelJS.Worksheet, title: string, rows: Row[], header: Row[] = [APR_HEADER]): void {
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow(["Santa Clara University — synthetic test data"]);
  ws.addRow([]);
  for (const h of header) {
    const row = ws.addRow(h);
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
    });
  }
  for (const r of rows) {
    const row = ws.addRow(r);
    // Workday indents the registrations listed under a requirement.
    if (!r[0] && r[3]) row.getCell(4).alignment = { indent: 1 };
  }
  ws.columns = [{ width: 46 }, { width: 14 }, { width: 22 }, { width: 46 }, { width: 20 }, { width: 8 }, { width: 8 }];
}

export async function buildAprFixture(name: AprFixtureName): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  // Fixed timestamps: the same fixture name always yields the same bytes.
  wb.created = new Date(Date.UTC(2026, 0, 1));
  wb.modified = new Date(Date.UTC(2026, 0, 1));
  switch (name) {
    case "finance-major":
      addTable(wb.addWorksheet("View My Academic Progress"), "View My Academic Progress — Finance Major", FINANCE_ROWS);
      break;
    case "computer-science-major":
      addTable(
        wb.addWorksheet("View My Academic Progress"),
        "View My Academic Progress — Computer Science Major",
        CS_ROWS,
      );
      break;
    case "data-science-minor":
      addTable(wb.addWorksheet("View My Academic Progress"), "View My Academic Progress — Data Science Minor", MINOR_ROWS);
      break;
    case "two-row-header": {
      // "Satisfied With" spans the four columns that follow it.
      const ws = wb.addWorksheet("View My Academic Progress");
      addTable(ws, "View My Academic Progress — Finance Major", FINANCE_ROWS, [
        ["Requirement", "Status", "Remaining", "Satisfied With", null, null, null],
        [null, null, null, "Registrations Used", "Academic Period", "Units", "Grade"],
      ]);
      ws.mergeCells("D4:G4");
      break;
    }
    case "workday-combined": {
      // The whole report in one export, the way Workday lays it out.
      const ws = wb.addWorksheet("View My Academic Progress");
      ws.addRow(["View My Academic Progress"]).font = { bold: true, size: 14 };
      ws.addRow([
        "Sample Department/Undergraduate (Finance Major/Healthcare Innovation and Design Minor/Mathematics Major/Sample Center)",
      ]);
      ws.addRow(["Cumulative GPA", "3.100"]);
      ws.addRow(["Unused Registrations", 0]);
      for (const program of FIXTURE_PROGRAMS) {
        addProgramBlock(
          ws,
          program.title,
          { gpa: program.gpa, effective: program.effective, notAssigned: program.notAssigned },
          program.rows,
        );
      }
      ws.columns = [{ width: 46 }, { width: 14 }, { width: 22 }, { width: 46 }, { width: 20 }, { width: 8 }, { width: 8 }];
      break;
    }
    case "unrecognized-layout": {
      // A future Workday layout CampusVal does not know: no "Requirement/Status" header.
      const ws = wb.addWorksheet("Progress");
      ws.addRow(["Program Audit"]);
      ws.addRow(["Item", "Outcome", "Term", "Mark"]);
      ws.addRow(["Writing", "Done", "Fall 2025 Quarter", "A-"]);
      ws.addRow(["Calculus", "Done", "Fall 2025 Quarter", "B+"]);
      break;
    }
    case "two-sheets":
      addTable(wb.addWorksheet("Finance Major"), "View My Academic Progress — Finance Major", FINANCE_ROWS);
      addTable(wb.addWorksheet("Data Science Minor"), "View My Academic Progress — Data Science Minor", MINOR_ROWS);
      wb.addWorksheet("Empty");
      break;
    case "hostile-content": {
      const ws = wb.addWorksheet("View My Academic Progress");
      addTable(ws, "View My Academic Progress", [
        ['Core: <script>alert("x")</script>', "Satisfied", null, '<img src=x onerror="alert(1)">', "Fall 2025 Quarter", 4, "A-"],
        ["Core: =HYPERLINK(\"http://evil.example\",\"click\")", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
      ]);
      // A real formula with a cached value, a formula without one, and a hyperlink cell.
      ws.addRow(["Finance Major : Computed", { formula: "1+1", result: 2 } as unknown as Cell, null, null, null, null, null]);
      ws.addRow(["Finance Major : Uncomputed", { formula: "NOW()" } as unknown as Cell, null, null, null, null, null]);
      ws.addRow([
        "Finance Major : Linked",
        "Satisfied",
        null,
        { text: "FNCE 124 - Investments", hyperlink: "javascript:alert(1)" } as unknown as Cell,
        "Fall 2026 Quarter",
        4,
        "B+",
      ]);
      break;
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
