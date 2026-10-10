/**
 * Biology is the Provost-demo program: these tests pin its Bulletin structure
 * SEMANTICALLY (requirement keys, rules, counts, course sets), not its wording,
 * so a punctuation edit does not fail them but a lost theme or course does.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BIOLOGY_STRUCTURE,
  MAJOR_STRUCTURES,
  resolveMajorStructure,
  structureCourses,
  structureRequiredCount,
  type MajorStructure,
} from "./major-structures";
import { findCourse } from "./courses";

/** The structure reduced to what it means: no labels, no punctuation. */
function semantic(structure: MajorStructure) {
  return structure.sections.map((section) => ({
    section: section.key,
    requirements: section.requirements.map((req) => {
      const rule = req.rule;
      if (rule.kind === "each") return { key: req.key, kind: "each", courses: [...rule.courses].sort() };
      if (rule.kind === "alternatives") {
        return { key: req.key, kind: "alternatives", options: rule.options.map((o) => [...o.courses].sort()) };
      }
      if (rule.kind === "manual") return { key: req.key, kind: "manual", lists: rule.lists ?? [] };
      return {
        key: req.key,
        kind: "choose",
        count: rule.count,
        courses: [...new Set(rule.lists.flatMap((k) => structure.lists[k]!.courses))].sort(),
      };
    }),
  }));
}

const FIXTURE = path.join(import.meta.dirname, "..", "__fixtures__", "requirements", "biology-2026-27.semantic.json");

describe("Biology Bulletin structure (2026-27)", () => {
  it("matches the committed semantic fixture (regenerate it only after re-checking the Bulletin)", () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(semantic(BIOLOGY_STRUCTURE)).toEqual(fixture.structure);
  });

  it("keeps the major groups the Bulletin defines: foundation courses, the three themes, and the electives", () => {
    const keys = BIOLOGY_STRUCTURE.sections.flatMap((s) => s.requirements.map((r) => r.key));
    for (const k of ["biol-intro", "chemistry", "physics", "mathematics", "biol-101", "theme-cmb", "theme-eeb", "theme-mod", "electives-lab", "electives-any"]) {
      expect(keys).toContain(k);
    }
  });

  it("transcribes each Bulletin course list exactly as the Bulletin's own text states it", () => {
    // Parse "Cell and Molecular Biology (CMB): 110, 112, ..." out of the verbatim source text.
    const listed = (prefix: string): string[] => {
      const line = BIOLOGY_STRUCTURE.sourceText.find((t) => t.startsWith(prefix));
      expect(line, prefix).toBeDefined();
      const body = line!.slice(line!.indexOf(":") + 1).replace(/\*/g, "");
      let subject = "BIOL";
      return body
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => {
          const m = /^([A-Z]{3,4})\s+(\S+)$/.exec(t);
          if (m) {
            subject = m[1]!;
            return `${m[1]} ${m[2]}`;
          }
          return `${subject} ${t}`;
        });
    };
    const lists = BIOLOGY_STRUCTURE.lists;
    expect(lists.cmb!.courses).toEqual(listed("Cell and Molecular Biology (CMB)"));
    expect(lists.eeb!.courses).toEqual(listed("Ecology, Evolution and Biodiversity (EEB)"));
    expect(lists.mod!.courses).toEqual(listed("Biological Modeling (MOD)"));
    expect([...lists["jes-lab"]!.courses, ...lists["jes-lecture"]!.courses].sort()).toEqual(
      listed("Justice and Equity in Science (JES)").sort(),
    );
    expect(lists["specialty-lab"]!.courses).toEqual(listed("Specialty Courses with lab"));
    expect(lists["specialty-lecture"]!.courses).toEqual(listed("Specialty Courses (lecture only)"));
  });

  it("requires 7 upper-division courses, 5 with laboratory, plus the foundation courses", () => {
    const lab = new Set([
      ...BIOLOGY_STRUCTURE.lists.cmb!.courses,
      ...BIOLOGY_STRUCTURE.lists.eeb!.courses,
      ...BIOLOGY_STRUCTURE.lists.mod!.courses,
      ...BIOLOGY_STRUCTURE.lists["jes-lab"]!.courses,
      ...BIOLOGY_STRUCTURE.lists["specialty-lab"]!.courses,
    ]);
    const choose = BIOLOGY_STRUCTURE.sections
      .flatMap((s) => s.requirements)
      .filter((r) => r.rule.kind === "choose");
    const total = choose.reduce((n, r) => n + (r.rule.kind === "choose" ? r.rule.count : 0), 0);
    const labOnly = choose.filter(
      (r) => r.rule.kind === "choose" && r.rule.lists.every((k) => BIOLOGY_STRUCTURE.lists[k]!.courses.every((c) => lab.has(c))),
    );
    const labCount = labOnly.reduce((n, r) => n + (r.rule.kind === "choose" ? r.rule.count : 0), 0);
    expect(total).toBe(7);
    expect(labCount).toBe(5);
    // BIOL 1A-1C (3) + CHEM (5) + physics (3) + math (2) + BIOL 101 (1) + 7 upper division.
    expect(structureRequiredCount(BIOLOGY_STRUCTURE)).toBe(21);
  });

  it("names only courses that exist in the CampusVal catalog, and never BIOL 184 or 188", () => {
    const codes = structureCourses(BIOLOGY_STRUCTURE);
    expect(codes.filter((c) => !findCourse(c))).toEqual([]);
    expect(codes).not.toContain("BIOL 184");
    expect(codes).not.toContain("BIOL 188");
  });

  it("every structured major's lists are referenced and non-empty", () => {
    for (const [code, structure] of Object.entries(MAJOR_STRUCTURES)) {
      for (const list of Object.values(structure.lists)) expect(list.courses.length, `${code} ${list.key}`).toBeGreaterThan(0);
      const used = new Set(
        structure.sections.flatMap((s) => s.requirements.flatMap((r) => (r.rule.kind === "choose" ? r.rule.lists : []))),
      );
      expect([...used].sort()).toEqual(Object.keys(structure.lists).sort());
    }
  });
});

