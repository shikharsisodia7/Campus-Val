/**
 * The Bulletin baseline: editions, categories, snapshots, and the Core/Major
 * classification the professor flagged (CTW and the Foundations / Explorations
 * / Integrations Core areas must never be listed as Major requirements).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { StudentProfileRow } from "@workspace/db";
import { getAvailableMajors, type College } from "../../data/graduation-paths";
import { buildNormalizedRequirements } from "./index";
import { BULLETIN_EDITIONS, BulletinEditionNotLoadedError, latestBulletinEdition, resolveBulletinEdition, type BulletinEdition } from "./editions";
import { categoryOfGroupKind, isCtwCourseCode, looksLikeCoreAreaLabel } from "./category";
import { auditRequirements, auditTree, CLASSIFICATION_CODES } from "./audit";
import { buildBulletinSnapshot, diffSnapshots, isEmptyDiff, serializeSnapshot, type BulletinSnapshot } from "./snapshot";
import { currentBulletinProvider } from "./current-bulletin";

const COLLEGE_NAME: Record<College, string> = {
  CAS: "College of Arts and Sciences",
  LSB: "Leavey School of Business",
  SOE: "School of Engineering",
};

function treeFor(major: { code: string; college: College }) {
  const profile = {
    id: 0,
    userId: "t",
    college: COLLEGE_NAME[major.college],
    major: major.code,
    secondMajor: null,
    minor: null,
    additionalMajors: [],
    additionalMinors: [],
    completedCourseCodes: [],
  } as unknown as StudentProfileRow;
  return buildNormalizedRequirements({ profile, scenarioMajors: [], scenarioMinors: [], professionalGoals: [], plannedCourses: [], primaryMajor: null });
}

const majors = getAvailableMajors();
const pick = (title: string) => majors.find((m) => m.title === title)!;

describe("Bulletin editions", () => {
  it("defaults to the latest registered edition and builds the sidebar from it", () => {
    const latest = latestBulletinEdition();
    expect(latest.id).toBe("2026-27");
    const built = treeFor(pick("Biology"));
    expect(built.edition).toBe(latest.id);
    expect(built.tree.every((g) => g.provenance.bulletinEdition === latest.id)).toBe(true);
    expect(built.tree.find((g) => g.group.kind === "major")!.provenance.sourceProgram).toBe("Biology");
  });

  it("picks the newest of several editions by id, without hardcoding any", () => {
    const editions: BulletinEdition[] = [
      { id: "2024-25", label: "a", statedAs: "a", verifiedOn: "2024-08-01", status: "archived" },
      { id: "2026-27", label: "c", statedAs: "c", verifiedOn: "2026-07-23", status: "active" },
      { id: "2025-26", label: "b", statedAs: "b", verifiedOn: "2025-08-01", status: "archived" },
    ];
    expect(latestBulletinEdition(editions).id).toBe("2026-27");
    expect(resolveBulletinEdition("2025-26", {}, editions).edition.id).toBe("2025-26");
    expect(resolveBulletinEdition(null, { REQUIREMENTS_BULLETIN_EDITION: "2024-25" }, editions)).toMatchObject({ from: "environment" });
  });

  it("never substitutes another edition for one that is not loaded", () => {
    expect(() => resolveBulletinEdition("2019-20")).toThrow(BulletinEditionNotLoadedError);
    const bad = resolveBulletinEdition(null, { REQUIREMENTS_BULLETIN_EDITION: "2019-20" });
    expect(bad.edition.id).toBe(latestBulletinEdition().id);
    expect(bad.warning).toMatch(/not loaded/);
    expect(bad.warning).not.toContain("2019-20");
    expect(() =>
      currentBulletinProvider.build({
        profile: { college: COLLEGE_NAME.CAS, major: "BIOL", completedCourseCodes: [] } as unknown as StudentProfileRow,
        scenarioMajors: [],
        scenarioMinors: [],
        professionalGoals: [],
        plannedCourses: [],
        primaryMajor: null,
        context: { bulletinEdition: "2019-20" },
      }),
    ).toThrow(/not loaded/);
  });

  it("registers only editions whose data exists", () => {
    expect(BULLETIN_EDITIONS.map((e) => e.id)).toEqual(["2026-27"]);
  });
});

describe("requirement categories", () => {
  it("maps every group kind to one canonical category", () => {
    expect(categoryOfGroupKind("university")).toBe("UNIVERSITY");
    expect(categoryOfGroupKind("university_core")).toBe("CORE");
    expect(categoryOfGroupKind("college")).toBe("SCHOOL");
    expect(categoryOfGroupKind("major")).toBe("MAJOR");
    expect(categoryOfGroupKind("minor")).toBe("MINOR");
    expect(categoryOfGroupKind("professional_prep")).toBe("OTHER");
  });

  it("gives a school its own group, and the University rules their own group, in every school", () => {
    for (const college of ["CAS", "LSB", "SOE"] as const) {
      const built = treeFor(majors.find((m) => m.college === college)!);
      const cats = built.tree.map((g) => g.category);
      expect(cats).toContain("CORE");
      expect(cats).toContain("SCHOOL");
      expect(cats).toContain("UNIVERSITY");
      expect(cats).toContain("MAJOR");
      expect(built.tree.find((g) => g.category === "UNIVERSITY")!.items.every((i) => i.item.courses.length === 0)).toBe(true);
    }
  });

  it("recognizes Core area wording but not a real course title", () => {
    for (const label of ["Critical Thinking & Writing 1", "CTW 2", "ENGL 1A — Critical Thinking and Writing 1", "Cultures & Ideas 3", "RTC 2", "Pathway 1", "Natural Science"]) {
      expect(looksLikeCoreAreaLabel(label), label).toBe(true);
    }
    for (const label of ["BIOL 1A — Introduction to Cell Biology", "BUSN 70 — Foundations of Business", "MATH 11 — Calculus and Analytic Geometry I"]) {
      expect(looksLikeCoreAreaLabel(label), label).toBe(false);
    }
    expect(isCtwCourseCode("engl 1a")).toBe(true);
    expect(isCtwCourseCode("ENGL 100")).toBe(false);
  });
});

describe("Core is never classified as Major (professor's CTW finding)", () => {
  const sample = [pick("Biology"), pick("Psychology"), majors.find((m) => m.code === "CSE")!, ...majors.filter((m) => m.college === "LSB").slice(0, 2)];

  it.each(sample.map((m) => [m.title, m] as const))("%s: CTW and the Core areas sit under CORE, not MAJOR", (_title, major) => {
    const { tree } = treeFor(major);
    const core = tree.find((g) => g.category === "CORE")!;
    const majorGroup = tree.find((g) => g.category === "MAJOR")!;
    // CTW is a Core requirement...
    expect(core.items.map((i) => i.item.label)).toEqual(expect.arrayContaining(["Critical Thinking & Writing 1", "Critical Thinking & Writing 2"]));
    expect(core.items.filter((i) => i.item.phase).map((i) => i.item.phase)).toEqual(expect.arrayContaining(["Foundations", "Explorations", "Integrations"]));
    // ...and nothing in the major group is a Core area or a CTW course.
    for (const entry of majorGroup.items) {
      expect(looksLikeCoreAreaLabel(entry.item.label), entry.item.label).toBe(false);
      expect(entry.item.courses.some(isCtwCourseCode), entry.item.label).toBe(false);
      expect(entry.item.phase ?? null).toBeNull();
    }
    // Core items carry only Core stable keys; major items only the major's.
    expect(core.items.every((i) => i.stableKey.startsWith("university-core:"))).toBe(true);
    expect(majorGroup.items.every((i) => i.stableKey.startsWith(`${majorGroup.stableKey}#`))).toBe(true);
  });

  it("a Biology major's own courses are distinct from the Core", () => {
    const { tree } = treeFor(pick("Biology"));
    const core = tree.find((g) => g.category === "CORE")!;
    const majorGroup = tree.find((g) => g.category === "MAJOR")!;
    const coreKeys = new Set(core.items.map((i) => i.stableKey));
    expect(majorGroup.items.some((i) => coreKeys.has(i.stableKey))).toBe(false);
    expect(majorGroup.items.some((i) => i.item.courses.includes("BIOL 1A"))).toBe(true);
  });

  it("the audit finds no classification error across all 50 majors, and does catch one when it is planted", () => {
    const report = auditRequirements();
    expect(report.counts.classificationErrors).toBe(0);
    expect(report.findings.filter((f) => CLASSIFICATION_CODES.has(f.code))).toEqual([]);

    const { tree } = treeFor(pick("Biology"));
    const planted = tree.map((g) =>
      g.category === "MAJOR"
        ? {
            ...g,
            items: [
              ...g.items,
              { ...g.items[0]!, stableKey: `${g.stableKey}#ctw1`, item: { ...g.items[0]!.item, id: "ctw1", label: "Critical Thinking & Writing 1", courses: [], phase: null } },
              { ...g.items[0]!, stableKey: `${g.stableKey}#units`, item: { ...g.items[0]!.item, id: "units", label: "175 quarter units", description: "Minimum 175 quarter units.", courses: [] } },
            ],
          }
        : g,
    );
    const codes = auditTree(planted, "major", "Biology").findings.map((f) => f.code);
    expect(codes).toContain("core_requirement_under_major");
    expect(codes).toContain("university_rule_under_major");
  });
});

describe("Bulletin snapshots", () => {
  const snapshotPath = path.join(import.meta.dirname, "..", "..", "..", "data", "bulletin-snapshots", "2026-27.json");

  it("the committed 2026-27 snapshot is exactly what the data produces (run pnpm run snapshot:bulletin after a data change)", () => {
    const committed = readFileSync(snapshotPath, "utf8").replace(/\r\n/g, "\n");
    expect(committed).toBe(serializeSnapshot(buildBulletinSnapshot("2026-27")));
  });

  it("holds every program once with stable, unique keys and provenance", () => {
    const snap = JSON.parse(readFileSync(snapshotPath, "utf8")) as BulletinSnapshot;
    expect(Object.keys(snap.programs).length).toBe(50 + 71);
    const keys = Object.values(snap.groups).flatMap((g) => g.items.map((i) => i.stableKey));
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.values(snap.groups).every((g) => g.sourceVersion && g.lastVerified && g.category)).toBe(true);
    expect(snap.edition).toBe("2026-27");
  });

  it("diffs two editions: added, removed and changed requirements and course lists", () => {
    const a = JSON.parse(JSON.stringify(buildBulletinSnapshot("2026-27"))) as BulletinSnapshot;
    expect(isEmptyDiff(diffSnapshots(a, a))).toBe(true);
    const b = JSON.parse(JSON.stringify(a)) as BulletinSnapshot;
    b.edition = "2027-28";
    const group = Object.values(b.groups).find((g) => g.kind === "major" && g.items.length > 3)!;
    const removed = group.items.splice(0, 1)[0]!;
    group.items[0]!.courses = [...group.items[0]!.courses, "ZZZZ 1"];
    group.items[1]!.description = "Changed · 99 units";
    group.items.push({ stableKey: `${group.stableKey}#new`, label: "A new one", description: "d", courses: ["ZZZZ 2"], phase: null });
    const d = diffSnapshots(a, b);
    expect(d.requirementsRemoved.map((r) => r.stableKey)).toEqual([removed.stableKey]);
    expect(d.requirementsAdded.map((r) => r.label)).toEqual(["A new one"]);
    expect(d.requirementsChanged.find((c) => c.stableKey === group.items[0]!.stableKey)).toMatchObject({ fields: ["courses"], coursesAdded: ["ZZZZ 1"] });
    expect(d.unitTextChanged).toContain(group.items[1]!.stableKey);
    expect(d.from).toBe("2026-27");
    expect(d.to).toBe("2027-28");
  });
});

describe("a four-year plan exists for every major", () => {
  it("each of the 50 majors has a 12-quarter sequence, official (prescribed) or an example CampusVal labels as such", async () => {
    const { getGraduationPath } = await import("../../data/graduation-paths");
    const counts = { prescribed: 0, other: 0 };
    for (const m of majors) {
      const path = getGraduationPath("four_year", m.code);
      expect(path.quarters.length, `${m.title} has no four-year sequence`).toBe(12);
      if (path.sequenceTrust === "prescribed") {
        counts.prescribed += 1;
        expect(path.provenance.sourceUrl, m.title).toMatch(/^https:\/\/www\.scu\.edu\//);
      } else counts.other += 1;
    }
    // Every School of Engineering major is official; the rest are labelled examples.
    expect(counts.prescribed).toBe(8);
    expect(counts.prescribed + counts.other).toBe(50);
  });
});
