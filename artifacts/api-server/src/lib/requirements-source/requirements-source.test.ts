/**
 * The requirements sidebar's source sits behind a provider, and nothing a
 * student sees has changed. No benchmark policy has been chosen here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StudentProfileRow } from "@workspace/db";
import { buildRequirementsResponse } from "../../routes/requirements";
import {
  ACTIVE_REQUIREMENTS_SOURCE,
  POLICY_DECIDED,
  REQUIREMENT_SOURCE_TYPES,
  buildRequirements,
  requirementsProvider,
  requirementsSourceStatus,
  type RequirementsRequest,
} from "./index";

const here = path.dirname(fileURLToPath(import.meta.url));

function profile(overrides: Partial<StudentProfileRow> = {}): StudentProfileRow {
  return {
    id: 1,
    userId: "source-student",
    email: null,
    name: "Source Student",
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

const request = (overrides: Partial<RequirementsRequest> = {}): RequirementsRequest => ({
  profile: profile(),
  scenarioMajors: [],
  scenarioMinors: [],
  professionalGoals: [],
  plannedCourses: [],
  primaryMajor: null,
  ...overrides,
});

const CASES: RequirementsRequest[] = [
  request(),
  request({ profile: profile({ college: "Leavey School of Business", major: "FNCE", completedCourseCodes: ["ACTG 11", "MATH 11"] }), plannedCourses: ["FNCE 121"] }),
  request({ profile: profile({ college: "College of Arts and Sciences", major: "BIOL", minor: "Anthropology" }) }),
  request({ scenarioMajors: ["ECEN"], scenarioMinors: ["Anthropology"] }),
  request({ profile: profile({ college: "College of Arts and Sciences", major: "BIOL" }), primaryMajor: "FNCE" }),
  request({ professionalGoals: [{ id: "pre-health", name: "Pre-Health", notes: "", courseCodes: ["BIOL 1A"], placeholders: ["Clinical hours"] }] }),
];

describe("what a student is sent", () => {
  it("is exactly what the builder produced before there was a provider", () => {
    for (const r of CASES) {
      const direct = buildRequirementsResponse(r.profile, r.scenarioMajors, r.scenarioMinors, r.professionalGoals, r.plannedCourses, r.primaryMajor);
      expect(buildRequirements(r).response).toEqual(direct);
      expect(JSON.stringify(buildRequirements(r).response)).toBe(JSON.stringify(direct));
    }
  });

  it("carries no provenance record: that stays on the server", () => {
    for (const r of CASES) {
      const sent = JSON.stringify(buildRequirements(r).response);
      expect(sent).not.toMatch(/sourceType|academicYearBasis|sourceIdentifier|current_bulletin/);
    }
  });
});

describe("no policy has been chosen", () => {
  it("uses the source CampusVal already used, and says the decision is open", () => {
    expect(ACTIVE_REQUIREMENTS_SOURCE).toBe("current_bulletin");
    expect(POLICY_DECIDED).toBe(false);
    const status = requirementsSourceStatus();
    expect(status).toMatchObject({ active: "current_bulletin", policyDecided: false, implemented: ["current_bulletin"] });
    expect(status.notImplemented).toEqual(["cohort_bulletin", "degree_checksheet", "apr", "composite"]);
    expect(status.decisionNeeded).toMatch(/current Bulletin.*matriculation year.*checksheet.*Academic Progress Report.*combination/);
  });

  it("has not built any other source: asking for one fails, it is never silently substituted", () => {
    for (const type of REQUIREMENT_SOURCE_TYPES.filter((t) => t !== "current_bulletin")) {
      expect(() => requirementsProvider(type), type).toThrow(/has not been chosen/);
    }
  });

  it("cannot be switched by a setting, a flag or a request", () => {
    const source = ["index.ts", "model.ts", "current-bulletin.ts"].map((file) => readFileSync(path.join(here, file), "utf8")).join("\n");
    expect(source).not.toMatch(/process\.env|req\.query|req\.body|localStorage/);
    const route = readFileSync(path.resolve(here, "../../routes/requirements.ts"), "utf8");
    expect(route).not.toMatch(/req\.query\.(source|benchmark|provider)/);
  });

  it("reads nothing from the APR or from Degree Checksheets", () => {
    for (const file of ["index.ts", "model.ts", "current-bulletin.ts"]) {
      const imports = (readFileSync(path.join(here, file), "utf8").match(/from "[^"]+"/g) ?? []).join(" ");
      expect(imports, file).not.toMatch(/apr|checksheet|progress-report/i);
    }
  });
});

describe("where each group came from", () => {
  it("is recorded for every group, in the group's order", () => {
    for (const r of CASES) {
      const { response, provenance } = buildRequirements(r);
      expect(provenance.map((p) => p.groupId)).toEqual(response.groups.map((g) => g.id));
      expect(provenance.every((p) => p.sourceType === "current_bulletin")).toBe(true);
    }
  });

  it("repeats only what the data states, and says nothing where it states nothing", () => {
    for (const r of CASES) {
      const { response, provenance } = buildRequirements(r);
      response.groups.forEach((group, i) => {
        const record = provenance[i]!;
        const stated = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value : null);
        expect(record.sourceIdentifier).toBe(stated(group.sourceUrl));
        expect(record.sourceLabel).toBe(stated(group.sourceLabel));
        expect(record.academicYear).toBe(stated(group.academicYear));
        expect(record.sourceVersion).toBe(stated(group.academicYear));
        expect(record.lastVerified).toBe(stated(group.lastVerified));
        if (record.academicYear === null) expect(record.academicYearBasis).toBe("not_stated");
      });
    }
  });

  it("says when a major's year is the University Core's and not its own", () => {
    const { provenance } = buildRequirements(CASES[0]!);
    expect(provenance.find((p) => p.groupKind === "university_core")!.academicYearBasis).toBe("stated_for_this_group");
    expect(provenance.find((p) => p.groupKind === "major")!.academicYearBasis).toBe("inherited_from_university_core");
  });
});
