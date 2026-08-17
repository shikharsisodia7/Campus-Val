/**
 * A proposed second major/minor (added via a plan's `programs`, passed in
 * as scenarioMajors/scenarioMinors) must never be presented as if it were
 * already officially declared — CampusVal doesn't declare majors/minors,
 * SCU does. This locks in the "Planning only" distinction the professor
 * asked for.
 */
import { describe, it, expect } from "vitest";
import type { StudentProfileRow } from "@workspace/db";
import { buildRequirementsResponse } from "./requirements";

function makeProfile(overrides: Partial<StudentProfileRow> = {}): StudentProfileRow {
  return {
    id: 1,
    userId: "test-user",
    email: null,
    name: "Test Student",
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as StudentProfileRow;
}

describe("buildRequirementsResponse — scenario (proposed) majors/minors are never treated as declared", () => {
  it("labels a scenario-only major as proposed, with a planning-only disclaimer", () => {
    const profile = makeProfile({ major: "CSE" });
    const result = buildRequirementsResponse(profile, ["ECEN"], []);
    const majorGroups = result.groups.filter((g) => g.kind === "major");
    expect(majorGroups.length).toBe(2);

    const scenarioGroup = majorGroups.find((g) => g.title.includes("(proposed)"));
    const primaryGroup = majorGroups.find((g) => !g.title.includes("(proposed)"));

    expect(scenarioGroup).toBeTruthy();
    expect(
      scenarioGroup!.notes.some((n) =>
        n.includes("Planning only — official declaration must be completed through SCU"),
      ),
    ).toBe(true);

    // The profile's actual declared major must NOT be marked proposed.
    expect(primaryGroup).toBeTruthy();
    expect(
      primaryGroup!.notes.some((n) => n.includes("Planning only")),
    ).toBe(false);
  });

  it("labels a scenario-only minor as proposed, with a planning-only disclaimer", () => {
    const profile = makeProfile({ major: "CSE", minor: null });
    const result = buildRequirementsResponse(profile, [], ["Anthropology"]);
    const scenarioMinor = result.groups.find(
      (g) => g.kind === "minor" && g.title.includes("Anthropology"),
    );
    expect(scenarioMinor).toBeTruthy();
    expect(scenarioMinor!.title).toContain("(proposed)");
    expect(
      scenarioMinor!.notes.some((n) =>
        n.includes("Planning only — official declaration must be completed through SCU"),
      ),
    ).toBe(true);
  });

  it("does not mark an already-declared major as proposed even when it's also passed as a scenario major", () => {
    const profile = makeProfile({ major: "CSE" });
    // Simulate a redundant scenarioMajors entry that duplicates the profile's real major.
    const result = buildRequirementsResponse(profile, ["CSE"], []);
    const group = result.groups.find((g) => g.kind === "major");
    expect(group!.title).not.toContain("(proposed)");
  });
});
