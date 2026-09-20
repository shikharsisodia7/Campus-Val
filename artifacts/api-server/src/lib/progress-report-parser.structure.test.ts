/**
 * The v3 APR data model: what the parser preserves so the planning sidebar and
 * the APR page can show the SAME conservative, verifiable structure — group
 * kinds, source order, university-wide vs program rows, and unit summaries that
 * appear ONLY when the report states them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APR_PARSER_VERSION,
  buildReportSummary,
  classifyGroupKind,
  extractRequirementGroups,
} from "./progress-report-parser";
import { planningProjection } from "./progress-report-view";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "..", "__fixtures__", "progress-report", name), "utf8");

describe("group kind classification (display order only; names stay verbatim)", () => {
  it.each([
    ["University Core Curriculum Requirements", "core"],
    ["Core Requirements", "core"],
    ["Computer Science and Engineering Major Requirements", "major"],
    ["Economics (BS) Major Requirements", "major"],
    ["Mathematics Minor Requirements", "minor"],
    ["College of Arts and Sciences Requirements", "other"],
    ["University Requirements", "other"],
    ["Pathway Requirements", "other"],
  ])("%s → %s", (heading, kind) => {
    expect(classifyGroupKind(heading)).toBe(kind);
  });

  it("checks minor before major so a minor is never read as a major", () => {
    expect(classifyGroupKind("Major Preparation Minor Requirements")).toBe("minor");
  });
});

describe("hierarchical fixture", () => {
  const text = fixture("workday-apr-hierarchical.txt");
  const groups = extractRequirementGroups(text);

  it("keeps each heading verbatim and tags its kind", () => {
    expect(groups.map((g) => [g.name, g.kind])).toEqual([
      ["Computer Science and Engineering Major Requirements", "major"],
      ["Mathematics Minor Requirements", "minor"],
    ]);
  });

  it("records document order: headings and rows are strictly increasing across the report", () => {
    const orders: number[] = [];
    for (const g of groups) {
      orders.push(g.order!);
      for (const r of g.requirements) orders.push(r.order!);
    }
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("marks the university-wide rows Workday repeats under every program", () => {
    const rows = groups.flatMap((g) => g.requirements);
    const university = rows.filter((r) => r.scope === "university");
    expect(university.map((r) => r.name)).toEqual([
      "University Requirement: Must have a minimum 2.000 Cumulative GPA",
      "University Requirement: Must complete 180 units Minimum 40.0 Unit(s)",
      "University Requirement: Must have a minimum 2.000 Cumulative GPA", // repeated under the minor
    ]);
    expect(rows.find((r) => r.name === "Lower Division Core Courses")!.scope).toBe("program");
  });

  it("captures the total-units row verbatim, with Workday's trailing text kept but NOT interpreted", () => {
    const summary = buildReportSummary(groups, text)!;
    expect(summary.totalUnits).toMatchObject({
      name: "University Requirement: Must complete 180 units",
      status: "in_progress",
      requiredUnits: 180,
      detail: "Minimum 40.0 Unit(s)",
    });
  });

  it("does NOT invent an upper-division summary the report never states", () => {
    const summary = buildReportSummary(groups, text)!;
    expect(summary.upperDivisionUnits).toBeUndefined();
  });

  it("keeps the source line of each row so a 'verify' item can be compared to the original", () => {
    const upper = groups[0]!.requirements.find((r) => /Upper Division Elective/.test(r.name))!;
    expect(upper.sourceText).toBe("Upper Division Elective Not Satisfied Minimum 1 Course(s)");
    expect(upper.status).toBe("remaining");
  });

  it("an 'Upper Division Elective' COURSE requirement is not mistaken for an upper-division UNITS row", () => {
    const rows = groups.flatMap((g) => g.requirements);
    expect(rows.filter((r) => r.unit === "upper_division")).toEqual([]);
  });
});

describe("unit summaries appear only when stated", () => {
  const wrap = (rows: string) => `Sample Major Requirements\n${rows}\n`;

  it("captures an upper-division units row", () => {
    const text = wrap(
      "University Requirement: Must complete 180 units Satisfied\nUniversity Requirement: Must complete 60 upper division units In Progress Minimum 12.0 Unit(s)",
    );
    const s = buildReportSummary(extractRequirementGroups(text), text)!;
    expect(s.totalUnits).toMatchObject({ requiredUnits: 180, status: "completed" });
    expect(s.upperDivisionUnits).toMatchObject({ requiredUnits: 60, status: "in_progress", detail: "Minimum 12.0 Unit(s)" });
  });

  it("an upper-division row does not also become the total-units row", () => {
    const text = wrap("University Requirement: Must complete 60 upper division units Not Satisfied");
    const s = buildReportSummary(extractRequirementGroups(text), text)!;
    expect(s.totalUnits).toBeUndefined();
    expect(s.upperDivisionUnits?.requiredUnits).toBe(60);
  });

  it("has no summary at all when the report prints no unit rows", () => {
    const text = wrap("University Requirement: Must have a minimum 2.000 Cumulative GPA Satisfied\nCore Courses Satisfied");
    expect(buildReportSummary(extractRequirementGroups(text), text)).toBeUndefined();
  });

  it("reads 'Cumulative Credits Earned' only when the label is printed exactly", () => {
    const anon = fixture("workday-apr-anonymized.txt");
    expect(buildReportSummary([], anon)).toEqual({ creditsEarned: 31 });
    expect(buildReportSummary([], "Credits: 31")).toBeUndefined();
  });

  it("first stated row of each kind wins; later duplicates (repeated under other programs) are ignored", () => {
    const text = `A Major Requirements\nUniversity Requirement: Must complete 180 units Satisfied\nB Minor Requirements\nUniversity Requirement: Must complete 175 units Not Satisfied\n`;
    const s = buildReportSummary(extractRequirementGroups(text), text)!;
    expect(s.totalUnits?.requiredUnits).toBe(180);
  });
});

describe("planning projection (server-side minimization)", () => {
  const parsed = {
    completedCourses: [{ code: "CSCI 10", title: "Intro", units: 5, confidence: "high" }],
    possibleCourses: [],
    notes: [],
    reportStudentId: "W1234567",
    program: "Computer Science",
    parserVersion: APR_PARSER_VERSION,
    groups: [
      {
        name: "X Major Requirements",
        kind: "major",
        requirements: [
          {
            name: "Core Courses",
            status: "completed",
            sourceText: "Core Courses Satisfied CSCI 10 A",
            courses: [{ code: "CSCI 10", title: "Intro", units: 5, grade: "A", inCatalog: true }],
          },
        ],
      },
    ],
  };

  it("removes every grade, every raw source line, and the student ID", () => {
    const out = planningProjection(parsed) as any;
    expect(JSON.stringify(out)).not.toMatch(/"grade":"[A-Z]/);
    expect(out.groups[0].requirements[0].courses[0].grade).toBeNull();
    expect(out.groups[0].requirements[0]).not.toHaveProperty("sourceText");
    expect(out).not.toHaveProperty("reportStudentId");
    expect(JSON.stringify(out)).not.toContain("W1234567");
  });

  it("keeps everything the sidebar needs: names, statuses, kinds, courses, program, completed list", () => {
    const out = planningProjection(parsed) as any;
    expect(out.groups[0]).toMatchObject({ name: "X Major Requirements", kind: "major" });
    expect(out.groups[0].requirements[0]).toMatchObject({ name: "Core Courses", status: "completed" });
    expect(out.groups[0].requirements[0].courses[0]).toMatchObject({ code: "CSCI 10", title: "Intro" });
    expect(out.program).toBe("Computer Science");
    expect(out.completedCourses).toHaveLength(1);
  });

  it("does not mutate the stored parse", () => {
    planningProjection(parsed);
    expect(parsed.groups[0]!.requirements[0]!.courses[0]!.grade).toBe("A");
    expect(parsed.reportStudentId).toBe("W1234567");
  });

  it("passes through null / non-object parses untouched", () => {
    expect(planningProjection(null)).toBeNull();
    expect(planningProjection(undefined)).toBeUndefined();
  });
});
