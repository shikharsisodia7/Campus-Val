/**
 * The Degree Completion Assessment rules, one case at a time, on SYNTHETIC
 * APR workbooks (no real student's report is or may be committed).
 */
import { describe, expect, it } from "vitest";
import type { AprWorkbook } from "../apr/workbook-model";
import { readAprWorkbook } from "../apr/workbook-reader";
import { buildAprFixture } from "../../__fixtures__/apr/build-workbooks";
import { assessWorkbook, deriveState, readRemaining, type AssessmentItem } from "./engine";

type Row = (string | null)[];
const HEADER: Row = ["Requirement", "Status", "Remaining", "Registrations Used", "Academic Period", "Units", "Grade"];

/** A one-sheet APR workbook: an optional block title, the header, then the rows. */
function workbook(rows: Row[], title: string | null = "Biology Major Requirements"): AprWorkbook {
  const all: Row[] = [...(title ? [[title]] : []), HEADER, ...rows];
  return {
    version: 1,
    sourceFormat: "xlsx",
    warnings: [],
    sheets: [
      {
        name: "View My Academic Progress",
        index: 0,
        visibility: "visible",
        rowCount: all.length,
        columnCount: HEADER.length,
        columnWidths: [],
        merges: [],
        rows: all.map((cells, r) => ({
          r,
          cells: cells.flatMap((text, c) => (text ? [{ c, text }] : [])),
        })),
      },
    ],
  };
}

const items = (wb: AprWorkbook): AssessmentItem[] => assessWorkbook(wb).programs.flatMap((p) => p.items);
const one = (rows: Row[]) => items(workbook(rows))[0]!;

