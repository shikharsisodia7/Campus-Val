/**
 * "Set / Change Primary Major" (professor follow-up video 2).
 *
 * A plan-scoped PRIMARY major REPLACES the profile's onboarding major as the
 * primary program the requirements are built for. It is planning intent only:
 * it never changes the profile or the Workday APR (the response still reports
 * `declaredMajor` = the profile major). When the new primary belongs to a
 * different school/college, that college's own Core/college requirements load.
 *
 * These are pure-function tests over buildRequirementsResponse — the same
 * resolver GET /requirements and the placeholder-eligibility check both use.
 */
import { describe, it, expect } from "vitest";
import type { StudentProfileRow } from "@workspace/db";
import { buildRequirementsResponse } from "./requirements";

function makeProfile(
  overrides: Partial<StudentProfileRow> = {},
): StudentProfileRow {
  return {
    id: 1,
    userId: "test-user",
    email: null,
    name: "Test Student",
    studentId: null,
    studentType: "undergraduate",
    college: "College of Arts and Sciences",
    major: "BIOL",
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as StudentProfileRow;
}

const majorGroups = (r: ReturnType<typeof buildRequirementsResponse>) =>
  r.groups.filter((g) => g.kind === "major");
const primaryGroup = (r: ReturnType<typeof buildRequirementsResponse>) =>
  majorGroups(r)[0];

describe("buildRequirementsResponse — plan-scoped primary major override", () => {
  it("replaces the primary major and reports the new major (BIOL → CHEM), keeping the APR record in declaredMajor", () => {
    const profile = makeProfile({ major: "BIOL" });
    const result = buildRequirementsResponse(profile, [], [], [], [], "CHEM");

    expect(result.major).toBe("CHEM");
    // The profile / Workday APR record is preserved untouched.
    expect(result.declaredMajor).toBe("BIOL");
    // Exactly one major group (the old primary is replaced, not appended).
    expect(majorGroups(result)).toHaveLength(1);
    // The primary group is Chemistry, never marked "(proposed)".
    expect(primaryGroup(result).title.toLowerCase()).toContain("chemistry");
    expect(primaryGroup(result).title).not.toContain("(proposed)");
    expect(primaryGroup(result).title.toLowerCase()).not.toContain("biology");
  });

  it("adds a truthful planning-only note on the primary group when the primary differs from the profile", () => {
    const result = buildRequirementsResponse(
      makeProfile({ major: "BIOL" }),
      [],
      [],
      [],
      [],
      "CHEM",
    );
    expect(
      primaryGroup(result).notes.some((n) => n.includes("Planning major")),
    ).toBe(true);
    // Never claims CampusVal changed the official record.
    expect(
      primaryGroup(result).notes.some((n) =>
        /Workday APR are unchanged|official SCU declaration/i.test(n),
      ),
    ).toBe(true);
  });

  it("reports the profile major unchanged and adds no planning note when there is no override", () => {
    const result = buildRequirementsResponse(makeProfile({ major: "BIOL" }));
    expect(result.major).toBe("BIOL");
    expect(result.declaredMajor).toBe("BIOL");
    expect(
      primaryGroup(result).notes.some((n) => n.includes("Planning major")),
    ).toBe(false);
  });

  it("treats an override equal to the profile major as unchanged (no planning note)", () => {
    const result = buildRequirementsResponse(
      makeProfile({ major: "BIOL" }),
      [],
      [],
      [],
      [],
      "BIOL",
    );
    expect(result.major).toBe("BIOL");
    expect(
      primaryGroup(result).notes.some((n) => n.includes("Planning major")),
    ).toBe(false);
  });

  it("loads the new college's requirements when the primary major is in a different school (CAS BIOL → LSB FNCE)", () => {
    const profile = makeProfile({
      major: "BIOL",
      college: "College of Arts and Sciences",
    });
    const result = buildRequirementsResponse(profile, [], [], [], [], "FNCE");
    expect(result.major).toBe("FNCE");
    expect(result.collegeCode).toBe("LSB");
    expect(result.college).toBe("Leavey School of Business");
  });

  it("preserves additional majors when the primary major changes (old primary replaced, extras kept)", () => {
    const profile = makeProfile({
      major: "BIOL",
      additionalMajors: ["MATH"],
    });
    const result = buildRequirementsResponse(profile, [], [], [], [], "CHEM");
    // CHEM (new primary) + MATH (preserved additional) = 2. BIOL is gone.
    expect(majorGroups(result)).toHaveLength(2);
    expect(result.major).toBe("CHEM");
  });
});
