/**
 * The Registrar-pending rules of the hidden Degree Completion Assessment, on
 * SYNTHETIC APR rows (no real student's report is or may be committed).
 *
 * Every case pins the conservative behaviour while the Registrar's answers are
 * pending: "In Progress" is never complete; a minimum-combination statement is
 * kept verbatim and read only for a number it states; a remaining count is
 * reported only when Workday's own words give it.
 */
import { describe, expect, it } from "vitest";
import type { AprWorkbook } from "../apr/workbook-model";
import { assessWorkbook, readStatus, type AssessmentItem } from "./engine";
import { normalizeApr, readRemaining, readStatusCell } from "./apr-normalized";
import { mergeCorrections } from "./service";
import type { DegreeCompletionOverrideRow } from "@workspace/db";

type Cell = string | null | { text: string; indent: number };
type Row = Cell[];
const HEADER: Row = ["Requirement", "Status", "Remaining", "Registrations Used", "Academic Period", "Units", "Grade"];

function workbook(rows: Row[]): AprWorkbook {
  const all: Row[] = [["Finance Major Requirements"], HEADER, ...rows];
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
          cells: cells.flatMap((cell, c) =>
            !cell ? [] : typeof cell === "string" ? [{ c, text: cell }] : [{ c, text: cell.text, indent: cell.indent }],
          ),
        })),
      },
    ],
  };
}
const items = (rows: Row[], options?: Parameters<typeof assessWorkbook>[1]): AssessmentItem[] =>
  assessWorkbook(workbook(rows), options).programs.flatMap((p) => p.items);
const one = (rows: Row[], options?: Parameters<typeof assessWorkbook>[1]) => items(rows, options)[0]!;

