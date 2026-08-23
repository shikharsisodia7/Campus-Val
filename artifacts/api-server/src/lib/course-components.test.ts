import { describe, it, expect } from "vitest";
import {
  classifySection,
  groupSectionsByComponent,
  missingComponentsFor,
  requiredComponentsFor,
} from "./course-components";
import { OFFERED_SECTIONS } from "../data/offered-sections";

const fallSectionsFor = (code: string) =>
  OFFERED_SECTIONS.filter((s) => s.courseCode === code && s.term === "fall");

describe("requiredComponentsFor", () => {
  it("reads a lab requirement out of the real CHEM 11 bulletin text", () => {
    const req = requiredComponentsFor("CHEM 11");
    expect(req.lab).toBe(true);
    expect(req.evidence.join(" ")).toMatch(/Laboratory 3 hours per week/i);
  });

  it("reads a recitation requirement out of the real CHEM 11 bulletin text", () => {
    expect(requiredComponentsFor("CHEM 11").recitation).toBe(true);
  });

  it("detects the lab on CHEM 12 as well (not special-cased to CHEM 11)", () => {
    expect(requiredComponentsFor("CHEM 12").lab).toBe(true);
  });

  it("does not invent a lab for a lecture-only course", () => {
    const req = requiredComponentsFor("MATH 11");
    expect(req.lab).toBe(false);
    expect(req.evidence).toEqual([]);
  });

  it("does not invent components for an unknown course code", () => {
    const req = requiredComponentsFor("ZZZZ 999");
    expect(req.lab).toBe(false);
    expect(req.recitation).toBe(false);
  });
});

describe("classifySection", () => {
  it("classifies a real CHEM 11 MWF 65-minute block as a lecture", () => {
    expect(
      classifySection({
        courseCode: "CHEM 11",
        meetingDays: ["M", "W", "F"],
        startTime: "08:00",
        endTime: "09:05",
      }).componentType,
    ).toBe("lecture");
  });

  it("classifies a real CHEM 11 single 170-minute block as a lab", () => {
    expect(
      classifySection({
        courseCode: "CHEM 11",
        meetingDays: ["M"],
        startTime: "14:15",
        endTime: "17:05",
      }).componentType,
    ).toBe("lab");
  });

  it("classifies a TR 100-minute CHEM 11 block as a lecture", () => {
    expect(
      classifySection({
        courseCode: "CHEM 11",
        meetingDays: ["T", "R"],
        startTime: "08:30",
        endTime: "10:10",
      }).componentType,
    ).toBe("lecture");
  });

  it("never reports a classification as authoritative", () => {
    expect(
      classifySection({
        courseCode: "CHEM 11",
        meetingDays: ["M"],
        startTime: "14:15",
        endTime: "17:05",
      }).inferred,
    ).toBe(true);
  });

  it("returns unknown when the Registrar row has no days or times", () => {
    expect(
      classifySection({
        courseCode: "CHEM 11",
        meetingDays: [],
        startTime: "",
        endTime: "",
      }).componentType,
    ).toBe("unknown");
  });

  it("does not call a long single block a lab when the bulletin has no lab", () => {
    // MILS-style leadership blocks and seminars meet in one long block but
    // the bulletin does not describe a separate laboratory component.
    const result = classifySection({
      courseCode: "MATH 11",
      meetingDays: ["W"],
      startTime: "14:15",
      endTime: "17:05",
    });
    expect(result.componentType).not.toBe("lab");
  });
});

describe("groupSectionsByComponent on real Fall 2026 data", () => {
  it("splits real CHEM 11 sections into both lecture and lab groups", () => {
    const groups = groupSectionsByComponent(fallSectionsFor("CHEM 11"));
    const kinds = groups.map((g) => g.componentType);
    expect(kinds).toContain("lecture");
    expect(kinds).toContain("lab");
  });

  it("puts lectures before labs so the student schedules instruction first", () => {
    const kinds = groupSectionsByComponent(fallSectionsFor("CHEM 11")).map(
      (g) => g.componentType,
    );
    expect(kinds.indexOf("lecture")).toBeLessThan(kinds.indexOf("lab"));
  });

  it("accounts for every section exactly once", () => {
    const sections = fallSectionsFor("CHEM 11");
    const grouped = groupSectionsByComponent(sections).flatMap((g) => g.sections);
    expect(grouped).toHaveLength(sections.length);
  });
});

describe("missingComponentsFor", () => {
  it("still reports the lab missing after only a CHEM 11 lecture is added", () => {
    expect(missingComponentsFor("CHEM 11", ["lecture"])).toContain("lab");
  });

  it("reports nothing missing once lecture, lab and recitation are scheduled", () => {
    expect(
      missingComponentsFor("CHEM 11", ["lecture", "lab", "recitation"]),
    ).toEqual([]);
  });

  it("reports the lecture missing when only a lab was added", () => {
    expect(missingComponentsFor("CHEM 11", ["lab"])).toContain("lecture");
  });

  it("treats a single-component course as complete after one lecture", () => {
    expect(missingComponentsFor("MATH 11", ["lecture"])).toEqual([]);
  });

  it("stays silent rather than nagging when a selection is unclassified", () => {
    expect(missingComponentsFor("CHEM 11", ["unknown"])).toEqual([]);
  });
});
