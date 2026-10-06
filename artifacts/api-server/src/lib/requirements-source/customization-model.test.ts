/**
 * The normalized requirement tree, stable keys, the customization overlay, the
 * source configuration and the audit.
 *
 * Fixtures are deterministic and contain no student data: a University Core
 * group, a school group, a major group, a minor group, a group whose provenance
 * is unknown, a course-choice item, a units item, and a nested-looking group.
 */
import { describe, expect, it } from "vitest";
import type { StudentProfileRow } from "@workspace/db";
import { buildNormalizedRequirements } from "./index";
import {
  ACTIVE_REQUIREMENTS_SOURCE,
  requirementsSourceStatus,
  resetRequirementsBenchmarkConfig,
  resolveRequirementsBenchmarkConfig,
} from "./index";
import { normalizeRequirements, type SourceResponse } from "./normalize";
import {
  composeRequirementOverlay,
  findOrphanedCustomizations,
  type StoredCustomization,
} from "./overlay";
import { groupStableKey, itemStableKey, programNameOf, requirementFingerprint } from "./stable-keys";
import { auditPlanCustomizations, auditRequirements, auditRowsToCsv, auditTree } from "./audit";
import type { RequirementProvenance } from "./model";

const provenance = (groupId: string, kind: string, over: Partial<RequirementProvenance> = {}): RequirementProvenance => ({
  groupId,
  groupKind: kind,
  sourceType: "current_bulletin",
  sourceIdentifier: "https://example.test/bulletin",
  sourceLabel: "Fixture Bulletin",
  sourceVersion: "2099-00 Fixture Bulletin",
  academicYear: "2099-00 Fixture Bulletin",
  academicYearBasis: "stated_for_this_group",
  lastVerified: "2099-01-01",
  sourceDocumentId: null,
  sourceSection: groupId,
  sourceProgram: null,
  bulletinEdition: "2099-00",
  importedAt: null,
  provenanceStatus: "documented",
  ...over,
});

const item = (id: string, label: string, courses: string[] = [], description = `${label} (fixture)`) => ({
  id,
  label,
  description,
  courses,
  phase: null,
  status: "open",
  complete: false,
  satisfiedBy: [] as string[],
  plannedBy: [] as string[],
});

function fixtureResponse(over: { requiredCourses?: string[] } = {}) {
  const response = {
    collegeCode: "SOE",
    groups: [
      { id: "major-primary", title: "Major Requirements — Fixture Science", kind: "major", notes: [], items: [item("major-primary-fx-1", "FX 1 — Intro", ["FX 1"]), item("major-primary-fx-2", "FX 2 — Second", ["FX 2"])] },
      { id: "university-core", title: "University Core Curriculum", kind: "university_core", notes: [], items: [item("ctw1", "Critical Thinking & Writing 1", ["ENGL 1A"]), item("pathway", "Pathway", [])] },
      { id: "college-soe", title: "School of Engineering", kind: "college", notes: [], items: [item("soe-units", "Complete 180 units", [])] },
      { id: "minor-fxm", title: "Minor Requirements — Fixture Minor", kind: "minor", notes: [], items: [item("minor-FXM-1", "Choose 2 of the following — choose 2", over.requiredCourses ?? ["FX 3", "FX 4", "FX 5"])] },
      { id: "minor-unknown", title: "Minor Requirements — Unknown Source", kind: "minor", notes: [], items: [item("minor-UNK-1", "Something", [])] },
    ],
  };
  const records = [
    provenance("major-primary", "major", { academicYearBasis: "inherited_from_university_core" }),
    provenance("university-core", "university_core"),
    provenance("college-soe", "college"),
    provenance("minor-fxm", "minor"),
    provenance("minor-unknown", "minor", {
      sourceIdentifier: null,
      sourceLabel: null,
      sourceVersion: null,
      academicYear: null,
      academicYearBasis: "not_stated",
      lastVerified: null,
      provenanceStatus: "unknown",
    }),
  ];
  return { response: response as unknown as SourceResponse, records };
}

const tree = (over: Parameters<typeof fixtureResponse>[0] = {}) => {
  const { response, records } = fixtureResponse(over);
  return normalizeRequirements(response, records, "current_bulletin");
};

const stored = (over: Partial<StoredCustomization>): StoredCustomization => ({
  entryType: "source_edit",
  targetKey: "",
  groupKey: null,
  title: null,
  note: null,
  hidden: false,
  done: false,
  baseFingerprint: null,
  baseTitle: null,
  baseSourceVersion: null,
  baseSourceType: "current_bulletin",
  updatedAt: new Date("2099-01-02T00:00:00Z"),
  ...over,
});