describe("rule codes and remaining counts", () => {
  it("Not Satisfied: explicit, with the count Workday states", () => {
    const item = one([["Finance Major: FNCE 124", "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null]]);
    expect(item.derived.state).toBe("CLEAR_REMAINING");
    expect(item.rule).toEqual({ code: "NOT_SATISFIED_EXPLICIT", remainingCourses: { count: 1, basis: "SOURCE_COUNT_AVAILABLE" } });
  });

  it("In Progress with one clearly scheduled final course: never complete, still Needs Review", () => {
    const item = one([["Core: LSB: C&I 2", "In Progress", null, "HIST 11B - Cultures and Ideas II (In Progress)", "Winter 2027 Quarter", "4", null]]);
    expect(item.derived.state).toBe("AMBIGUOUS");
    expect(item.derived.state).not.toBe("LIKELY_COMPLETE");
    expect(item.rule).toEqual({ code: "IN_PROGRESS_SINGLE_FINAL_COURSE", remainingCourses: { count: null, basis: "SOURCE_COUNT_UNAVAILABLE" } });
  });

  it("In Progress with minimum combination not met: the statement is kept, nothing is inferred", () => {
    const item = one([["Core: LSB: 2nd Language (Level 2)", "In Progress - Minimum combination not met", "Minimum Combination Required", "SPAN 2 (In Progress)", null, null, null]]);
    expect(item.derived).toEqual({ state: "AMBIGUOUS", reason: "in_progress_combination" });
    expect(item.aprStatus).toBe("In Progress - Minimum combination not met");
    expect(item.statusDetail).toBe("Minimum combination not met");
    expect(item.minimumCombination).toEqual({ text: "Minimum Combination Required", kind: "combination", amount: null });
    expect(item.rule).toEqual({ code: "IN_PROGRESS_MINIMUM_NOT_MET", remainingCourses: { count: null, basis: "SOURCE_COUNT_UNAVAILABLE" } });
  });

  it("a minimum-combination statement in the Status cell alone is found and read", () => {
    const item = one([["Core: LSB: 2nd Language (Level 2)", "In Progress (Minimum combination not met: 2 Course(s))", null, "SPAN 2 (In Progress)", null, null, null]]);
    expect(item.derived.reason).toBe("in_progress_combination");
    expect(item.minimumCombination).toEqual({ text: "Minimum combination not met: 2 Course(s)", kind: "combination", amount: 2, unit: "courses" });
    // The number is the source's, but what it counts against in-progress courses is the Registrar's question.
    expect(item.rule.remainingCourses).toEqual({ count: null, basis: "SOURCE_COUNT_UNAVAILABLE" });
  });

  it("a multi-course requirement with insufficient information is ambiguous", () => {
    const item = one([
      ["Finance Major: Upper Division Electives", "In Progress", null, "FNCE 125 - Investments", "Fall 2026 Quarter", "4", "A"],
      [null, null, null, "FNCE 132 - Derivatives (In Progress)", "Winter 2027 Quarter", "4", null],
    ]);
    expect(item.derived.state).toBe("AMBIGUOUS");
    expect(item.rule.code).toBe("MULTI_COURSE_AMBIGUOUS");
    expect(item.rule.remainingCourses.count).toBeNull();
  });

  it("an explicit remaining number under In Progress is counted only with the Registrar-confirmed subrule", () => {
    const rows: Row[] = [["Finance Major: Upper Division Electives", "In Progress", "Minimum 2 Course(s)", "FNCE 132 - Derivatives (In Progress)", null, null, null]];
    expect(one(rows).rule).toEqual({ code: "MULTI_COURSE_AMBIGUOUS", remainingCourses: { count: null, basis: "SOURCE_COUNT_UNAVAILABLE" } });
    const confirmed = one(rows, { inProgressRemainingIsAdditional: true });
    expect(confirmed.derived.state).toBe("CLEAR_REMAINING");
    expect(confirmed.rule.remainingCourses).toEqual({ count: 2, basis: "SOURCE_COUNT_AVAILABLE" });
  });

  it("an ambiguous status phrasing is never read as Satisfied", () => {
    const item = one([["Core: LSB: Arts", "Satisfied by exception", null, null, null, null, null]]);
    expect(item.derived).toEqual({ state: "AMBIGUOUS", reason: "unknown_status" });
    expect(item.rule.code).toBe("UNKNOWN_STATUS");
    expect(readStatus("Satisfied")).toBe("satisfied");
    expect(readStatus("Not Satisfied")).toBe("not_satisfied");
    expect(readStatusCell("In Progress")).toEqual({ word: "in_progress", detail: null });
  });

  it("units are never turned into a course count", () => {
    expect(readRemaining("Minimum 20 Unit(s)")).toEqual({ text: "Minimum 20 Unit(s)", kind: "units", amount: 20 });
    const item = one([["University Requirement: Upper Division Units", "Not Satisfied", "Minimum 20 Unit(s)", null, null, null, null]]);
    expect(item.rule.remainingCourses).toEqual({ count: null, basis: "SOURCE_COUNT_UNAVAILABLE" });
  });
});

describe("the normalized APR model", () => {
  it("keeps parent and child requirements, row order and the source document", () => {
    const wb = workbook([
      [{ text: "Finance Major: Major Requirements", indent: 0 }, "In Progress", null, null, null, null, null],
      [{ text: "Finance Major: FNCE 121", indent: 1 }, "Satisfied", null, "FNCE 121 - Corporate Finance", "Fall 2026 Quarter", "4", "A-"],
      [{ text: "Finance Major: FNCE 124", indent: 1 }, "Not Satisfied", "Minimum 1 Course(s)", null, null, null, null],
    ]);
    const { requirements } = normalizeApr(wb, { sourceDocumentId: 42 });
    const [parent, a, b] = requirements;
    expect(requirements.map((r) => r.rowOrder)).toEqual([0, 1, 2]);
    expect(a!.parentKey).toBe(parent!.key);
    expect(b!.parentKey).toBe(parent!.key);
    expect(parent!.childKeys).toEqual([a!.key, b!.key]);
    expect(a!.source.documentId).toBe(42);
    // The assessment carries the same hierarchy and the same keys (stored corrections keep matching).
    const assessed = assessWorkbook(wb).programs[0]!.items;
    expect(assessed.map((i) => i.key)).toEqual(requirements.map((r) => r.key));
    expect(assessed[1]!.parentKey).toBe(parent!.key);
  });

  it("reads Academic Period, Units and Grade only when asked, and the assessment never does", () => {
    const rows: Row[] = [["Finance Major: FNCE 121", "Satisfied", null, "FNCE 121 - Corporate Finance", "Fall 2026 Quarter", "4", "A-"]];
    expect(normalizeApr(workbook(rows)).requirements[0]!.courseRows[0]).toMatchObject({ academicPeriod: null, units: null, grade: null });
    expect(normalizeApr(workbook(rows), { includeWithheldColumns: true }).requirements[0]!.courseRows[0]).toMatchObject({
      academicPeriod: "Fall 2026 Quarter",
      units: "4",
      grade: "A-",
    });
    const text = JSON.stringify(assessWorkbook(workbook(rows)));
    expect(text).not.toContain("A-");
    expect(text).not.toContain("Fall 2026 Quarter");
  });
});

describe("a student's correction", () => {
  it("is reported as USER_OVERRIDE while it applies, and the automatic code returns when it is reset", () => {
    const assessment = assessWorkbook(workbook([["Core: LSB: C&I 2", "In Progress", null, "HIST 11B (In Progress)", null, null, null]]));
    const item = assessment.programs[0]!.items[0]!;
    const row = {
      id: 1,
      userId: "synthetic",
      documentId: 1,
      itemKey: item.key,
      sourceFingerprint: item.fingerprint,
      sourceLabel: item.label,
      statusOverride: "complete",
      hidden: false,
      note: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as unknown as DegreeCompletionOverrideRow;
    const corrected = mergeCorrections(assessment, [row]).programs[0]!.items[0]!;
    expect(corrected.automatic.code).toBe("USER_OVERRIDE");
    expect(corrected.automatic.state).toBe("AMBIGUOUS");
    expect(corrected.effective).toBe("complete_for_planning");
    const reset = mergeCorrections(assessment, []).programs[0]!.items[0]!;
    expect(reset.automatic.code).toBe("IN_PROGRESS_SINGLE_FINAL_COURSE");
    expect(reset.effective).toBe("needs_review");
  });
});
