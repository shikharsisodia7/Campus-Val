import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { baselineTargets } from "./baseline-targets";

describe("baselineTargets — what `--baseline` may mark as applied without running", () => {
  const migrations = ["0000_baseline", "0001_add_table", "0002_add_column"];

  it("records ONLY the first (baseline) migration by default, so later ones stay pending and get applied", () => {
    expect(baselineTargets(migrations, false)).toEqual(["0000_baseline"]);
  });

  it("records everything only when explicitly asked (a database pushed from the current schema)", () => {
    expect(baselineTargets(migrations, true)).toEqual(migrations);
  });

  it("handles a single migration and none, without inventing entries", () => {
    expect(baselineTargets(["0000_baseline"], false)).toEqual(["0000_baseline"]);
    expect(baselineTargets([], false)).toEqual([]);
    expect(baselineTargets([], true)).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = [...migrations];
    baselineTargets(input, true).push("x");
    baselineTargets(input, false).push("y");
    expect(input).toEqual(migrations);
  });

  it("the runner really uses it: --baseline and --baseline-all are distinct flags wired to it", () => {
    const src = readFileSync(join(import.meta.dirname, "..", "migrate.ts"), "utf8");
    expect(src).toMatch(/args\.has\("--baseline-all"\)\)\s*return baseline\(folder, true\)/);
    expect(src).toMatch(/args\.has\("--baseline"\)\)\s*return baseline\(folder, false\)/);
    expect(src).toMatch(/baselineTargets\(readMigrationFiles/);
  });
});
