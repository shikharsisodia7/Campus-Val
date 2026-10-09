/**
 * The Biology Degree Plan sidebar as the student receives it: Bulletin
 * sections, theme requirements with their full course lists, stable keys that
 * notes and edits anchor to, and the Core kept out of the Major group.
 */
import { describe, expect, it } from "vitest";
import type { StudentProfileRow } from "@workspace/db";
import { buildRequirementsResponse } from "./requirements";
import { normalizeRequirements } from "../lib/requirements-source/normalize";
import { currentBulletinProvider } from "../lib/requirements-source/current-bulletin";

const profile = (over: Partial<StudentProfileRow> = {}) =>
  ({
    userId: "bio-test",
    major: "BIOL",
    college: "College of Arts and Sciences",
    completedCourseCodes: [],
    secondMajor: null,
    additionalMajors: [],
    minor: null,
    additionalMinors: [],
    ...over,
  }) as unknown as StudentProfileRow;

describe("Biology Degree Plan sidebar", () => {
  const response = buildRequirementsResponse(profile());
  const major = response.groups.find((g) => g.kind === "major")!;

  it("is the Bulletin-sourced Major group, with the Bulletin's own sections", () => {
    expect(major.title).toBe("Major Requirements — Biology");
    expect(major.category).toBe("MAJOR");
    expect(major.sourceUrl).toContain("/biology.html");
    const sections = [...new Set(major.items.map((i) => i.section))];
    expect(sections).toEqual([
      "Biology, chemistry, physics and mathematics",
      "Upper-division themes — one course from each, all with laboratory",
      "Upper-division electives — four, at least two with laboratory",
    ]);
  });

  it("shows each theme as a requirement with its full, named course list", () => {
    const cmb = major.items.find((i) => i.id === "major-primary-theme-cmb")!;
    expect(cmb.choice).toMatchObject({ kind: "choose", minimum: 1 });
    expect(cmb.choice!.lists.map((l) => l.label)).toEqual(["Theme: Cell and Molecular Biology (CMB)"]);
    expect(cmb.courses).toEqual(["BIOL 110", "BIOL 112", "BIOL 113", "BIOL 115", "BIOL 122", "BIOL 174", "BIOL 175"]);
    const electives = major.items.find((i) => i.id === "major-primary-electives-any")!;
    expect(electives.choice!.lists.map((l) => l.key)).toEqual([
      "jes-lecture",
      "jes-lab",
      "cmb",
      "eeb",
      "mod",
      "specialty-lab",
      "specialty-lecture",
    ]);
    expect(electives.courses).toContain("CHEM 141");
  });

  it("keeps the University Core out of the Major group and in the Core group", () => {
    expect(major.items.some((i) => /critical thinking|ctw|cultures & ideas|pathway/i.test(i.label))).toBe(false);
    const core = response.groups.find((g) => g.kind === "university_core")!;
    expect(core.category).toBe("CORE");
    expect(core.items.some((i) => i.id.includes("ctw"))).toBe(true);
  });

  it("gives every requirement a stable key that notes and edits can anchor to", () => {
    const built = currentBulletinProvider.build({
      profile: profile(),
      scenarioMajors: [],
      scenarioMinors: [],
      professionalGoals: [],
      plannedCourses: [],
      primaryMajor: null,
    });
    const tree = normalizeRequirements(built.response, built.provenance, "current_bulletin");
    const keys = tree.find((g) => g.stableKey === "major:biology")!.items.map((i) => i.stableKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        "major:biology#biol-1a",
        "major:biology#chem-12",
        "major:biology#chem-33",
        "major:biology#physics",
        "major:biology#mathematics",
        "major:biology#biol-101",
        "major:biology#theme-cmb",
        "major:biology#theme-eeb",
        "major:biology#theme-mod",
        "major:biology#electives-lab",
        "major:biology#electives-any",
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("a minor's choose-N requirement also carries its full course list", () => {
    const withMinor = buildRequirementsResponse(profile({ major: "PSYC", minor: "Biology" }));
    const minor = withMinor.groups.find((g) => g.kind === "minor")!;
    const choice = minor.items.find((i) => i.choice);
    if (choice) expect(choice.choice!.lists[0]!.courses).toEqual(choice.courses);
  });
});
