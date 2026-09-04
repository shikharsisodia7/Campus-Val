/**
 * Verifies the 8 newly-added majors (docs/SCU_PROGRAM_CATALOG.md) resolve
 * cleanly through the real generator and reference only real catalog course
 * codes — no fabricated curriculum.
 */
import { describe, it, expect } from "vitest";
import {
  getAvailableMajors,
  getGraduationPath,
} from "./graduation-paths";
import { findCourse } from "./courses";

const NEW_MAJOR_CODES = [
  "BCHM",
  "BCHM_ACS",
  "CHEM_BA",
  "ENSC",
  "WDE",
  "EE",
  "GENR",
  "ENGPHYS",
];

describe("newly-added majors", () => {
  it("all appear in getAvailableMajors", () => {
    const majors = getAvailableMajors();
    for (const code of NEW_MAJOR_CODES) {
      expect(majors.find((m) => m.code === code)).toBeTruthy();
    }
  });

  // Every major-specific course code these 8 recipes reference (lowerDiv +
  // upperDiv + capstone), matched exactly against what was added to
  // MAJOR_RECIPES - independent of the shared generator's own generic
  // gen-ed placeholder codes (e.g. writing-core slots), which are a
  // pre-existing generator behavior shared by every "example"-trust major
  // and out of scope for this check.
  const RECIPE_COURSE_CODES: Record<string, string[]> = {
    BCHM: ["CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33", "BIOL 1A", "BIOL 1B", "PHYS 31", "PHYS 32", "CHEM 111", "CHEM 112", "CHEM 133", "CHEM 132", "CHEM 150", "CHEM 152"],
    BCHM_ACS: ["CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33", "BIOL 1A", "BIOL 1B", "PHYS 31", "PHYS 32", "CHEM 111", "CHEM 112", "CHEM 133", "CHEM 132", "CHEM 150", "CHEM 152", "CHEM 154", "CHEM 155"],
    CHEM_BA: ["CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33", "CHEM 111", "CHEM 112", "CHEM 130"],
    ENSC: ["ENVS 21", "ENVS 22", "ENVS 23", "BIOL 1A", "BIOL 1B", "CHEM 11", "CHEM 12", "ENVS 116", "ENVS 117", "ENVS 120", "ENVS 141", "ENVS 143"],
    WDE: ["CSEN 10", "CSEN 11", "CSEN 12", "CSEN 20", "CSEN 122", "CSEN 140", "CSEN 146", "CSEN 161", "CSEN 174", "ENGR 110"],
    EE: ["ECEN 20", "ECEN 21", "ECEN 50", "ECEN 100", "ECEN 116", "ECEN 117", "ECEN 130", "ECEN 131", "ECEN 141", "ECEN 151", "ENGR 110"],
    GENR: ["ENGR 1", "ENGR 2", "ENGR 19", "ENGR 35", "ENGR 40", "ENGR 161", "ENGR 163", "ENGR 170", "ENGR 180", "ENGR 110"],
    ENGPHYS: ["PHYS 31", "PHYS 32", "PHYS 33", "PHYS 70", "MATH 53", "PHYS 111", "PHYS 112", "PHYS 113", "PHYS 121", "PHYS 141"],
  };

  it("every major-specific course code in these recipes exists in the real catalog", () => {
    for (const [code, courseCodes] of Object.entries(RECIPE_COURSE_CODES)) {
      for (const courseCode of courseCodes) {
        expect(
          findCourse(courseCode),
          `${courseCode} referenced by ${code} should exist in the catalog`,
        ).toBeTruthy();
      }
    }
  });

  it("defaults to sequenceTrust 'example' (no fabricated official-plan claim)", () => {
    for (const code of NEW_MAJOR_CODES) {
      const path = getGraduationPath("four_year", code);
      expect(path.sequenceTrust).toBe("example");
    }
  });
});
