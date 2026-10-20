/**
 * Multi-school requirement composition (professor review, 2026-10-20).
 *
 * ANY Leavey School of Business MAJOR brings the Leavey School requirements
 * (the business core) into the plan, whether it is the primary major, a second
 * or additional major, or a Tentative Degree Plan's major, and whatever school
 * the other majors belong to. Schools compose as a SET: a Biology + Finance plan
 * has the College of Arts and Sciences AND the Leavey School requirements, one
 * University Core, and both majors. Leavey's Core fulfillment statements overlay
 * the one University Core as annotations; they never complete a Core area on
 * their own.
 *
 * Pure-function tests over buildRequirementsResponse, the builder GET
 * /requirements, GET /plans/:id/requirements and placeholder eligibility use.
 */
import { describe, it, expect } from "vitest";
import type { StudentProfileRow } from "@workspace/db";
import { buildRequirementsResponse } from "./requirements";
import { getAvailableMajors } from "../data/graduation-paths";
import { buildNormalizedRequirements, composeRequirementOverlay, type StoredCustomization } from "../lib/requirements-source";

function profile(overrides: Partial<StudentProfileRow> = {}): StudentProfileRow {
  return {
    id: 1,
    userId: "multi-school",
    email: null,
    name: "Synthetic Student",
    studentId: null,
    studentType: "undergraduate",
    college: "College of Arts and Sciences",
    major: "BIOL",
    secondMajor: null,
    minor: null,
    additionalMajors: [],
    additionalMinors: [],
    startTerm: "fall",
    startYear: 2025,
    expectedGradTerm: "spring",
    expectedGradYear: 2029,
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

const COLLEGE: Record<string, string> = {
  CAS: "College of Arts and Sciences",
  LSB: "Leavey School of Business",
  SOE: "School of Engineering",
};
const MAJORS = getAvailableMajors();
const schoolOf = (code: string) => MAJORS.find((m) => m.code === code)!.college;

/** A plan with these majors (primary first) as the profile would hold them. */
function plan(
  majors: string[],
  extra: { completed?: string[]; planned?: string[]; minors?: string[] } = {},
) {
  const [primary, ...others] = majors;
  return buildRequirementsResponse(
    profile({
      college: COLLEGE[schoolOf(primary!)],
      major: primary!,
      additionalMajors: others,
      completedCourseCodes: extra.completed ?? [],
      minor: extra.minors?.[0] ?? null,
      additionalMinors: extra.minors?.slice(1) ?? [],
    }),
    [],
    [],
    [],
    extra.planned ?? [],
  );
}

type Response = ReturnType<typeof buildRequirementsResponse>;
const schoolGroups = (r: Response) => r.groups.filter((g) => g.category === "SCHOOL");
const schoolIds = (r: Response) => schoolGroups(r).map((g) => g.id).sort();
const majorGroups = (r: Response) => r.groups.filter((g) => g.category === "MAJOR");
const coreGroups = (r: Response) => r.groups.filter((g) => g.category === "CORE");
const leavey = (r: Response) => r.groups.find((g) => g.id === "college-lsb");
const coreItem = (r: Response, id: string) => coreGroups(r)[0]!.items.find((i) => i.id === id)!;
const item = (r: Response, groupId: string, id: string) => r.groups.find((g) => g.id === groupId)!.items.find((i) => i.id === id)!;
const annotationIds = (r: Response, coreId: string) => (coreItem(r, coreId).annotations ?? []).map((a) => a.id);

describe("Finance (the professor's demonstration case)", () => {
  const r = plan(["FNCE"]);

  it("has University, University Core, Leavey School and Finance Major requirements", () => {
    expect(r.groups.map((g) => g.category)).toEqual(["MAJOR", "CORE", "SCHOOL", "UNIVERSITY"]);
    expect(r.groups.map((g) => g.title)).toEqual([
      "Major Requirements — Finance (B.S. Commerce)",
      "University Core Curriculum",
      "Leavey School of Business Requirements",
      "University Degree Requirements",
    ]);
    expect(leavey(r)!.school).toEqual({ code: "LSB", name: "Leavey School of Business", activatedBy: ["Finance (B.S. Commerce)"] });
  });

  it("keeps the business core out of the Finance major group", () => {
    const financeCourses = new Set(majorGroups(r)[0]!.items.flatMap((i) => i.courses));
    for (const core of ["FNCE 121", "MKTG 181", "MGMT 160", "OMIS 108", "MGMT 162", "BUSN 70", "ACTG 11"]) {
      expect(financeCourses.has(core), core).toBe(false);
    }
    // The Finance major's own structure is intact.
    expect(majorGroups(r)[0]!.items.length).toBeGreaterThan(0);
    expect(majorGroups(r)[0]!.items.some((i) => i.courses.includes("FNCE 124"))).toBe(true);
  });

  it("lists the full Leavey core with stable ids, all of them SCHOOL", () => {
    const ids = leavey(r)!.items.map((i) => i.id);
    expect(ids).toEqual([
      "lsb-busn70", "lsb-omis15", "lsb-busn85", "lsb-econ1", "lsb-econ2", "lsb-econ3", "lsb-mgmt71", "lsb-mgmt72",
      "lsb-actg11", "lsb-actg12", "lsb-omis40", "lsb-omis41", "lsb-omis34", "lsb-mgmt196", "lsb-fnce121",
      "lsb-mgmt160", "lsb-mktg181", "lsb-omis108", "lsb-mgmt162",
    ]);
    expect(leavey(r)!.category).toBe("SCHOOL");
    expect(leavey(r)!.kind).toBe("college");
  });

  it("keeps the conservative FNCE 186 count-once note (not decided without the department)", () => {
    expect(JSON.stringify(majorGroups(r)[0])).toContain("Confirm with your advisor if you need it to count for both");
  });
});

describe("cross-school plans compose schools as a set", () => {
  it("Biology + Finance: CAS and Leavey school groups, one Core, both majors", () => {
    const r = plan(["BIOL", "FNCE"]);
    expect(schoolIds(r)).toEqual(["college-cas", "college-lsb"]);
    expect(coreGroups(r)).toHaveLength(1);
    expect(majorGroups(r).map((g) => g.title)).toEqual(["Major Requirements — Biology", "Major Requirements — Finance (B.S. Commerce)"]);
    expect(r.schools.map((s) => [s.code, s.primary, s.majors])).toEqual([["CAS", true, ["BIOL"]], ["LSB", false, ["FNCE"]]]);
    // The primary school still keys the Core (backward-compatible stable key).
    expect(r.collegeCode).toBe("CAS");
  });

  it("Finance + Biology (reverse order) has the same school groups", () => {
    const r = plan(["FNCE", "BIOL"]);
    expect(schoolIds(r)).toEqual(["college-cas", "college-lsb"]);
    expect(coreGroups(r)).toHaveLength(1);
    expect(majorGroups(r)).toHaveLength(2);
    expect(r.collegeCode).toBe("LSB");
    // The primary school's group comes first.
    expect(schoolGroups(r).map((g) => g.id)).toEqual(["college-lsb", "college-cas"]);
  });

  it("Finance as profile.secondMajor counts like an additional major", () => {
    const r = buildRequirementsResponse(profile({ major: "BIOL", secondMajor: "FNCE" }));
    expect(schoolIds(r)).toEqual(["college-cas", "college-lsb"]);
  });

  it.each([
    [["BIOL", "FNCE"], ["college-cas", "college-lsb"]],
    [["FNCE", "BIOL"], ["college-cas", "college-lsb"]],
    [["MECH", "FNCE"], ["college-lsb", "college-soe"]],
    [["FNCE", "MECH"], ["college-lsb", "college-soe"]],
    [["FNCE", "MKTG"], ["college-lsb"]],
    [["BIOL", "MECH"], ["college-cas", "college-soe"]],
    [["CSCI", "FNCE"], ["college-cas", "college-lsb"]],
    [["BIOL"], ["college-cas"]],
  ])("%j -> %j", (majors, expected) => {
    const r = plan(majors);
    expect(schoolIds(r)).toEqual(expected);
    expect(coreGroups(r)).toHaveLength(1);
    expect(r.groups.filter((g) => g.category === "UNIVERSITY")).toHaveLength(1);
    expect(majorGroups(r)).toHaveLength(majors.length);
    // No school group twice.
    expect(new Set(schoolIds(r)).size).toBe(schoolIds(r).length);
  });

  it("two Leavey majors share ONE Leavey group that names both", () => {
    const r = plan(["FNCE", "MKTG"]);
    expect(schoolGroups(r)).toHaveLength(1);
    expect(leavey(r)!.school!.activatedBy).toEqual(["Finance (B.S. Commerce)", "Marketing (B.S. Commerce)"]);
    expect(leavey(r)!.items).toHaveLength(19);
    // The Core annotations are not doubled either.
    expect(annotationIds(r, "socsci")).toEqual(["lsb-core-socsci"]);
  });

  it("Engineering + Leavey: SOE and Leavey groups beside both majors", () => {
    const r = plan(["MECH", "FNCE"]);
    expect(r.groups.map((g) => g.title)).toEqual([
      "Major Requirements — Mechanical Engineering",
      "University Core Curriculum",
      "School of Engineering Requirements",
      "Leavey School of Business Requirements",
      "University Degree Requirements",
      "Major Requirements — Finance (B.S. Commerce)",
    ]);
  });

  it("Leavey Economics brings the Leavey core; CAS Economics does not", () => {
    expect(schoolIds(plan(["ECON"]))).toEqual(["college-lsb"]);
    const cas = plan(["ECON_CAS"]);
    expect(schoolIds(cas)).toEqual(["college-cas"]);
    expect(coreGroups(cas)[0]!.items.some((i) => (i.annotations ?? []).length > 0)).toBe(false);
  });
});

describe("Tentative Degree Plans and plan changes", () => {
  it("a tentative Finance plan (primary override) for a Biology student shows the Leavey core", () => {
    const r = buildRequirementsResponse(profile({ major: "BIOL" }), [], [], [], [], "FNCE");
    expect(schoolIds(r)).toEqual(["college-lsb"]);
    expect(majorGroups(r)[0]!.title).toBe("Major Requirements — Finance (B.S. Commerce)");
  });

  it("a hypothetical Finance major (scenario) added to a Biology plan shows the Leavey core without a Workday declaration", () => {
    const r = buildRequirementsResponse(profile({ major: "BIOL" }), ["FNCE"]);
    expect(schoolIds(r)).toEqual(["college-cas", "college-lsb"]);
    expect(majorGroups(r)[1]!.title).toBe("Major Requirements — Finance (B.S. Commerce) (proposed)");
  });

  it("adding and removing business majors adds and removes the Leavey group", () => {
    expect(leavey(plan(["BIOL"]))).toBeUndefined();
    expect(leavey(plan(["BIOL", "FNCE"]))).toBeDefined();
    // Finance removed, Marketing remains: still there.
    expect(leavey(plan(["BIOL", "MKTG"]))!.school!.activatedBy).toEqual(["Marketing (B.S. Commerce)"]);
    // Last business major removed: gone, and so are the Leavey Core annotations.
    const back = plan(["BIOL"]);
    expect(leavey(back)).toBeUndefined();
    expect(coreGroups(back)[0]!.items.every((i) => !i.annotations)).toBe(true);
  });
});

describe("a business MINOR is not the Leavey core", () => {
  it.each([["MIS-MIN"], ["Management Information Systems"], ["MKTG-MIN"]])("Biology + %s minor: no Leavey group, no Leavey Core annotations", (minor) => {
    const r = plan(["BIOL"], { minors: [minor] });
    expect(leavey(r)).toBeUndefined();
    expect(schoolIds(r)).toEqual(["college-cas"]);
    expect(coreGroups(r)[0]!.items.every((i) => !i.annotations)).toBe(true);
    expect(r.groups.some((g) => g.category === "MINOR")).toBe(true);
  });
});

describe("every Leavey major (from the program catalog)", () => {
  const lsbMajors = MAJORS.filter((m) => m.college === "LSB");

  it("the catalog has the Leavey majors this release was checked against", () => {
    expect(lsbMajors.map((m) => m.code).sort()).toEqual(["ACTG", "AIS", "BANL", "ECON", "FNCE", "MGMT", "MKTG", "OMIS"]);
  });

  it.each(lsbMajors.map((m) => [m.code, m.title]))("%s alone: Leavey group once, its own major group, one Core", (code) => {
    const r = plan([code]);
    expect(schoolGroups(r).filter((g) => g.id === "college-lsb")).toHaveLength(1);
    expect(schoolIds(r)).toEqual(["college-lsb"]);
    expect(majorGroups(r)).toHaveLength(1);
    expect(majorGroups(r)[0]!.items.length).toBeGreaterThan(0);
    expect(coreGroups(r)).toHaveLength(1);
    // No Leavey core course is counted as a major requirement as well, except
    // where the major's own Bulletin text lists it: the Economics major's
    // departmental requirements begin "ECON 1, 2, AND 3".
    const sourceListed = code === "ECON" ? new Set(["ECON 1", "ECON 2", "ECON 3"]) : new Set<string>();
    const lsbCourses = new Set(["BUSN 70", "OMIS 15", "BUSN 85", "ECON 1", "ECON 2", "ECON 3", "ACTG 11", "ACTG 12", "OMIS 40", "FNCE 121", "MGMT 160", "MKTG 181", "OMIS 108", "MGMT 162", "MGMT 196"]);
    const leaked = majorGroups(r)[0]!.items.filter((i) => i.courses.length === 1 && lsbCourses.has(i.courses[0]!) && !sourceListed.has(i.courses[0]!));
    expect(leaked.map((i) => i.id)).toEqual([]);
  });

  it("every non-Leavey major alone gets no Leavey group", () => {
    for (const m of MAJORS.filter((x) => x.college !== "LSB")) {
      expect(leavey(plan([m.code])), m.code).toBeUndefined();
    }
  });
});

describe("Leavey school requirements resolve from course evidence", () => {
  it("completed BUSN 70, planned ACTG 11, open FNCE 121", () => {
    const r = plan(["FNCE"], { completed: ["BUSN 70"], planned: ["ACTG 11"] });
    expect(item(r, "college-lsb", "lsb-busn70").status).toBe("completed");
    expect(item(r, "college-lsb", "lsb-actg11").status).toBe("planned");
    expect(item(r, "college-lsb", "lsb-actg11").complete).toBe(false);
    expect(item(r, "college-lsb", "lsb-fnce121").status).toBe("open");
    // Counts come from the Leavey group's own items only.
    expect(leavey(r)!.autoTrackedCount).toBe(19);
    expect(leavey(r)!.autoCompletedCount).toBe(1);
  });

  it("works the same when Finance is the additional major", () => {
    const r = plan(["BIOL", "FNCE"], { completed: ["BUSN 70"], planned: ["ACTG 11"] });
    expect(item(r, "college-lsb", "lsb-busn70").status).toBe("completed");
    expect(item(r, "college-lsb", "lsb-actg11").status).toBe("planned");
  });
});

describe("Leavey fulfillment of the University Core (annotations)", () => {
  it("annotates the verified areas, every annotation with its source", () => {
    const r = plan(["FNCE"]);
    const annotated = coreGroups(r)[0]!.items.filter((i) => i.annotations).map((i) => i.id);
    expect(annotated).toEqual(["math", "civic", "ci3", "ethics", "sts", "socsci", "advwriting"]);
    for (const a of coreGroups(r)[0]!.items.flatMap((i) => i.annotations ?? [])) {
      expect(a.kind).toBe("school_core_fulfillment");
      expect(a.sourceUrl).toBe("https://www.scu.edu/business/undergraduates/core/");
      expect(a.sourceLabel).toMatch(/Leavey/);
      expect(a.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // The Core stays CORE: annotations never move it.
    expect(coreGroups(r)[0]!.category).toBe("CORE");
  });

  it("choosing a business major completes nothing", () => {
    const r = plan(["FNCE"]);
    expect(coreGroups(r)[0]!.items.every((i) => i.status === "open")).toBe(true);
    expect(leavey(r)!.items.every((i) => i.status === "open")).toBe(true);
  });

  it("completed ECON 1: Leavey ECON 1 and Core Social Science both completed, through the explicit mapping", () => {
    const r = plan(["FNCE"], { completed: ["ECON 1"] });
    expect(item(r, "college-lsb", "lsb-econ1").status).toBe("completed");
    const socsci = coreItem(r, "socsci");
    expect(socsci.status).toBe("completed");
    expect(socsci.satisfiedBy).toEqual(["ECON 1"]);
    // An explicit SCU statement, not a derived catalog match.
    expect(socsci.crossSatisfiedBy).not.toContain("ECON 1");
    expect(socsci.needsVerification).toBe(false);
    expect(socsci.annotations![0]!.status).toBe("completed");
    expect(socsci.annotations![0]!.schoolRequirementIds).toEqual(["lsb-econ1"]);
  });

  it("planned BUSN 179: Advanced Writing planned, never completed", () => {
    const r = plan(["FNCE"], { planned: ["BUSN 179"] });
    const w = coreItem(r, "advwriting");
    expect(w.status).toBe("planned");
    expect(w.complete).toBe(false);
    expect(w.plannedBy).toEqual(["BUSN 179"]);
    expect(w.satisfiedBy).toEqual([]);
  });

  it("no BUSN 179: Advanced Writing open, with the Leavey route shown", () => {
    const w = coreItem(plan(["FNCE"]), "advwriting");
    expect(w.status).toBe("open");
    expect(w.annotations!.map((a) => a.text)).toEqual(["Advanced Writing: BUSN 179."]);
    expect(w.courses).toContain("BUSN 179");
  });

  it("a Biology + Finance plan gets the same Leavey overlay on its one Core", () => {
    const r = plan(["BIOL", "FNCE"], { completed: ["ECON 1"] });
    expect(coreItem(r, "socsci").status).toBe("completed");
    expect(annotationIds(r, "advwriting")).toEqual(["lsb-core-advwriting"]);
  });

  it("Civic Engagement needs MGMT 162 AND an ethics course, as the Leavey page says", () => {
    expect(coreItem(plan(["FNCE"], { completed: ["MGMT 162"] }), "civic").status).not.toBe("completed");
    expect(coreItem(plan(["FNCE"], { completed: ["MGMT 162", "PHIL 109"] }), "civic").status).toBe("completed");
    const mixed = coreItem(plan(["FNCE"], { completed: ["MGMT 162"], planned: ["MGMT 136"] }), "civic");
    expect(mixed.status).toBe("planned");
    expect(mixed.satisfiedBy).toEqual([]);
  });

  it("a course SCU names does not also appear as a derived 'confirm this' match", () => {
    const r = plan(["FNCE"], { planned: ["MGMT 136"] });
    expect(coreItem(r, "ethics").crossSatisfiedBy).toEqual([]);
    expect(coreItem(r, "ethics").plannedBy).toEqual(["MGMT 136"]);
  });

  it("without a Leavey major the Core has no Leavey routes", () => {
    const r = plan(["BIOL"], { completed: ["BUSN 179"] });
    expect(coreItem(r, "advwriting").annotations).toBeUndefined();
    expect(coreItem(r, "advwriting").courses).toEqual([]);
  });
});

describe("program-specific Leavey routes are not flattened", () => {
  it("Accounting: ACTG 134 is the STS and information-systems route; Finance does not get it", () => {
    const actg = plan(["ACTG"]);
    expect(annotationIds(actg, "sts")).toEqual(["lsb-core-sts", "lsb-core-sts-accounting"]);
    expect(item(actg, "college-lsb", "lsb-omis34").courses).toEqual(["OMIS 34", "ACTG 134"]);
    expect(coreItem(plan(["ACTG"], { completed: ["ACTG 134"] }), "sts").status).toBe("completed");

    const fnce = plan(["FNCE"], { completed: ["ACTG 134"] });
    expect(annotationIds(fnce, "sts")).toEqual(["lsb-core-sts"]);
    expect(item(fnce, "college-lsb", "lsb-omis34").courses).toEqual(["OMIS 34"]);
    expect(item(fnce, "college-lsb", "lsb-omis34").status).toBe("open");
    expect(fnce.groups.find((g) => g.kind === "university_core")!.items.find((i) => i.id === "sts")!.annotations![0]!.status).toBe("open");
  });

  it("MIS: OMIS 30 / 31 for MIS majors and minors only, and STS from the approved list", () => {
    const mis = plan(["OMIS"]);
    expect(item(mis, "college-lsb", "lsb-omis34").courses).toEqual(["OMIS 34", "OMIS 30", "OMIS 31"]);
    expect(annotationIds(mis, "sts")).toContain("lsb-core-sts-mis");

    const misMinor = plan(["FNCE"], { minors: ["MIS-MIN"] });
    expect(item(misMinor, "college-lsb", "lsb-omis34").courses).toEqual(["OMIS 34", "OMIS 30", "OMIS 31"]);
    expect(annotationIds(misMinor, "sts")).toContain("lsb-core-sts-mis");
    expect(schoolGroups(misMinor)).toHaveLength(1);

    for (const code of ["FNCE", "MKTG", "MGMT", "BANL", "ECON", "ACTG"]) {
      const r = plan([code]);
      expect(item(r, "college-lsb", "lsb-omis34").courses, code).not.toContain("OMIS 30");
      expect(annotationIds(r, "sts"), code).not.toContain("lsb-core-sts-mis");
    }
  });

  it("Leavey Economics: OMIS 41, or ECON 41 and ECON 42", () => {
    const both = item(plan(["ECON"], { completed: ["ECON 41", "ECON 42"] }), "college-lsb", "lsb-omis41");
    expect(both.status).toBe("completed");
    expect(both.choice?.kind).toBe("alternatives");
    expect(both.choice?.alternatives.map((a) => a.courses)).toEqual([["OMIS 41"], ["ECON 41", "ECON 42"]]);

    const one = item(plan(["ECON"], { completed: ["ECON 41"] }), "college-lsb", "lsb-omis41");
    expect(one.status).toBe("open");
    expect(one.satisfiedBy).toEqual([]);

    expect(item(plan(["ECON"], { completed: ["ECON 41"], planned: ["ECON 42"] }), "college-lsb", "lsb-omis41").status).toBe("planned");

    // Finance students do not get the economics route.
    const fnce = item(plan(["FNCE"], { completed: ["ECON 41", "ECON 42"] }), "college-lsb", "lsb-omis41");
    expect(fnce.status).toBe("open");
    expect(fnce.courses).toEqual(["OMIS 41"]);
  });

  it("Finance and Economics get their Mathematics statements; other Leavey majors do not", () => {
    expect(annotationIds(plan(["FNCE"]), "math")).toEqual(["lsb-core-math", "lsb-core-math-finance"]);
    expect(annotationIds(plan(["ECON"]), "math")).toEqual(["lsb-core-math", "lsb-core-math-economics"]);
    expect(annotationIds(plan(["MKTG"]), "math")).toEqual(["lsb-core-math"]);
  });
});

describe("unknown programs are never guessed", () => {
  it("an additional major CampusVal does not know adds no school and says so", () => {
    const r = plan(["BIOL", "NOT A MAJOR"]);
    expect(schoolIds(r)).toEqual(["college-cas"]);
    expect(r.schoolWarnings).toHaveLength(1);
    expect(r.schoolWarnings[0]).toMatch(/does not know which school/);
  });

  it("an unknown primary major keeps the profile's school, with a warning", () => {
    const r = buildRequirementsResponse(profile({ college: "Leavey School of Business", major: "LEGACY BUSINESS" }));
    expect(schoolIds(r)).toEqual(["college-lsb"]);
    expect(r.schools[0]!.basis).toBe("profile_college");
    expect(r.schoolWarnings).toHaveLength(1);
  });
});

describe("stable keys and plan-scoped edits across schools", () => {
  const build = () =>
    buildNormalizedRequirements({
      profile: profile({ major: "BIOL", additionalMajors: ["FNCE"] }),
      scenarioMajors: [],
      scenarioMinors: [],
      professionalGoals: [],
      plannedCourses: [],
      primaryMajor: null,
    });

  it("school groups and items keep id-based keys; the Core keeps the primary school's key", () => {
    const { tree } = build();
    expect(tree.map((g) => g.stableKey)).toEqual([
      "major:biology",
      "university-core:cas",
      "college-cas",
      "college-lsb",
      "university-requirements",
      "major:finance-b-s-commerce",
    ]);
    const lsb = tree.find((g) => g.stableKey === "college-lsb")!;
    expect(lsb.category).toBe("SCHOOL");
    expect(lsb.items[0]!.stableKey).toBe("college-lsb#lsb-busn70");
  });

  it("hiding a Biology requirement hides nothing in Finance or the Leavey core", () => {
    const { tree } = build();
    const biologyItem = tree[0]!.items[0]!;
    const row: StoredCustomization = {
      entryType: "source_edit",
      targetKey: biologyItem.stableKey,
      groupKey: null,
      title: null,
      note: null,
      hidden: true,
      done: false,
      baseFingerprint: biologyItem.fingerprint,
      baseTitle: biologyItem.item.label,
      baseSourceVersion: null,
      baseSourceType: "current_bulletin",
      updatedAt: new Date(0),
    };
    const { groups } = composeRequirementOverlay(tree, [row]);
    const hidden = groups.flatMap((g) => g.items.filter((i) => i.customization?.hidden).map((i) => i.stableKey));
    expect(hidden).toEqual([biologyItem.stableKey]);
  });
});
