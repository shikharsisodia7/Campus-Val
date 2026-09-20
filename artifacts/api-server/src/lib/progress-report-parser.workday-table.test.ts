/**
 * The REAL Workday APR layout: a wrapped table flattened to one cell fragment
 * per line, with University Core rows living inside each program block.
 *
 * The fixture (`workday-apr-table-layout.txt`) is synthetic — invented student,
 * invented terms and grades — but reproduces the layout that the first parser
 * could not read: page furniture, wrapped names/titles, a status word sharing a
 * line with the name and the first course, "(In / Progress)" split across lines,
 * a title that starts on the next line ("ENVS 131 -"), the Remaining column in
 * all four shapes, transfer-credit rows with no period, and blocks that repeat
 * the University rows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APR_PARSER_VERSION, parseReportText } from "./progress-report-parser";
import { looksLikeWorkdayTable } from "./progress-report-workday-table";
import { planningProjection } from "./progress-report-view";

const text = readFileSync(
  join(import.meta.dirname, "..", "__fixtures__", "progress-report", "workday-apr-table-layout.txt"),
  "utf8",
);
const report = parseReportText(text);
const groups = report.groups ?? [];
const group = (name: RegExp) => {
  const g = groups.find((x) => name.test(x.name));
  if (!g) throw new Error(`no group matching ${name}`);
  return g;
};
const row = (g: { requirements: { name: string }[] }, name: RegExp) => {
  const r = g.requirements.find((x) => name.test(x.name));
  if (!r) throw new Error(`no requirement matching ${name}`);
  return r as (typeof groups)[number]["requirements"][number];
};

describe("Workday table layout — detection and header", () => {
  it("recognises the layout and stamps parser v4", () => {
    expect(looksLikeWorkdayTable(text)).toBe(true);
    expect(report.parserVersion).toBe(APR_PARSER_VERSION);
    expect(APR_PARSER_VERSION).toBe("hierarchical-v4");
  });

  it("reads the declared majors/minors and dates Workday printed", () => {
    expect(report.declaredMajors).toEqual(["Finance", "Economics"]);
    // A declared minor with no block of its own is still declared.
    expect(report.declaredMinors).toEqual(["Data Science", "Business Analytics"]);
    expect(report.program).toBe("Finance / Economics");
    expect(report.reportDate).toBe("2027-01-15");
    expect(report.lastEvaluated).toBe("2027-01-12");
  });

  it("makes one group per program block, in document order and classified", () => {
    expect(groups.map((g) => [g.name, g.kind])).toEqual([
      ["Finance Major Requirements", "major"],
      ["Economics Major Requirements", "major"],
      ["Data Science Minor Requirements", "minor"],
      ["Sample Honors Program Requirements", "other"],
    ]);
  });
});

describe("Workday table layout — rows", () => {
  const finance = group(/^Finance Major/);

  it("never lets wrapped course, period or page text leak into a requirement name", () => {
    for (const g of groups) {
      for (const r of g.requirements) {
        expect(r.name, r.name).not.toMatch(/\bQuarter\b/);
        expect(r.name, r.name).not.toMatch(/\b(?:Fall|Winter|Spring|Summer) \d{4}\b/);
        expect(r.name, r.name).not.toMatch(/^[A-Z]{2,5} \d+[A-Z]* - /);
        expect(r.name, r.name).not.toMatch(/Page \d+ of \d+/);
        expect(r.name.length).toBeGreaterThan(3);
      }
    }
  });

  it("reads a status word that shares a line with the name and the first course", () => {
    const ctw = row(finance, /CTW 1$/);
    expect(ctw.name).toBe("Core: LSB: CTW 1");
    expect(ctw.status).toBe("completed");
    expect(ctw.category).toBe("core");
    expect(ctw.courses).toHaveLength(1);
    expect(ctw.courses[0]).toMatchObject({
      code: "ENGL 1A",
      title: "Critical Thinking and Writing I",
      units: 4,
      grade: "B",
      period: "Fall 2025",
    });
  });

  it("reads an in-progress course whose '(In Progress)' wraps across lines", () => {
    const ci1 = row(finance, /C&I 1$/);
    expect(ci1.status).toBe("in_progress");
    expect(ci1.courses[0]).toMatchObject({
      code: "HIST 11A",
      title: "Cultures and Ideas I",
      units: 4,
      grade: null,
      inProgress: true,
    });
  });

  it("reads a course whose title starts on the next line (bare hyphen)", () => {
    const exp = row(finance, /Experiential Learning/);
    expect(exp.status).toBe("completed");
    expect(exp.courses[0]).toMatchObject({ code: "ENVS 131", title: "Environmental Education", grade: "A" });
  });

  it("keeps the Remaining column verbatim in all its shapes", () => {
    expect(row(finance, /C&I 2$/).remaining).toBe("Minimum 1 Course(s)");
    expect(row(finance, /2nd Language/).remaining).toBe("Minimum Combination Required");
    expect(row(finance, /Major GPA/).remaining).toBe("Minimum 2.000 GPA");
    expect(row(group(/^Data Science/), /Experiential/).remaining).toBe("Minimum Activities: 1");
    // A satisfied row has no Remaining text — none is invented.
    expect(row(finance, /CTW 1$/).remaining).toBeUndefined();
    // A wrapped name is joined into one name.
    expect(row(finance, /2nd Language/).name).toBe("Core: LSB: 2nd Language (Level 2)");
  });

  it("reads transfer-credit rows (no academic period) and flags them", () => {
    const total = row(finance, /Must complete 175 units/i);
    const transfer = total.courses.filter((c) => c.transfer);
    expect(transfer.map((c) => [c.code, c.units, c.grade])).toEqual([
      ["ACTG 11", 6, "CR"],
      ["TRCR 1", 4, "CR"],
    ]);
    expect(transfer.every((c) => c.period === undefined)).toBe(true);
  });

  it("marks a school's own Core rows as college, distinct from University Core", () => {
    const busn = row(finance, /Knowledge: BUSN 70$/);
    expect(busn.category).toBe("college");
    expect(busn.status).toBe("in_progress");
    expect(busn.courses[0]).toMatchObject({ code: "BUSN 70", inProgress: true });
  });

  it("does not mark ordinary program rows as core", () => {
    expect(row(finance, /FNCE 124/).category).toBeUndefined();
    expect(row(finance, /Major GPA/).category).toBeUndefined();
  });

  it("survives a page break in the middle of a block", () => {
    // Page 2 begins between two college Core rows; both must still be read whole.
    const acct = row(finance, /Accounting 11/);
    expect(acct.status).toBe("completed");
    expect(acct.courses[0]).toMatchObject({ code: "ACTG 11", transfer: true });
    expect(row(finance, /FNCE 121$/).courses[0]).toMatchObject({ code: "FNCE 121", grade: "B+" });
  });

  it("repeats the University rows inside each major block, as Workday does", () => {
    for (const g of [group(/^Finance/), group(/^Economics/)]) {
      expect(row(g, /minimum 2\.000\s+Cumulative GPA/i).status).toBe("completed");
      expect(row(g, /CTW 1$/).courses[0]?.code).toBe("ENGL 1A");
    }
  });

  it("keeps each school's own Core set: LSB rows in one block, CAS rows in the other, none in a minor", () => {
    const coreNames = (g: { requirements: { name: string; category?: string }[] }) =>
      g.requirements.filter((r) => r.category === "core").map((r) => r.name);
    expect(coreNames(group(/^Finance/)).every((n) => n.startsWith("Core: LSB: "))).toBe(true);
    expect(coreNames(group(/^Economics/)).every((n) => n.startsWith("Core: CAS: "))).toBe(true);
    expect(coreNames(group(/^Economics/))).toContain("Core: CAS: CTW 1");
    expect(coreNames(group(/^Data Science/))).toEqual([]);
  });
});

describe("Workday table layout — unit rows and summary", () => {
  it("reads 'a minimum 60 Upper Division Units' and the '175 units. Limit of 20 units 198/199' row", () => {
    const finance = group(/^Finance Major/);
    const upper = row(finance, /60 Upper/i);
    expect(upper).toMatchObject({
      unit: "upper_division",
      requiredUnits: 60,
      remaining: "Minimum 20 Unit(s)",
      status: "in_progress",
      scope: "university",
    });
    const total = row(finance, /175 units/i);
    expect(total).toMatchObject({ unit: "total", requiredUnits: 175, remaining: "Minimum 90.5 Unit(s)" });
    expect(total.name).toContain("Limit of 20 units 198/199");
  });

  it("lifts the summary from the report's own rows (never computed)", () => {
    expect(report.summary?.upperDivisionUnits).toMatchObject({
      requiredUnits: 60,
      detail: "Minimum 20 Unit(s)",
      status: "in_progress",
    });
    expect(report.summary?.totalUnits).toMatchObject({ requiredUnits: 175, detail: "Minimum 90.5 Unit(s)" });
    expect(report.summary?.upperDivisionUnits?.name).toBe(
      "University Requirement: Must complete a minimum 60 Upper Division Units",
    );
  });

  it("gives non-unit rows no unit fields", () => {
    const gpa = row(group(/^Finance Major/), /minimum 2\.000\s+Cumulative GPA/i);
    expect(gpa.unit).toBeUndefined();
    expect(gpa.requiredUnits).toBeUndefined();
  });
});

describe("Workday table layout — derived course lists", () => {
  const done = report.completedCourses.map((c) => c.code);
  const notDone = Object.fromEntries((report.nonCompletedCourses ?? []).map((c) => [c.code, c.status]));

  it("counts graded and transfer-credit catalog courses as completed", () => {
    for (const code of ["ENGL 1A", "MATH 11", "MATH 12", "FNCE 121", "ACTG 11", "ECON 1", "ECON 2"]) {
      expect(done, code).toContain(code);
    }
  });

  it("never counts an in-progress course as completed", () => {
    expect(done).not.toContain("HIST 11A");
    expect(done).not.toContain("BUSN 70");
    expect(notDone["HIST 11A"]).toBe("in_progress");
    expect(notDone["BUSN 70"]).toBe("in_progress");
  });

  it("lists each course once even though Workday repeats it across blocks", () => {
    expect(done.filter((c) => c === "ENGL 1A")).toHaveLength(1);
    expect(done.filter((c) => c === "MATH 11")).toHaveLength(1);
  });

  it("does not turn transfer placeholders, headings or GPA text into 'possible courses'", () => {
    const possible = report.possibleCourses.map((p) => p.raw);
    expect(possible).not.toContain("TRCR 1");
    for (const raw of possible) {
      expect(raw).not.toMatch(/^(GPA|PAGE|OF|CTW|C&I|LSB|UD)\b/);
    }
  });
});

describe("Workday table layout — planning projection", () => {
  it("strips grades and source lines but keeps structure, remaining text and period", () => {
    const planning = planningProjection(report) as typeof report;
    const finance = planning.groups!.find((g) => /^Finance/.test(g.name))!;
    const ctw = finance.requirements.find((r) => /CTW 1$/.test(r.name))!;
    expect(ctw.courses[0]).toMatchObject({ code: "ENGL 1A", grade: null, period: "Fall 2025" });
    expect(ctw.sourceText).toBeUndefined();
    const ci2 = finance.requirements.find((r) => /C&I 2$/.test(r.name))!;
    expect(ci2.remaining).toBe("Minimum 1 Course(s)");
    expect(JSON.stringify(planning)).not.toMatch(/"grade":"(?:A|B|C|CR)/);
  });
});

describe("Workday table layout — fallbacks", () => {
  it("leaves a simple (non-table) report on the line-based reader", () => {
    const simple = readFileSync(
      join(import.meta.dirname, "..", "__fixtures__", "progress-report", "workday-apr-hierarchical.txt"),
      "utf8",
    );
    expect(looksLikeWorkdayTable(simple)).toBe(false);
    const parsed = parseReportText(simple);
    expect(parsed.groups?.length).toBeGreaterThan(0);
    expect(parsed.declaredMajors).toBeUndefined();
  });

  it("does not claim the table layout for text that merely mentions the words", () => {
    expect(looksLikeWorkdayTable("Program of Study GPA 3.0\nno column header here")).toBe(false);
  });
});