describe("resolving a structure (each course counts toward one requirement)", () => {
  const byKey = (completed: string[], planned: string[] = []) =>
    new Map(resolveMajorStructure(BIOLOGY_STRUCTURE, completed, planned).map((r) => [r.key, r]));

  it("a theme course counts for its theme, a second one from the same theme becomes an elective", () => {
    const r = byKey(["BIOL 174", "BIOL 175"]);
    expect(r.get("theme-cmb")!.satisfiedBy).toEqual(["BIOL 174"]);
    expect(r.get("theme-cmb")!.status).toBe("completed");
    expect(r.get("electives-lab")!.satisfiedBy).toEqual(["BIOL 175"]);
    expect(r.get("electives-any")!.satisfiedBy).toEqual([]);
  });

  it("lecture-only courses never satisfy the laboratory electives", () => {
    const r = byKey(["BIOL 105", "BIOL 106", "BIOL 169"]);
    expect(r.get("electives-lab")!.satisfiedBy).toEqual([]);
    expect(r.get("electives-lab")!.status).toBe("open");
    expect(r.get("electives-any")!.satisfiedBy).toEqual(["BIOL 169", "BIOL 105"]);
    expect(r.get("electives-any")!.status).toBe("completed");
  });

  it("a planned course makes a requirement planned, never completed", () => {
    const r = byKey([], ["BIOL 180"]);
    expect(r.get("theme-eeb")!.status).toBe("planned");
    expect(r.get("theme-eeb")!.satisfiedBy).toEqual([]);
    expect(r.get("theme-eeb")!.plannedBy).toEqual(["BIOL 180"]);
  });

  it("a choose rule is planned only when completed + planned reach its count", () => {
    const r = byKey(["BIOL 104"], []);
    expect(r.get("electives-lab")!.status).toBe("open");
    expect(r.get("electives-lab")!.choice!.completedCount).toBe(1);
    const r2 = byKey(["BIOL 104"], ["BIOL 116"]);
    expect(r2.get("electives-lab")!.status).toBe("planned");
  });

  it("alternatives: either physics sequence completes the requirement; a mixed set does not", () => {
    expect(byKey(["PHYS 31", "PHYS 32", "PHYS 33"]).get("physics")!.status).toBe("completed");
    expect(byKey(["PHYS 11", "PHYS 12", "PHYS 13"]).get("physics")!.status).toBe("completed");
    expect(byKey(["PHYS 11", "PHYS 32", "PHYS 13"]).get("physics")!.status).toBe("open");
    expect(byKey(["PHYS 11", "PHYS 12"], ["PHYS 13"]).get("physics")!.status).toBe("planned");
  });

  it("is deterministic and ignores spacing/case in course codes", () => {
    const a = resolveMajorStructure(BIOLOGY_STRUCTURE, ["biol  174", "CHEM 11"]);
    const b = resolveMajorStructure(BIOLOGY_STRUCTURE, ["BIOL 174", "chem 11"]);
    expect(a.map((x) => [x.key, x.status])).toEqual(b.map((x) => [x.key, x.status]));
  });
});
