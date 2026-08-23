/**
 * Core / major cross-satisfaction through the real requirements pipeline,
 * plus the requirement ORDERING the professor asked for.
 */
import { describe, it, expect } from "vitest";
import { buildRequirementsResponse } from "./requirements";
import type { StudentProfileRow } from "@workspace/db";

function engineeringProfile(
  overrides: Partial<StudentProfileRow> = {},
): StudentProfileRow {
  return {
    id: 1,
    userId: "test-user",
    college: "School of Engineering",
    major: "CSE",
    secondMajor: null,
    additionalMajors: [],
    minor: null,
    additionalMinors: [],
    completedCourseCodes: [],
    startYear: 2026,
    currentYear: 2026,
    ...overrides,
  } as unknown as StudentProfileRow;
}

const coreGroupOf = (result: ReturnType<typeof buildRequirementsResponse>) =>
  result.groups.find((g) => g.kind === "university_core")!;

const coreItem = (
  result: ReturnType<typeof buildRequirementsResponse>,
  id: string,
) => coreGroupOf(result).items.find((i) => i.id === id)!;

describe("requirement group ordering", () => {
  const result = buildRequirementsResponse(
    engineeringProfile(),
    ["ECEN"],
    ["Anthropology"],
    [
      {
        id: "g1",
        name: "Pre-health",
        notes: "",
        courseCodes: ["BIOL 1A"],
        placeholders: [],
      },
    ],
  );
  const kinds = result.groups.map((g) => g.kind);

  it("puts the primary major first", () => {
    expect(kinds[0]).toBe("major");
  });

  it("puts University Core immediately after the primary major", () => {
    expect(kinds[1]).toBe("university_core");
  });

  it("puts the college/school requirements before the optional extras", () => {
    const college = kinds.indexOf("college");
    expect(college).toBe(2);
  });

  it("puts an additional major after the fundamentals", () => {
    const core = kinds.indexOf("university_core");
    const college = kinds.indexOf("college");
    const secondMajor = kinds.lastIndexOf("major");
    expect(secondMajor).toBeGreaterThan(core);
    expect(secondMajor).toBeGreaterThan(college);
  });

  it("puts minors after majors and Core", () => {
    expect(kinds.indexOf("minor")).toBeGreaterThan(
      kinds.indexOf("university_core"),
    );
  });

  it("puts Professional Preparation last", () => {
    expect(kinds[kinds.length - 1]).toBe("professional_prep");
  });
});

describe("a planned major course satisfies the matching Core requirement", () => {
  it("leaves Mathematics Core open when nothing is planned", () => {
    const result = buildRequirementsResponse(engineeringProfile());
    expect(coreItem(result, "math").status).toBe("open");
  });

  it("marks Mathematics Core planned once MATH 11 is planned", () => {
    const result = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      ["MATH 11"],
    );
    const math = coreItem(result, "math");
    expect(math.status).toBe("planned");
    expect(math.crossSatisfiedBy).toContain("MATH 11");
  });

  it("marks Natural Science Core planned once CHEM 11 is planned", () => {
    const result = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      ["CHEM 11"],
    );
    expect(coreItem(result, "natsci").status).toBe("planned");
  });

  it("does not require a duplicate placeholder course for the Core item", () => {
    const result = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      ["MATH 11"],
    );
    const math = coreItem(result, "math");
    // Auto-tracked means the student does not have to hand-add a second copy.
    expect(math.autoTracked).toBe(true);
  });

  it("never labels a planned course as completed", () => {
    const result = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      ["MATH 11"],
    );
    const math = coreItem(result, "math");
    expect(math.complete).toBe(false);
    expect(math.satisfiedBy).toEqual([]);
  });

  it("marks Core completed when the course has completion provenance", () => {
    const result = buildRequirementsResponse(
      engineeringProfile({ completedCourseCodes: ["MATH 11"] } as any),
    );
    const math = coreItem(result, "math");
    expect(math.status).toBe("completed");
    expect(math.complete).toBe(true);
  });

  it("asks the student to verify a derived Core designation", () => {
    const result = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      ["MATH 11"],
    );
    expect(coreItem(result, "math").needsVerification).toBe(true);
  });
});

describe("removing the cross-satisfying course reverses Core status", () => {
  it("returns Mathematics Core to open", () => {
    const planned = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      ["MATH 11"],
    );
    expect(coreItem(planned, "math").status).toBe("planned");

    const removed = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      [],
    );
    expect(coreItem(removed, "math").status).toBe("open");
  });
});

describe("plan isolation", () => {
  it("a tentative scenario's planned courses do not leak into a plan that has none", () => {
    const tentative = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      ["CHEM 11"],
    );
    const degree = buildRequirementsResponse(engineeringProfile());

    expect(coreItem(tentative, "natsci").status).toBe("planned");
    expect(coreItem(degree, "natsci").status).toBe("open");
  });

  it("keeps unrelated Core requirements open regardless of what is planned", () => {
    const result = buildRequirementsResponse(
      engineeringProfile(),
      [],
      [],
      [],
      ["MATH 11", "CHEM 11"],
    );
    expect(coreItem(result, "rtc1").status).toBe("open");
  });
});
