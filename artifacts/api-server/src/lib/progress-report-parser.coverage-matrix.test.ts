/**
 * APR parser fixture coverage matrix (professor feedback, 2026-09 pass):
 * exercises the specific real-world shapes the professor named that the
 * existing golden-text/xlsx fixtures (progress-report-parser.fixture.test.ts)
 * didn't yet cover — double major, a University-Core group separate from
 * major/minor groups, an unrecognized/malformed row mixed into an otherwise
 * well-formed document, an older/renamed program name (proving the parser
 * never overlays today's catalog naming onto a student's own document), and
 * an XLSX whose layout is structurally different from the flowing-text PDF
 * shape (column-per-field spreadsheet rather than one row of prose per
 * line). See docs/APR_FIXTURE_COVERAGE_MATRIX.md for the full matrix this
 * file (together with progress-report-parser.fixture.test.ts) backs.
 *
 * All fixtures are synthetic/anonymized — no real student data.
 */
import { describe, it, expect } from "vitest";
import {
  extractRequirementGroups,
  parseXlsxBuffer,
  APR_PARSER_VERSION,
} from "./progress-report-parser";
import { COURSES } from "../data/courses";

const catalogMap = new Map(COURSES.map((c) => [c.code, c]));

async function minimalXlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const XLSXmod = (XLSX as any).default ?? XLSX;
  const ws = XLSXmod.utils.aoa_to_sheet(rows);
  const wb = XLSXmod.utils.book_new();
  XLSXmod.utils.book_append_sheet(wb, ws, "Progress Report");
  return XLSXmod.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// A real ENGL and FNCE/ECON course from the catalog, used so completed-course
// assertions check against real catalog metadata rather than invented data.
const ENGL_1A = catalogMap.get("ENGL 1A");
const MATH_11 = catalogMap.get("MATH 11");

describe("APR coverage matrix — double major with a separate University Core group", () => {
  const DOUBLE_MAJOR_TEXT = `
View My Academic Progress

Finance/Undergraduate (Finance Major/Economics Major)

Cumulative GPA Including Transfer 3.550

University Core Requirements

Critical Thinking and Writing Satisfied
ENGL 1A Composition and Rhetoric I Fall 2023 Quarter 4 A

Religion Theology and Culture 1 Not Started

Finance Major Requirements

University Requirement: Must have a minimum 2.000 Cumulative GPA Satisfied

FNCE 121 Financial Management Fall 2024 Quarter 4 B+
ZXQW 999 Bogus Unrecognized Course Row Fall 2026 Quarter 4 B+
FNCE 124 Investments Winter 2026 Quarter 4 (In Progress)

Upper Division Elective Not Satisfied Minimum 1 Course(s)

Economics Major Requirements

University Requirement: Must have a minimum 2.000 Cumulative GPA Satisfied

ECON 1 Introductory Microeconomics Fall 2023 Quarter 5 A-
`;

  it("produces three distinct groups — University Core, and each declared major — never merged into one", () => {
    const groups = extractRequirementGroups(DOUBLE_MAJOR_TEXT);
    expect(groups.map((g) => g.name)).toEqual([
      "University Core Requirements",
      "Finance Major Requirements",
      "Economics Major Requirements",
    ]);
  });

  it("the University Core group is independent of either major group and carries its own courses/status", () => {
    const [core] = extractRequirementGroups(DOUBLE_MAJOR_TEXT);
    const ctw = core!.requirements.find((r) => r.name.includes("Critical Thinking"));
    expect(ctw!.status).toBe("completed");
    expect(ctw!.courses[0]).toMatchObject({ code: "ENGL 1A", title: ENGL_1A!.title, grade: "A", inCatalog: true });

    const rtc = core!.requirements.find((r) => r.name.includes("Religion Theology"));
    expect(rtc!.status).toBe("remaining"); // "Not Started" -> remaining, never fabricated as its own status
  });

  it("both majors are fully populated with their own real completed/in-progress/remaining requirements", () => {
    const [, finance, econ] = extractRequirementGroups(DOUBLE_MAJOR_TEXT);
    expect(finance!.requirements.some((r) => r.status === "completed")).toBe(true);
    expect(finance!.requirements.some((r) => r.status === "remaining")).toBe(true);
    const financeCourses = finance!.requirements.flatMap((r) => r.courses).map((c) => c.code);
    expect(financeCourses).toContain("FNCE 121");
    expect(financeCourses).toContain("FNCE 124");

    expect(econ!.requirements.some((r) => r.status === "completed")).toBe(true);
    const econCourses = econ!.requirements.flatMap((r) => r.courses).map((c) => c.code);
    expect(econCourses).toContain("ECON 1");
  });

  it("an in-progress course inside a double-major group has no grade guessed", () => {
    const [, finance] = extractRequirementGroups(DOUBLE_MAJOR_TEXT);
    const fnce124 = finance!.requirements
      .flatMap((r) => r.courses)
      .find((c) => c.code === "FNCE 124");
    expect(fnce124).toMatchObject({ grade: null, inCatalog: true });
  });

  it("an unrecognized/malformed course-like row is surfaced as needs-review, never silently dropped or guessed as a real course", () => {
    const [, finance] = extractRequirementGroups(DOUBLE_MAJOR_TEXT);
    const bogus = finance!.requirements
      .flatMap((r) => r.courses)
      .find((c) => c.code === "ZXQW 999");
    expect(bogus).toBeDefined();
    expect(bogus!.inCatalog).toBe(false);
    // Title is the raw extracted text, never invented/looked-up metadata.
    expect(bogus!.title).toMatch(/Bogus Unrecognized Course Row/);
    expect(bogus!.units).toBeNull();
  });

  it("a completely non-code-shaped garbage line is ignored safely — no crash, no fabricated requirement", () => {
    const withGarbage = DOUBLE_MAJOR_TEXT + "\n$$$ !!! not a row at all ???\n";
    expect(() => extractRequirementGroups(withGarbage)).not.toThrow();
    const groups = extractRequirementGroups(withGarbage);
    expect(groups.map((g) => g.name)).toEqual([
      "University Core Requirements",
      "Finance Major Requirements",
      "Economics Major Requirements",
    ]);
  });
});

