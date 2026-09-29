/**
 * The Degree Plan's requirements sidebar, exactly as it is.
 *
 * What the sidebar is benchmarked against (the current Bulletin, a cohort's
 * Bulletin, a department checksheet, the APR, or a combination) is a decision
 * the professor has not made. Until it is, nothing about the sidebar may
 * change. These snapshots are the sidebar's complete output for fixed
 * students, recorded BEFORE the source was put behind a provider; any change
 * to a label, an order, a course list or a source line fails here.
 *
 * To change the sidebar on purpose, change the snapshot in the same commit and
 * say why.
 */
import { describe, expect, it } from "vitest";
import type { StudentProfileRow } from "@workspace/db";
import { buildRequirementsResponse } from "./requirements";

function profile(overrides: Partial<StudentProfileRow>): StudentProfileRow {
  return {
    id: 1,
    userId: "golden-student",
    email: null,
    name: "Golden Student",
    studentId: null,
    studentType: "undergraduate",
    college: "School of Engineering",
    major: "CSE",
    secondMajor: null,
    minor: null,
    additionalMajors: [],
    additionalMinors: [],
    startTerm: "fall",
    startYear: 2024,
    expectedGradTerm: "spring",
    expectedGradYear: 2028,
    unitsCompletedAtScu: "0",
    unitsTransferredIn: "0",
    cumulativeGpa: null,
    majorGpa: null,
    completedCourseCodes: [],
    priorityRegistration: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as unknown as StudentProfileRow;
}

const GOAL = { id: "pre-health", name: "Pre-Health", notes: "Talk to the advisor", courseCodes: ["BIOL 1A"], placeholders: ["Clinical hours"] };

export const GOLDEN_CASES = {
  "engineering major, nothing completed": () => buildRequirementsResponse(profile({})),
  "business major with completed and planned courses": () =>
    buildRequirementsResponse(
      profile({ college: "Leavey School of Business", major: "FNCE", completedCourseCodes: ["ACTG 11", "MATH 11", "ENGL 1A"] }),
      [],
      [],
      [],
      ["FNCE 121", "MGMT 80"],
    ),
  "arts and sciences major with a declared minor": () =>
    buildRequirementsResponse(profile({ college: "College of Arts and Sciences", major: "BIOL", minor: "Anthropology" })),
  "a proposed second major and a proposed minor": () => buildRequirementsResponse(profile({}), ["ECEN"], ["Anthropology"]),
  "a plan-scoped primary major in another school": () =>
    buildRequirementsResponse(profile({ college: "College of Arts and Sciences", major: "BIOL" }), [], [], [], [], "FNCE"),
  "a professional preparation goal": () => buildRequirementsResponse(profile({}), [], [], [GOAL]),
} as const;

describe("the requirements sidebar is unchanged", () => {
  for (const [name, build] of Object.entries(GOLDEN_CASES)) {
    it(name, () => {
      expect(build()).toMatchSnapshot();
    });
  }

  it("is the same every time it is built", () => {
    for (const build of Object.values(GOLDEN_CASES)) expect(build()).toEqual(build());
  });
});