describe("Degree Completion Assessment rules", () => {
  it("explicit Not Satisfied is a clear remaining requirement, with Workday's remaining words kept verbatim", () => {
    const item = one([["Biology Major: BIOL 101", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null]]);
    expect(item.derived).toEqual({ state: "CLEAR_REMAINING", reason: "apr_not_satisfied" });
    expect(item.remaining).toEqual({ text: "Minimum 1 Course(s)", kind: "courses", amount: 1 });
    expect(item.aprStatus).toBe("Not Satisfied");
  });

  it("single-course In Progress is never treated as complete: it needs review until graded", () => {
    const item = one([["Core: CAS: C&I 1", "In Progress", null, "HIST 11A - Cultures and Ideas I (In Progress)", "Winter 2026 Quarter", "4", null]]);
    expect(item.derived).toEqual({ state: "AMBIGUOUS", reason: "in_progress_pending_grade" });
    expect(item.registrations).toEqual([{ text: "HIST 11A - Cultures and Ideas I (In Progress)", inProgress: true }]);
  });

  it("multi-course In Progress with an amount remaining is ambiguous by default (Registrar-dependent)", () => {
    const rows: Row[] = [
      ["Biology Major: Upper Division Electives", "In Progress", "Minimum 3 Course(s)", "BIOL 174 - Cell Biology", "Fall 2025 Quarter", "5", "A-"],
      [null, null, null, "BIOL 175 - Molecular Biology (In Progress)", "Winter 2026 Quarter", "5", null],
    ];
    const item = one(rows);
    expect(item.derived).toEqual({ state: "AMBIGUOUS", reason: "in_progress_with_remaining" });
    expect(item.registrations.map((r) => r.inProgress)).toEqual([false, true]);
    // With the Registrar-confirmed subrule switched on, the stated amount is what remains.
    const flagged = assessWorkbook(workbook(rows), { inProgressRemainingIsAdditional: true }).programs[0]!.items[0]!;
    expect(flagged.derived).toEqual({ state: "CLEAR_REMAINING", reason: "in_progress_remaining_stated" });
  });

  it("minimum combination required: remaining when Not Satisfied, ambiguous when In Progress", () => {
    const notMet = one([["Core: CAS: 2nd Language (Level 2)", "Not Satisfied", "Minimum Combination Required", null, null, null, null]]);
    expect(notMet.derived.state).toBe("CLEAR_REMAINING");
    expect(notMet.remaining).toEqual({ text: "Minimum Combination Required", kind: "combination", amount: null });
    const inProgress = one([["Core: CAS: 2nd Language (Level 2)", "In Progress", "Minimum Combination Required", "SPAN 2 (In Progress)", null, null, null]]);
    expect(inProgress.derived).toEqual({ state: "AMBIGUOUS", reason: "in_progress_combination" });
  });

  it("a partially complete group keeps its rows apart: each requirement is judged by its own status", () => {
    const all = items(
      workbook([
        ["Biology Major: BIOL 1A", "Satisfied", null, "BIOL 1A - Transformations of Energy and Matter", "Fall 2025 Quarter", "4", "B+"],
        ["Biology Major: BIOL 1B", "In Progress", null, "BIOL 1B - Information and Evolution (In Progress)", "Winter 2026 Quarter", "4", null],
        ["Biology Major: BIOL 1C", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
      ]),
    );
    expect(all.map((i) => i.derived.state)).toEqual(["LIKELY_COMPLETE", "AMBIGUOUS", "CLEAR_REMAINING"]);
    expect(new Set(all.map((i) => i.key)).size).toBe(3);
  });

  it("a fully complete group appears complete, and nothing is ever stated as official", () => {
    const all = items(
      workbook([
        ["Core: CAS: CTW 1", "Satisfied", null, "ENGL 1A - Critical Thinking and Writing I", "Fall 2025 Quarter", "4", "A-"],
        ["Core: CAS: CTW 2", "Satisfied", null, "ENGL 1B - Critical Thinking and Writing II", "Winter 2026 Quarter", "4", "A"],
      ]),
    );
    expect(all.every((i) => i.derived.state === "LIKELY_COMPLETE")).toBe(true);
  });

  it("an unknown status word or a missing status is ambiguous, never guessed", () => {
    expect(one([["Core: CAS: Arts", "Waived", null, null, null, null, null]]).derived).toEqual({ state: "AMBIGUOUS", reason: "unknown_status" });
    expect(one([["Core: CAS: Arts", null, "Minimum 1 Course(s)", null, null, null, null]]).derived).toEqual({ state: "AMBIGUOUS", reason: "missing_status" });
    expect(deriveState("In Progress", null, [])).toEqual({ state: "AMBIGUOUS", reason: "in_progress_no_detail" });
  });

  it("missing data: a sheet with no recognisable table is reported, not invented", () => {
    const wb = workbook([["Some text"], ["More text"]], null);
    wb.sheets[0]!.rows = wb.sheets[0]!.rows.slice(1); // drop the header row
    const result = assessWorkbook(wb);
    expect(result.programs).toEqual([]);
    expect(result.unassessableSheets).toEqual([{ sheet: "View My Academic Progress", reason: "header_not_found" }]);
  });

  it("never reads grades, periods or units into the assessment", () => {
    const item = one([["Biology Major: BIOL 174", "Satisfied", null, "BIOL 174 - Cell Biology", "Fall 2025 Quarter", "5", "A-"]]);
    const text = JSON.stringify(item);
    expect(text).not.toContain("A-");
    expect(text).not.toContain("Fall 2025 Quarter");
  });

  it("traces every item to its source row, block and heading", () => {
    const item = one([["Biology Major: BIOL 101", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null]]);
    expect(item.source).toMatchObject({ sheet: "View My Academic Progress", row: 2, block: "Biology Major Requirements", group: "Biology Major", groupKind: "major" });
  });

  it("gives the same row the same key across exports, and a changed row a new fingerprint", () => {
    const before = one([["Biology Major: BIOL 101", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null]]);
    const reexported = items(
      workbook([
        ["Core: CAS: CTW 1", "Satisfied", null, "ENGL 1A", null, null, null],
        ["Biology Major: BIOL 101", "In Progress", null, "BIOL 101 - Biology Research Seminar (In Progress)", null, null, null],
      ]),
    ).find((i) => i.label === "Biology Major: BIOL 101")!;
    expect(reexported.key).toBe(before.key);
    expect(reexported.fingerprint).not.toBe(before.fingerprint);
  });

  it("reads Workday's remaining shapes", () => {
    expect(readRemaining("Minimum 20 Unit(s)")).toEqual({ text: "Minimum 20 Unit(s)", kind: "units", amount: 20 });
    expect(readRemaining("Minimum 2.000 GPA")).toEqual({ text: "Minimum 2.000 GPA", kind: "gpa", amount: 2 });
    expect(readRemaining("Minimum Activities: 1")).toEqual({ text: "Minimum Activities: 1", kind: "activities", amount: 1 });
    expect(readRemaining("  ")).toBeNull();
  });
});

describe("on the synthetic Workday export (several program blocks, two-row header)", () => {
  it("keeps each program block apart and assesses every requirement row", async () => {
    const wb = await readAprWorkbook(await buildAprFixture("workday-combined"));
    const result = assessWorkbook(wb);
    expect(result.programs.map((p) => p.block)).toEqual([
      "Finance Major Requirements",
      "Mathematics Major Requirements",
      "Healthcare Innovation and Design Minor Requirements",
      "Sample Center Requirements",
    ]);
    const finance = result.programs[0]!.items;
    const at = (label: string) => finance.find((i) => i.label === label)!;
    expect(at("Core: LSB: C&I 2").derived.state).toBe("CLEAR_REMAINING");
    expect(at("Core: LSB: C&I 1").derived.reason).toBe("in_progress_pending_grade");
    expect(at("Finance Major : FNCE 121 & 124").derived.reason).toBe("in_progress_with_remaining");
    expect(at("Core: LSB: 2nd Language (Level 2)").remaining?.kind).toBe("combination");
    expect(at("University Requirement: Must complete a minimum 60 Upper Division Units").registrations).toHaveLength(2);
    // The row Workday wrote without a colon is still assessed.
    expect(result.programs[1]!.items.find((i) => i.label === "Mathematics Major GPA")!.derived.state).toBe("LIKELY_COMPLETE");
  });
});
