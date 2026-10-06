/**
 * Product terminology guard (professor review, 2026-09): the product says
 * "Degree Plan" and "Tentative Degree Plan" — never "Tentative Plan",
 * "Tentative Planning", "Degree Planner", "Official Degree Plan", or a
 * misspelling of "Tentative".
 *
 * Source is whitespace-collapsed before matching, because JSX often splits a
 * label across lines ("Tentative\n  Plan") and a line-based grep misses it —
 * that is exactly how "Official Degree Plan" once survived an earlier sweep.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "assets" ? [] : walk(p);
    return /\.(tsx?|json|html)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

const BANNED: [RegExp, string][] = [
  [/Tentative\s+Plans?\b/g, '"Tentative Plan" — say "Tentative Degree Plan"'],
  [/Tentative\s+Planning\b/g, '"Tentative Planning" — say "Tentative Degree Plan"'],
  [/Degree\s+Planner\b/g, '"Degree Planner" — say "Degree Plan"'],
  [/Degree\s+Planning\s+Plan\b/g, '"Degree Planning Plan"'],
  [/Official\s+Degree\s+Plan\b/g, '"Official Degree Plan" — CampusVal is not the official record'],
];

/** Levenshtein distance — tiny, only used to catch near-misses of "tentative". */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}

describe("plan terminology", () => {
  const files = walk(SRC);
  const violations: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8").replace(/\s+/g, " ");
    for (const [re, why] of BANNED) {
      for (const m of text.matchAll(re)) {
        violations.push(`${relative(SRC, file)}: ${why} → "${m[0]}"`);
      }
    }
    // Near-misses of the word itself ("Tenative", "Tentitive", "Tentaive"…).
    for (const m of text.matchAll(/\b[Tt][A-Za-z]{5,9}\b/g)) {
      const w = m[0].toLowerCase();
      if (w === "tentative" || w === "tentatively") continue;
      if (distance(w, "tentative") <= 2) {
        violations.push(`${relative(SRC, file)}: misspelling of Tentative → "${m[0]}"`);
      }
    }
  }

  it("uses the canonical Degree Plan / Tentative Degree Plan names everywhere", () => {
    expect(violations).toEqual([]);
  });

  it("the guard itself catches a near-miss (so a silent regex mistake can't make it vacuous)", () => {
    expect(distance("tenative", "tentative")).toBe(1);
    expect(distance("tentitive", "tentative")).toBe(1);
    expect(distance("tentative", "tentative")).toBe(0);
    expect(distance("tentacle", "tentative")).toBeGreaterThan(2);
  });

  it("has the two canonical labels in the pilot navigation", () => {
    const nav = readFileSync(join(SRC, "lib", "pilot-features.ts"), "utf8");
    expect(nav).toContain('label: "Degree Plan"');
    expect(nav).toContain('label: "Tentative Degree Plan"');
  });
});

describe("plan terminology outside the web app", () => {
  // The professor kept seeing the label wrong, so the same guard covers every
  // surface that can put words in front of a student: the API (error messages,
  // default plan names), the mobile app, and the product docs.
  const ROOT = join(SRC, "..", "..", "..");
  const surfaces = [
    join(ROOT, "artifacts", "api-server", "src"),
    join(ROOT, "artifacts", "campusval-mobile", "app"),
    join(ROOT, "artifacts", "campusval-mobile", "components"),
    join(ROOT, "artifacts", "campusval-mobile", "lib"),
  ];
  function walkAll(dir: string): string[] {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    return entries.flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return ["node_modules", "dist", "data", "assets", ".expo"].includes(name) ? [] : walkAll(p);
      return /\.(tsx?|md)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
    });
  }

  it("never says Tentative Plan, Plan Tentative or misspells Tentative", () => {
    const found: string[] = [];
    for (const file of surfaces.flatMap(walkAll)) {
      const text = readFileSync(file, "utf8").replace(/\s+/g, " ");
      for (const [re, why] of BANNED) for (const m of text.matchAll(re)) found.push(`${relative(ROOT, file)}: ${why} → "${m[0]}"`);
      for (const m of text.matchAll(/Plan\s+Tentative\b/g)) found.push(`${relative(ROOT, file)}: "Plan Tentative" → "${m[0]}"`);
      for (const m of text.matchAll(/\b[Tt][A-Za-z]{5,9}\b/g)) {
        const w = m[0].toLowerCase();
        if (w !== "tentative" && w !== "tentatively" && distance(w, "tentative") <= 2) found.push(`${relative(ROOT, file)}: misspelling of Tentative → "${m[0]}"`);
      }
    }
    expect(found).toEqual([]);
  });
});