describe("APR coverage matrix — legacy/renamed program name is preserved verbatim (catalog-year-agnostic)", () => {
  // "Computer Engineering" predates the current "Computer Science and
  // Engineering" naming CampusVal's catalog uses today. The parser must
  // reproduce the STUDENT'S OWN document heading exactly, never silently
  // rewrite it to match today's Bulletin/catalog naming — the professor's
  // explicit "never assume the current Bulletin is correct for an
  // individual student whose catalog year may differ" requirement.
  const OLDER_CATALOG_TEXT = `
View My Academic Progress

Computer Engineering/Undergraduate (Computer Engineering Major)

Computer Engineering Major Requirements

University Requirement: Must have a minimum 2.000 Cumulative GPA Satisfied

MATH 11 Calculus and Analytic Geometry I Fall 2021 Quarter 4 A
`;

  it("keeps the document's own (older/renamed) program group name unchanged", () => {
    const groups = extractRequirementGroups(OLDER_CATALOG_TEXT);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe("Computer Engineering Major Requirements");
    // Never silently rewritten to CampusVal's current major title/code.
    expect(groups[0]!.name).not.toMatch(/Computer Science and Engineering/);
  });

  it("still resolves a real catalog course cited under the older program name", () => {
    const [group] = extractRequirementGroups(OLDER_CATALOG_TEXT);
    const req = group!.requirements[0]!;
    expect(req.courses[0]).toMatchObject({ code: "MATH 11", title: MATH_11!.title, grade: "A", inCatalog: true });
  });
});

describe("APR coverage matrix — XLSX with a structurally different layout than the flowing-text PDF shape", () => {
  // Real Workday XLSX exports vary: some sheet_to_csv into flowing
  // prose-per-row (already covered by workday-apr-anonymized.xlsx), others
  // export a genuine column-per-field table (Code | Title | Term | Units |
  // Grade | Status). This exercises that second, structurally different
  // shape end-to-end through the same parseXlsxBuffer path.
  it("parses a column-per-field spreadsheet layout and still classifies status per row correctly", async () => {
    const buf = await minimalXlsx([
      ["Program: Finance", null, null, null, null],
      ["Code", "Title", "Term", "Units", "Grade/Status"],
      ["FNCE 121", "Financial Management", "Fall 2024", 4, "B+"],
      ["FNCE 124", "Investments", "Winter 2026", 4, "In Progress"],
      ["ECON 1", "Introductory Microeconomics", "Fall 2023", 5, "A-"],
    ]);
    const result = await parseXlsxBuffer(buf);

    expect(result.program).toMatch(/^Program: Finance/);
    const completed = result.completedCourses.map((c) => c.code);
    expect(completed).toContain("FNCE 121");
    expect(completed).toContain("ECON 1");
    expect(completed).not.toContain("FNCE 124");

    const nonCompleted = (result.nonCompletedCourses ?? []).map((c) => c.code);
    expect(nonCompleted).toContain("FNCE 124");
  });

  it("attaches a parserVersion and produces no groups when the spreadsheet has no '<Program> Requirements' heading (honest flat fallback)", async () => {
    const buf = await minimalXlsx([
      ["Code", "Title", "Term", "Units", "Grade"],
      ["FNCE 121", "Financial Management", "Fall 2024", 4, "B+"],
    ]);
    const result = await parseXlsxBuffer(buf);

    expect(result.parserVersion).toBe(APR_PARSER_VERSION);
    expect(result.groups ?? []).toEqual([]);
  });
});