describe("stable keys", () => {
  it("come from identifiers the source carries, never position or text order", () => {
    const t = tree();
    expect(t.map((g) => g.stableKey)).toEqual([
      "major:fixture-science",
      "university-core:soe",
      "college-soe",
      "minor-fxm",
      "minor-unknown",
    ]);
    expect(t[0]!.items.map((i) => i.stableKey)).toEqual(["major:fixture-science#fx-1", "major:fixture-science#fx-2"]);
  });

  it("do not change when the same program moves from primary to an extra major slot", () => {
    const asPrimary = groupStableKey({ id: "major-primary", kind: "major", title: "Major Requirements — Fixture Science" }, "SOE");
    const asExtra = groupStableKey({ id: "major-extra-2", kind: "major", title: "Major Requirements — Fixture Science (proposed)" }, "SOE");
    expect(asExtra).toBe(asPrimary);
    const a = itemStableKey({ id: "major-primary", kind: "major", title: "" }, asPrimary, { id: "major-primary-fx-1" });
    const b = itemStableKey({ id: "major-extra-2", kind: "major", title: "" }, asExtra, { id: "major-extra-2-fx-1" });
    expect(b).toBe(a);
  });

  it("keep the three schools' University Core apart, since their contents differ", () => {
    const g = { id: "university-core", kind: "university_core", title: "University Core Curriculum" };
    expect(new Set(["CAS", "LSB", "SOE"].map((c) => groupStableKey(g, c))).size).toBe(3);
  });

  it("strip the proposed marker when naming the program", () => {
    expect(programNameOf("Major Requirements — Fixture Science (proposed)")).toBe("Fixture Science");
  });

  it("are the same on every build of the real requirements", () => {
    const request = {
      profile: { college: "School of Engineering", major: "CSE", secondMajor: null, minor: null, additionalMajors: [], additionalMinors: [], completedCourseCodes: [] } as unknown as StudentProfileRow,
      scenarioMajors: [],
      scenarioMinors: [],
      professionalGoals: [],
      plannedCourses: [],
      primaryMajor: null,
    };
    const a = buildNormalizedRequirements(request);
    const b = buildNormalizedRequirements(request);
    const keys = (x: typeof a) => x.tree.flatMap((g) => [g.stableKey, ...g.items.map((i) => i.stableKey)]);
    expect(keys(a)).toEqual(keys(b));
    expect(new Set(keys(a)).size).toBe(keys(a).length);
  });
});

describe("the fingerprint", () => {
  const base = item("a", "FX 1 — Intro", ["FX 2", "FX 1"]);
  const fp = (i: typeof base, version: string | null = "v1") => requirementFingerprint(i, version, "current_bulletin");
  it("changes when the text, the courses, the edition or the source changes", () => {
    expect(fp({ ...base, label: "FX 1 — Renamed" })).not.toBe(fp(base));
    expect(fp({ ...base, courses: ["FX 1"] })).not.toBe(fp(base));
    expect(fp(base, "v2")).not.toBe(fp(base));
    expect(requirementFingerprint(base, "v1", "cohort_bulletin")).not.toBe(fp(base));
  });
  it("does not change when only progress changes, or the course order does", () => {
    expect(fp({ ...base, status: "completed", complete: true } as typeof base)).toBe(fp(base));
    expect(fp({ ...base, courses: ["FX 1", "FX 2"] })).toBe(fp(base));
  });
});

