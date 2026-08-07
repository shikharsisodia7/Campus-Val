import { describe, it, expect } from "vitest";
import { parseProgressReportText } from "./progress-report-parser";

describe("parseProgressReportText", () => {
  it("extracts course code, units, and grade from tabular rows", () => {
    const text = [
      "Academic Progress Report",
      "CSCI 61  Data Structures  4.0  A-",
      "MATH 13  Calculus III  4.0  B+",
      "ENGL 1A  Critical Thinking & Writing  4.0  P",
    ].join("\n");
    const { courses } = parseProgressReportText(text);
    expect(courses).toHaveLength(3);
    const csci = courses.find((c) => c.code === "CSCI 61")!;
    expect(csci.units).toBe(4);
    expect(csci.grade).toBe("A-");
    expect(csci.title).toBe("Data Structures");
  });

  it("leaves units and grade null when not clearly present", () => {
    const text = "CSEN 79 Object-Oriented Programming";
    const { courses, notes } = parseProgressReportText(text);
    expect(courses[0]).toMatchObject({
      code: "CSEN 79",
      units: null,
      grade: null,
    });
    expect(notes.some((n) => n.includes("unit value"))).toBe(true);
    expect(notes.some((n) => n.includes("grade"))).toBe(true);
  });

  it("does not treat GPA/AP/term tokens as courses", () => {
    const text = ["GPA 3.75", "AP 5 Calculus BC", "FALL 2026", "PAGE 2"].join(
      "\n",
    );
    const { courses, notes } = parseProgressReportText(text);
    expect(courses).toHaveLength(0);
    expect(notes[0]).toContain("No course rows");
  });

  it("handles letter-suffixed course numbers and dedupes repeats", () => {
    const text = ["CHEM 12L  General Chemistry Lab  1.0  A", "CHEM 12L"].join(
      "\n",
    );
    const { courses } = parseProgressReportText(text);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ code: "CHEM 12L", units: 1, grade: "A" });
  });

  it("returns an honest empty extraction for unreadable text", () => {
    const { courses, notes } = parseProgressReportText("");
    expect(courses).toHaveLength(0);
    expect(notes.length).toBeGreaterThan(0);
  });
});
