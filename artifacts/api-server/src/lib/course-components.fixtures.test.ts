/**
 * Deterministic section fixtures for lecture/lab classification.
 *
 * The professor's report: CHEM 11 offered lecture + lab correctly, but every
 * BIOL 1B section was labelled a lecture and PHYS 11's labs were not offered as
 * labs. These fixtures reproduce the three shapes (and a future term) with
 * fixed, synthetic meeting times, and FAIL if the classifier goes back to
 * calling every Biology or Physics section a lecture.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyCourseSections,
  classifySection,
  courseComponentPlan,
  courseScheduleStatus,
  normalizeComponentLabel,
  requiredComponentsFor,
  type SectionLike,
} from "./course-components";
import { auditCourseComponents, summarizeAudit } from "./component-data-audit";
import { OFFERED_SECTIONS } from "../data/offered-sections";
import { extractComponent, parseWorkdaySections } from "./workday-parser";

type Fx = SectionLike & { sectionNumber: string };
const sec = (courseCode: string, sectionNumber: string, days: string, startTime: string, endTime: string, component?: string): Fx => ({
  courseCode,
  sectionNumber,
  meetingDays: days.split(""),
  startTime,
  endTime,
  ...(component ? { component } : {}),
});

// CHEM: MWF/TR lectures, 170-minute weekly labs.
const CHEM: Fx[] = [
  sec("CHEM 11", "1", "MWF", "08:00", "09:05"),
  sec("CHEM 11", "2", "TR", "10:20", "12:00"),
  sec("CHEM 11", "13", "M", "14:15", "17:05"),
  sec("CHEM 11", "14", "T", "14:15", "17:05"),
];
// BIOL: TR lectures, NINETY-minute weekly labs (shorter than the lecture block).
const BIOL: Fx[] = [
  sec("BIOL 1B", "1", "TR", "08:30", "10:10"),
  sec("BIOL 1B", "2", "TR", "10:20", "12:00"),
  sec("BIOL 1B", "3", "T", "13:00", "14:30"),
  sec("BIOL 1B", "4", "W", "13:00", "14:30"),
  sec("BIOL 1B", "5", "R", "15:00", "16:30"),
];
// PHYS: MWF lectures mixed with 165-minute weekly labs.
const PHYS: Fx[] = [
  sec("PHYS 11", "1", "MWF", "09:15", "10:20"),
  sec("PHYS 11", "2", "MWF", "10:30", "11:35"),
  sec("PHYS 11", "3", "M", "14:15", "17:00"),
  sec("PHYS 11", "4", "T", "14:15", "17:00"),
];
// A FUTURE term whose source states the instructional format.
const WINTER_PUBLISHED: Fx[] = [
  sec("PHYS 12", "1", "MWF", "08:00", "09:05", "Lecture"),
  sec("PHYS 12", "L1", "T", "14:15", "17:00", "Laboratory"),
  sec("PHYS 12", "L2", "R", "14:15", "17:00", "Laboratory"),
  sec("PHYS 12", "D1", "F", "12:00", "12:50", "Discussion"),
];
// A future term as the Registrar's TENTATIVE schedule lists it: lectures only.
const SPRING_TENTATIVE: Fx[] = [sec("BIOL 1B", "1", "TR", "08:30", "10:10"), sec("BIOL 1B", "2", "TR", "10:20", "12:00")];

const types = (sections: Fx[]) =>
  Object.fromEntries([...classifyCourseSections(sections)].map(([n, c]) => [n, c.componentType]));

describe("the same rule classifies Chemistry, Biology and Physics", () => {
  it("CHEM 11: lectures and labs", () => {
    expect(types(CHEM)).toEqual({ "1": "lecture", "2": "lecture", "13": "lab", "14": "lab" });
  });

  it("BIOL 1B: the 90-minute weekly sections are LABS, not lectures", () => {
    expect(types(BIOL)).toEqual({ "1": "lecture", "2": "lecture", "3": "lab", "4": "lab", "5": "lab" });
  });

  it("PHYS 11: the weekly blocks mixed in with the lectures are LABS", () => {
    expect(types(PHYS)).toEqual({ "1": "lecture", "2": "lecture", "3": "lab", "4": "lab" });
  });

  it("every one of these courses needs lecture + lab, from published text", () => {
    for (const [code, sections] of [["CHEM 11", CHEM], ["BIOL 1B", BIOL], ["PHYS 11", PHYS]] as const) {
      const plan = courseComponentPlan(code, sections);
      expect(plan.multiComponent, code).toBe(true);
      expect(plan.components.map((c) => [c.componentType, c.sectionsPublished]), code).toEqual([
        ["lecture", true],
        ["lab", true],
      ]);
      expect(plan.components[1]!.evidence.length, code).toBeGreaterThan(0);
    }
  });

  it("marks what it derived as inferred, never as a published field", () => {
    for (const c of classifyCourseSections(BIOL).values()) {
      expect(c).toMatchObject({ inferred: true, source: "meeting_pattern", sourceLabel: null });
    }
  });

  it("does not decide from section numbers: renumbering changes nothing", () => {
    const renumbered = BIOL.map((s, i) => ({ ...s, sectionNumber: String(90 - i) }));
    expect(Object.values(types(renumbered)).sort()).toEqual(Object.values(types(BIOL)).sort());
    const labsFirst = [...BIOL].reverse();
    expect(types(labsFirst)).toEqual(types(BIOL));
  });
});

describe("the classifier has no course- or department-specific rule", () => {
  const source = readFileSync(join(import.meta.dirname, "course-components.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

  it("names no department or course code in its logic", () => {
    expect(code).not.toMatch(/\b(CHEM|BIOL|BIO|PHYS|ENVS|CSCI|CSEN|MATH)\b/);
    expect(code).not.toMatch(/department\s*===|startsWith\(\s*["'][A-Z]{2,5}/);
    expect(code).not.toMatch(/sectionNumber\s*[<>]=?\s*\d|Number\(\s*\w*\.?sectionNumber/);
  });
});

describe("a source that states the instructional format", () => {
  it("is believed over the meeting pattern, and supports more than two components", () => {
    const classified = classifyCourseSections(WINTER_PUBLISHED);
    expect(types(WINTER_PUBLISHED)).toEqual({ "1": "lecture", L1: "lab", L2: "lab", D1: "discussion" });
    expect(classified.get("L1")).toEqual({
      componentType: "lab",
      inferred: false,
      source: "published",
      sourceLabel: "Laboratory",
    });
    const plan = courseComponentPlan("PHYS 12", WINTER_PUBLISHED);
    expect(plan.components.map((c) => c.componentType)).toEqual(["lecture", "lab", "discussion"]);
  });

  it("normalizes labels without mistaking other text for one", () => {
    expect(normalizeComponentLabel("Laboratory")).toBe("lab");
    expect(normalizeComponentLabel(" LAB ")).toBe("lab");
    expect(normalizeComponentLabel("Lecture")).toBe("lecture");
    expect(normalizeComponentLabel("Discussion")).toBe("discussion");
    expect(normalizeComponentLabel("Recitation")).toBe("recitation");
    expect(normalizeComponentLabel("Physics Lab 204")).toBeNull();
    expect(normalizeComponentLabel("")).toBeNull();
    expect(normalizeComponentLabel(null)).toBeNull();
  });

  it("the Workday paste parser keeps the instructional format it is given", () => {
    expect(extractComponent("PHYS 12-L1\tLaboratory\tT | 2:15 PM - 5:00 PM\tDaly Science 204")).toBe("Laboratory");
    expect(extractComponent("PHYS 12-01\tMWF | 8:00 AM - 9:05 AM\tPhysics Lab 204")).toBeNull();
    const parsed = parseWorkdaySections(
      ["PHYS 12-01\tLecture\tMWF | 8:00 AM - 9:05 AM\t12/35", "PHYS 12-L1\tLaboratory\tT | 2:15 PM - 5:00 PM\t0/18"].join("\n"),
    ).parsed;
    expect(parsed.map((p) => [p.sectionNumber, p.component])).toEqual([
      ["01", "Lecture"],
      ["L1", "Laboratory"],
    ]);
  });
});

describe("a future term that lists lectures only", () => {
  it("says the lab is required but not yet published — and invents nothing", () => {
    const plan = courseComponentPlan("BIOL 1B", SPRING_TENTATIVE);
    expect(plan.components.map((c) => [c.componentType, c.sectionCount, c.sectionsPublished])).toEqual([
      ["lecture", 2, true],
      ["lab", 0, false],
    ]);
    expect(types(SPRING_TENTATIVE)).toEqual({ "1": "lecture", "2": "lecture" });
  });

  it("a chosen lecture is not reported as a complete course where a lab can be chosen", () => {
    expect(courseScheduleStatus("BIOL 1B", BIOL, ["lecture"])).toMatchObject({
      scheduled: ["lecture"],
      missing: ["lab"],
      notYetPublished: [],
      complete: false,
    });
    expect(courseScheduleStatus("BIOL 1B", BIOL, ["lecture", "lab"])).toMatchObject({ missing: [], complete: true });
    expect(courseScheduleStatus("BIOL 1B", BIOL, ["lab"])).toMatchObject({ missing: ["lecture"], complete: false });
  });

  it("where the lab is not published yet, the lecture is all that can be scheduled — and the gap is named", () => {
    expect(courseScheduleStatus("BIOL 1B", SPRING_TENTATIVE, ["lecture"])).toEqual({
      courseCode: "BIOL 1B",
      scheduled: ["lecture"],
      missing: [],
      notYetPublished: ["lab"],
      complete: true,
    });
  });
});

describe("honest limits", () => {
  it("does not invent a lab for a lecture-only course", () => {
    const sections = [sec("MATH 11", "1", "MWF", "08:00", "09:05"), sec("MATH 11", "2", "TR", "10:20", "12:00")];
    expect(requiredComponentsFor("MATH 11").lab).toBe(false);
    expect(courseComponentPlan("MATH 11", sections).multiComponent).toBe(false);
    expect(Object.values(types(sections))).toEqual(["lecture", "lecture"]);
  });

  it("a once-a-week section in a course with no published lab is 'unknown', not a lab and not a lecture", () => {
    const sections = [sec("MATH 9S", "1", "MWF", "08:00", "09:05"), sec("MATH 9S", "7", "T", "17:00", "18:40")];
    expect(types(sections)).toEqual({ "1": "lecture", "7": "unknown" });
  });

  it("a section with no published time cannot be classified", () => {
    expect(classifySection(sec("BIOL 1B", "9", "", "", ""), BIOL).componentType).toBe("unknown");
  });

  it("reads the bulletin despite PDF extraction artifacts inside words", () => {
    // PHYS 11's stored description reads "Inclu des weekly laboratory."
    expect(requiredComponentsFor("PHYS 11").lab).toBe(true);
    expect(requiredComponentsFor("PHYS 12").lab).toBe(true);
    expect(requiredComponentsFor("PHYS 13").lab).toBe(true);
  });
});

describe("the bundled Registrar data", () => {
  const real = (code: string, term: string) =>
    OFFERED_SECTIONS.filter((s) => s.courseCode === code && s.term === term);
  const tally = (code: string, term: string) => {
    const out: Record<string, number> = {};
    for (const c of classifyCourseSections(real(code, term)).values()) out[c.componentType] = (out[c.componentType] ?? 0) + 1;
    return out;
  };

  it("Fall 2026: Biology and Physics labs are labs", () => {
    expect(tally("BIOL 1B", "fall")).toEqual({ lecture: 2, lab: 10 });
    expect(tally("BIOL 1C", "fall")).toEqual({ lecture: 2, lab: 6 });
    expect(tally("PHYS 11", "fall")).toEqual({ lecture: 2, lab: 5 });
    expect(tally("PHYS 32", "fall")).toEqual({ lecture: 3, lab: 7 });
    expect(tally("PHYS 33", "fall")).toEqual({ lecture: 4, lab: 13 });
    expect(tally("CHEM 11", "fall")).toEqual({ lecture: 12, lab: 25 });
  });

  it("Winter/Spring 2027 tentative schedules list lectures only, and the plan says so", () => {
    for (const [code, term] of [["CHEM 11", "winter"], ["PHYS 12", "winter"], ["PHYS 13", "spring"], ["BIOL 1B", "spring"]] as const) {
      expect(tally(code, term).lab, `${code} ${term}`).toBeUndefined();
      const lab = courseComponentPlan(code, real(code, term)).components.find((c) => c.componentType === "lab");
      expect(lab, `${code} ${term}`).toMatchObject({ required: true, sectionsPublished: false, sectionCount: 0 });
    }
  });

  it("the audit finds no course whose lab sections all collapsed into one component", () => {
    const summary = summarizeAudit(auditCourseComponents());
    expect(summary.all_sections_one_component).toBe(0);
    expect(summary.conflicting_published_label).toBe(0);
    expect(summary.lab_required_none_listed).toBeGreaterThan(0); // the tentative terms
  });

  it("the audit catches the regression it exists for", () => {
    // If every section were (wrongly) published as a lecture, the audit says so.
    const broken = BIOL.map((s) => ({ ...s, term: "fall", year: 2026, component: "Lecture" }));
    const findings = auditCourseComponents(broken);
    expect(findings.map((f) => f.code)).toContain("all_sections_one_component");
  });
});
