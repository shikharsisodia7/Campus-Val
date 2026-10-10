/**
 * Every major is transcribed from the 2026-27 Bulletin (data/majors/*.ts). These tests hold each
 * transcription to its source: every course it names is named by the Bulletin text kept beside it,
 * every course it names exists in CampusVal's catalog (or is listed below with the reason it does not),
 * and its rules are well formed (lists used and non-empty, keys unique, tracks complete).
 */
import { describe, expect, it } from "vitest";
import {
  MAJOR_STRUCTURES,
  coursesOfList,
  exampleSelection,
  resolveMajorStructure,
  structureCourses,
  type MajorStructure,
} from "./major-structures";
import { findCourse } from "./courses";
import { getAvailableMajors } from "./graduation-paths";
import { codesNamedIn } from "../lib/requirements-source/bulletin-source-text";

/**
 * Courses a major's Bulletin requirement text names that CampusVal's catalog does not have after
 * `import:bulletin-courses`: the Bulletin's 2026-27 course listings either do not list them or do not
 * let their subject be confirmed without guessing (a number listed on several pages, a combined
 * heading, a seminar section such as "199R"). A structure still names them (the Bulletin does); the
 * sidebar shows them by code and says they are not in the catalog. A NEW missing code fails the test.
 */
const NOT_IN_CATALOG = new Set([
  "ANTH 113", "ANTH 12A", "ANTH 159", "ANTH 184", "ANTH 187", "ANTH 86", "ANTH 90", "BIOE 140",
  "BIOE 141", "BIOE 181", "BIOL 114", "BIOL 123A", "CENG 192C", "CHST 190", "COMM 130A", "COMM 140B",
  "COMM 140C", "COMM 140Q", "COMM 140W", "COMM 151A", "COMM 176A", "COMM 181A", "COMM 199I", "COMM 199R",
  "CSEN 21", "ELSJ 50", "ELSJ 51", "ENGL 35G", "ENGL 69AM", "ENGR 193", "ENGR 197B", "ENGR 197C",
  "ENGR 197D", "ENVS 12A", "ENVS 15", "ETHN 101", "ETHN 154A", "ETHN 177", "ETHN 35", "GNSX 112",
  "GNSX 11A", "GNSX 126", "GNSX 12A", "GNSX 149", "GNSX 149R", "GNSX 1A", "GNSX 2A", "GNSX 50",
  "HIST 114C", "HIST 115S", "HIST 116", "HIST 176", "HIST 179A", "MECH 10", "MGMT 168", "MKTG 194",
  "MUSC 20", "PHIL 170", "PHIL 187B", "PHIL 27", "PHIL 30H", "PHYS 171", "POLI 138", "POLI 153",
  "PSYC 105", "PSYC 199A", "SCTR 111R", "SOCI 172", "TESP 119R", "TESP 124R", "TESP 131R", "TESP 157",
  "TESP 185", "TESP 185R", "TESP 196", "TESP 196R", "THTR 14",
]);

const entries = Object.entries(MAJOR_STRUCTURES);

function listKeysUsed(structure: MajorStructure): Set<string> {
  return new Set(
    structure.sections.flatMap((s) =>
      s.requirements.flatMap((r) => (r.rule.kind === "choose" ? r.rule.lists : r.rule.kind === "manual" ? (r.rule.lists ?? []) : [])),
    ),
  );
}

describe("every major has a Bulletin structure", () => {
  it("records as missing only codes a structure still names and the catalog still lacks", () => {
    const named = new Set(entries.flatMap(([, s]) => structureCourses(s)));
    expect([...NOT_IN_CATALOG].filter((c) => !named.has(c) || findCourse(c))).toEqual([]);
  });

  it("covers every major CampusVal offers", () => {
    const missing = getAvailableMajors()
      .map((m) => m.code)
      .filter((code) => !MAJOR_STRUCTURES[code]);
    expect(missing).toEqual([]);
  });
});

describe.each(entries)("%s Bulletin structure", (code, structure) => {
  it("names only courses its Bulletin text names", () => {
    const named = codesNamedIn([...structure.sourceText, ...(structure.listingText ?? [])], structure.defaultSubject);
    const corrected = structure.sourceCorrections ?? {};
    const notNamed = structureCourses(structure).filter((c) => !named.has(c) && !corrected[c]);
    expect(notNamed).toEqual([]);
  });

  it("names only courses in the catalog, or ones recorded as missing with a reason", () => {
    const missing = structureCourses(structure).filter((c) => !findCourse(c) && !NOT_IN_CATALOG.has(c));
    expect(missing).toEqual([]);
  });

  it("uses every course list it defines, and each holds courses", () => {
    const used = listKeysUsed(structure);
    expect([...used].sort()).toEqual(Object.keys(structure.lists).sort());
    for (const l of Object.values(structure.lists)) expect(coursesOfList(l).length, `${code} ${l.key}`).toBeGreaterThan(0);
  });

  it("gives every requirement a unique key, across every track", () => {
    const keys = resolveMajorStructure(structure, [], [], { allVariants: true }).map((r) => r.key);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it("places every track section under a declared track, and every track has sections", () => {
    const declared = new Set(structure.variants?.options.map((o) => o.key) ?? []);
    const used = new Set(structure.sections.map((s) => s.variant).filter((v): v is string => !!v));
    expect([...used].filter((v) => !declared.has(v))).toEqual([]);
    expect([...declared].filter((v) => !used.has(v))).toEqual([]);
  });

  it("keeps the Bulletin's text and source", () => {
    expect(structure.sourceText.length).toBeGreaterThan(0);
    expect(structure.sourceUrl).toMatch(/^https:\/\/www\.scu\.edu\/bulletin\/undergraduate\//);
    expect(structure.catalogYear).toBe("2026-27");
  });

  it("builds a four-year example only from catalog courses the structure names or ranges", () => {
    const { lowerDiv, upperDiv } = exampleSelection(structure);
    for (const c of [...lowerDiv, ...upperDiv]) expect(findCourse(c), `${code} ${c}`).toBeDefined();
  });
});