describe("composing the overlay", () => {
  const t = () => tree();
  const key = (n: number) => t()[0]!.items[n]!;

  it("changes nothing when there are no customizations", () => {
    const { groups, summary } = composeRequirementOverlay(t(), []);
    expect(summary).toEqual({ edited: 0, hidden: 0, custom: 0, sourceChanged: 0, orphaned: 0 });
    groups.forEach((g, i) => {
      g.items.forEach((it, j) => {
        const { stableKey: _k, ...rest } = it;
        expect(rest).toEqual(t()[i]!.items[j]!.item);
      });
    });
  });

  it("applies a title and a note without touching status, courses or completion", () => {
    const target = key(0);
    const { groups, summary } = composeRequirementOverlay(t(), [
      stored({ targetKey: target.stableKey, title: "My name for it", note: "Ask Dr. K", baseFingerprint: target.fingerprint, baseTitle: target.item.label }),
    ]);
    const shown = groups[0]!.items[0]!;
    expect(shown.label).toBe("My name for it");
    expect(shown.customization).toMatchObject({ kind: "edit", titleEdited: true, note: "Ask Dr. K", originalLabel: "FX 1 — Intro", sourceChanged: false });
    expect({ ...shown, label: "", stableKey: "", customization: undefined }).toEqual({ ...target.item, label: "", stableKey: "", customization: undefined });
    expect(summary.edited).toBe(1);
  });

  it("does not mutate the source tree it is given", () => {
    const source = t();
    const target = source[0]!.items[0]!;
    composeRequirementOverlay(source, [stored({ targetKey: target.stableKey, title: "X", baseFingerprint: target.fingerprint })]);
    expect(source[0]!.items[0]!.item.label).toBe("FX 1 — Intro");
  });

  it("hides a requirement from the student's view but keeps it in the data so it can be restored", () => {
    const target = key(1);
    const { groups, summary } = composeRequirementOverlay(t(), [stored({ targetKey: target.stableKey, hidden: true, baseFingerprint: target.fingerprint })]);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[0]!.items[1]!.customization).toMatchObject({ hidden: true });
    expect(summary.hidden).toBe(1);
  });

  it("adds a custom requirement that is always open, with no courses, marked custom", () => {
    const { groups, summary } = composeRequirementOverlay(t(), [
      stored({ entryType: "custom", targetKey: "abc", groupKey: "major:fixture-science", title: "Honors thesis", note: "n", done: true }),
    ]);
    const custom = groups[0]!.items.at(-1)!;
    expect(custom).toMatchObject({ id: "custom-abc", label: "Honors thesis", status: "open", complete: false, courses: [], autoTracked: false });
    expect(custom.customization).toMatchObject({ kind: "custom", done: true });
    expect(summary.custom).toBe(1);
  });

  it("flags an edit whose source requirement has changed, shows the updated source, and does not apply the old edit", () => {
    const before = tree();
    const target = before[3]!.items[0]!;
    const row = stored({ targetKey: target.stableKey, title: "Two from the list", hidden: true, baseFingerprint: target.fingerprint, baseTitle: target.item.label, baseSourceVersion: "2099-00 Fixture Bulletin" });
    // Source v2: the required list changed.
    const after = tree({ requiredCourses: ["FX 3", "FX 4"] });
    const { groups, summary } = composeRequirementOverlay(after, [row]);
    const shown = groups[3]!.items[0]!;
    expect(shown.label).toBe("Choose 2 of the following — choose 2");
    expect(shown.courses).toEqual(["FX 3", "FX 4"]);
    expect(shown.customization).toMatchObject({ sourceChanged: true, titleEdited: false, hidden: true, title: "Two from the list", labelAtEdit: "Choose 2 of the following — choose 2" });
    expect(summary).toMatchObject({ sourceChanged: 1, edited: 0, hidden: 0 });
  });

  it("treats a change of source provider as a changed source", () => {
    const target = key(0);
    const { summary } = composeRequirementOverlay(t(), [stored({ targetKey: target.stableKey, title: "x", baseFingerprint: target.fingerprint, baseSourceType: "cohort_bulletin" })]);
    expect(summary.sourceChanged).toBe(1);
  });

  it("reports customizations whose requirement or program is gone", () => {
    const rows = [
      stored({ targetKey: "major:fixture-science#gone", title: "a" }),
      stored({ targetKey: "major:another-program#x", title: "b" }),
      stored({ entryType: "custom", targetKey: "c1", groupKey: "minor-elsewhere", title: "c" }),
    ];
    const orphans = findOrphanedCustomizations(t(), rows);
    expect(orphans.map((o) => o.reason)).toEqual(["requirement_not_in_source", "program_not_in_plan", "program_not_in_plan"]);
    expect(composeRequirementOverlay(t(), rows).summary.orphaned).toBe(3);
  });
});

