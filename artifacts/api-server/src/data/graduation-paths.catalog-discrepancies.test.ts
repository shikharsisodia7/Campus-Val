/**
 * Regression coverage for the 4 major-catalog discrepancies flagged in
 * docs/SCU_PROGRAM_CATALOG.md and resolved after direct verification against
 * the live SCU Bulletin (Chemistry & Biochemistry; Applied Mathematics;
 * Modern Languages and Literatures; Theatre and Dance):
 *
 *  - AMTH, DANC, CHIN, and JAPN are not standalone SCU undergraduate
 *    majors — AMTH is a Mathematics emphasis, DANC is a Theatre Arts
 *    emphasis, CHIN/JAPN are minors only. They must never appear as
 *    selectable majors (spec: "Fabricated curriculum: ZERO").
 *  - "Chinese and Sinophone Studies" (CHIN-MIN) was missing from the minor
 *    catalog entirely and has been added.
 *  - CHEM's upperDiv sequence referenced CHEM 113 and CHEM 124, which do not
 *    exist in the current SCU Bulletin — replaced with the real B.S.
 *    Chemistry core.
 */
import { describe, it, expect } from "vitest";
import { getAvailableMajors, getAvailableMinors, getMajorRequirements } from "./graduation-paths";
import { findCourse } from "./courses";

const RETIRED_FAKE_MAJOR_CODES = ["AMTH", "DANC", "CHIN", "JAPN"];

describe("major-catalog discrepancies (AMTH/DANC/CHIN/JAPN)", () => {
  it("never offers AMTH, DANC, CHIN, or JAPN as a selectable major", () => {
    const majors = getAvailableMajors();
    for (const code of RETIRED_FAKE_MAJOR_CODES) {
      expect(
        majors.find((m) => m.code === code),
        `${code} is not a real standalone SCU major and must not be selectable`,
      ).toBeUndefined();
    }
  });

  it("still represents the real underlying programs via MATH/THTR concentrations and CHIN-MIN/JAPN-MIN minors", () => {
    const math = getMajorRequirements("MATH", [], findCourse);
    expect(math?.concentrations.some((c) => /Applied Mathematics/i.test(c.title))).toBe(true);

    const thtr = getMajorRequirements("THTR", [], findCourse);
    expect(thtr?.concentrations.some((c) => /Dance/i.test(c.title))).toBe(true);

    const minors = getAvailableMinors();
    expect(minors.find((m) => m.code === "CHIN-MIN")).toBeTruthy();
    expect(minors.find((m) => m.code === "JAPN-MIN")).toBeTruthy();
  });
});

describe("CHEM major no longer references retired course codes", () => {
  it("does not reference CHEM 113 or CHEM 124, and every listed course exists in the real catalog", () => {
    const chem = getMajorRequirements("CHEM", [], findCourse);
    expect(chem).toBeTruthy();
    const allCodes = chem!.groups.flatMap((g) => g.courses.map((c) => c.code));
    expect(allCodes).not.toContain("CHEM 113");
    expect(allCodes).not.toContain("CHEM 124");
    // These are real courses now present in the catalog, so they must
    // actually show up in the resolved groups (not silently dropped as
    // "missing from catalog").
    for (const code of ["CHEM 102", "CHEM 111", "CHEM 141", "CHEM 151", "CHEM 152", "CHEM 154"]) {
      expect(allCodes, `${code} should resolve in CHEM's requirements`).toContain(code);
    }
    expect(chem!.notes.join(" ")).not.toMatch(/CHEM 113|CHEM 124/);
  });

  it("PHYS's MATH 22 requirement resolves in the real catalog (was missing)", () => {
    const phys = getMajorRequirements("PHYS", [], findCourse);
    const allCodes = phys!.groups.flatMap((g) => g.courses.map((c) => c.code));
    expect(allCodes).toContain("MATH 22");
    expect(phys!.notes.join(" ")).not.toMatch(/MATH 22/);
  });
});
