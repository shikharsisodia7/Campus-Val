import { describe, it, expect } from "vitest";
import { searchCourses, matchesAttributes } from "./course-search";
import type { CourseEntry } from "../data/courses";

function course(
  code: string,
  title: string,
  coreAreas: string[] = [],
): CourseEntry {
  return {
    code,
    title,
    department: code.split(" ")[0]!,
    units: 4,
    description: `${title} description`,
    coreAreas,
    offeredTerms: [],
    prereqLogic: "",
    prereqGroups: [],
    corequisites: [],
  };
}

const CATALOG: CourseEntry[] = [
  course("CHEM 11", "General Chemistry I", ["Natural Science"]),
  course("CHEM 12", "General Chemistry II", ["Natural Science"]),
  course("MATH 11", "Calculus and Analytic Geometry I", ["Mathematics"]),
  course("PHIL 26", "Ethics in Business", ["Ethics"]),
  course("TESP 46", "Faith, Justice and Poverty", [
    "Religion, Theology & Culture",
  ]),
  course("ENGL 106", "Beauty and Ethics of Writing", ["Ethics", "Arts"]),
];

describe("matchesAttributes", () => {
  it("matches ALL (intersection)", () => {
    expect(matchesAttributes(["Ethics", "Arts"], ["Ethics", "Arts"], "all")).toBe(true);
    expect(matchesAttributes(["Ethics"], ["Ethics", "Arts"], "all")).toBe(false);
  });
  it("matches ANY (union)", () => {
    expect(matchesAttributes(["Ethics"], ["Ethics", "Arts"], "any")).toBe(true);
    expect(matchesAttributes(["Mathematics"], ["Ethics", "Arts"], "any")).toBe(false);
  });
  it("is case/whitespace insensitive", () => {
    expect(matchesAttributes(["ethics"], ["Ethics"], "all")).toBe(true);
  });
});

describe("searchCourses", () => {
  it("finds by exact course code", () => {
    const r = searchCourses(CATALOG, { q: "CHEM 11" });
    expect(r.state).toBe("results");
    expect(r.courses[0]!.code).toBe("CHEM 11");
  });

  it("finds by partial code (department)", () => {
    const r = searchCourses(CATALOG, { q: "CHEM" });
    expect(r.courses.map((c) => c.code)).toEqual(["CHEM 11", "CHEM 12"]);
  });

  it("finds by code without space", () => {
    const r = searchCourses(CATALOG, { q: "chem11" });
    expect(r.courses[0]!.code).toBe("CHEM 11");
  });

  it("finds by title", () => {
    const r = searchCourses(CATALOG, { q: "calculus" });
    expect(r.courses[0]!.code).toBe("MATH 11");
  });

  it("filters by a single Core area including Religion", () => {
    const r = searchCourses(CATALOG, {
      coreAreas: ["Religion, Theology & Culture"],
    });
    expect(r.courses.map((c) => c.code)).toEqual(["TESP 46"]);
  });

  it("intersects multiple attributes with matchMode=all", () => {
    const r = searchCourses(CATALOG, {
      coreAreas: ["Ethics", "Arts"],
      matchMode: "all",
    });
    expect(r.courses.map((c) => c.code)).toEqual(["ENGL 106"]);
  });

  it("unions multiple attributes with matchMode=any", () => {
    const r = searchCourses(CATALOG, {
      coreAreas: ["Ethics", "Arts"],
      matchMode: "any",
    });
    expect(r.courses.map((c) => c.code).sort()).toEqual([
      "ENGL 106",
      "PHIL 26",
    ]);
  });

  it("returns no_matching_courses when nothing matches criteria", () => {
    const r = searchCourses(CATALOG, { q: "underwater basket weaving" });
    expect(r.state).toBe("no_matching_courses");
    expect(r.totalMatching).toBe(0);
    expect(r.courses).toEqual([]);
  });

  it("returns no_sections_this_quarter when matches exist but none offered", () => {
    const counts = new Map<string, number>([["MATH 11", 3]]);
    const r = searchCourses(CATALOG, { q: "CHEM", sectionCounts: counts });
    expect(r.state).toBe("no_sections_this_quarter");
    expect(r.totalMatching).toBe(2);
    expect(r.courses.length).toBe(2);
    expect(r.courses.every((c) => c.sectionsThisQuarter === 0)).toBe(true);
  });

  it("returns section counts when a quarter filter is applied", () => {
    const counts = new Map<string, number>([["CHEM 11", 5]]);
    const r = searchCourses(CATALOG, { q: "CHEM 11", sectionCounts: counts });
    expect(r.state).toBe("results");
    expect(r.courses[0]!.sectionsThisQuarter).toBe(5);
  });

  it("returns null section counts without a quarter filter", () => {
    const r = searchCourses(CATALOG, { q: "CHEM 11" });
    expect(r.courses[0]!.sectionsThisQuarter).toBeNull();
  });
});