describe("the source configuration", () => {
  const registered = ["current_bulletin"] as const;
  it("uses the current source when nothing is set", () => {
    expect(resolveRequirementsBenchmarkConfig({}, registered)).toEqual({ provider: "current_bulletin", from: "default", warning: null });
    expect(resolveRequirementsBenchmarkConfig({ REQUIREMENTS_BENCHMARK_PROVIDER: "  " }, registered).warning).toBeNull();
  });
  it("accepts a provider that exists", () => {
    expect(resolveRequirementsBenchmarkConfig({ REQUIREMENTS_BENCHMARK_PROVIDER: "current_bulletin" }, registered)).toMatchObject({ provider: "current_bulletin", from: "environment", warning: null });
  });
  it("falls back to the current source, with a warning that does not echo the value, when the setting is unusable", () => {
    const junk = resolveRequirementsBenchmarkConfig({ REQUIREMENTS_BENCHMARK_PROVIDER: "totally-made-up-secret-ish" }, registered);
    expect(junk).toMatchObject({ provider: "current_bulletin", from: "default" });
    expect(junk.warning).toMatch(/not a known/);
    expect(junk.warning).not.toContain("totally-made-up");
    for (const unbuilt of ["cohort_bulletin", "degree_checksheet", "apr", "composite"]) {
      const r = resolveRequirementsBenchmarkConfig({ REQUIREMENTS_BENCHMARK_PROVIDER: unbuilt }, registered);
      expect(r.provider, unbuilt).toBe("current_bulletin");
      expect(r.warning, unbuilt).toMatch(/has not been built/);
    }
  });
  it("keeps the live status on the current source and reports it undecided", () => {
    resetRequirementsBenchmarkConfig();
    const status = requirementsSourceStatus();
    expect(status).toMatchObject({ active: ACTIVE_REQUIREMENTS_SOURCE, policyDecided: false, configuredFrom: "default", configWarning: null });
  });
});

describe("the audit", () => {
  it("covers every supported major and minor and finds no data-integrity error in the real requirements", () => {
    const report = auditRequirements();
    expect(report.counts.majors).toBeGreaterThanOrEqual(50);
    expect(report.counts.minors).toBeGreaterThanOrEqual(71);
    expect(report.counts.requirements).toBeGreaterThan(900);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.counts.missingProvenanceGroups).toBe(0);
    // Reports; never rewrites. A second run finds exactly the same things.
    const strip = (r: typeof report) => r.findings.map((f) => `${f.code}|${f.program}|${f.requirementKey}`);
    expect(strip(auditRequirements())).toEqual(strip(report));
  });

  it("no longer puts University Core area names among a major's requirements", () => {
    const leaks = auditRequirements().findings.filter((f) => f.code === "possible_category_leakage");
    expect(leaks).toEqual([]);
  });

  it("finds a duplicate id, a duplicate key, an unknown course and missing provenance in crafted data", () => {
    const { response, records } = fixtureResponse();
    const major = response.groups[0]!;
    major.items.push(item("major-primary-fx-1", "FX 1 again", ["fx 1", "Not A Course 9"]));
    major.items.push(item("major-primary-fx-3", "", []));
    const t = normalizeRequirements(response, records, "current_bulletin");
    const { findings } = auditTree(t, "major", "Fixture Science");
    const codes = new Set(findings.map((f) => f.code));
    for (const expected of ["duplicate_item_id", "duplicate_stable_key", "course_not_in_catalog", "course_code_not_normalized", "empty_label", "provenance_incomplete"]) {
      expect(codes.has(expected), expected).toBe(true);
    }
    expect(findings.find((f) => f.code === "provenance_incomplete")!.category).toBe("missing_provenance");
    expect(findings.find((f) => f.code === "duplicate_item_id")!.category).toBe("data_integrity");
  });

  it("flags a Core area name standing in a major, but not a real course whose title mentions one", () => {
    const { response, records } = fixtureResponse();
    const major = response.groups[0]!;
    major.items.push(item("major-primary-pw", "Pathway", ["Pathway"]));
    const t = normalizeRequirements(response, records, "current_bulletin");
    expect(auditTree(t, "major", "Fixture Science").findings.some((f) => f.code === "possible_category_leakage")).toBe(true);
  });

  it("reports customizations that point at a missing or changed source requirement, per plan", () => {
    const t = tree();
    const target = t[0]!.items[0]!;
    const problems = auditPlanCustomizations(t, [
      stored({ targetKey: "major:fixture-science#missing", title: "x" }),
      stored({ targetKey: target.stableKey, title: "y", baseFingerprint: "stale" }),
    ]);
    expect(problems.map((p) => p.code).sort()).toEqual(["override_missing_source", "override_source_changed"]);
  });

  it("writes CSV that survives commas, quotes and newlines", () => {
    const csv = auditRowsToCsv([
      { programType: "major", program: 'A, "B"', group: "g", groupKey: "k", requirement: "line\nbreak", requirementKey: "k#1", courses: "X 1; X 2", provider: "current_bulletin", source: "s", sourceUrl: "u", sourceVersion: "v", lastVerified: "d", provenanceStatus: "documented", warnings: "" },
    ]);
    expect(csv).toContain('"A, ""B"""');
    expect(csv).toContain('"line\nbreak"');
  });
});
