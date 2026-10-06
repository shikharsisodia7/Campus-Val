/**
 * ONE Planning Requirements sidebar and ONE compact APR sidebar.
 *
 * The cross-reference model only holds if Degree Plan, Tentative Degree Plan, Degree
 * Checksheets and the Academic Progress Report page show the SAME requirements for the
 * same plan. That is true by construction, and this guard keeps it true:
 *
 *   - the sidebar (`Palette`) is mounted only by the two workspaces, and both get their
 *     plan and requirements from `usePlanningWorkspace`, so they read and refresh the same
 *     query keys (a note saved from a checksheet appears on every page at once);
 *   - nothing else fetches plan requirements, so no page can hold a drifting copy;
 *   - the column widths live in `workspace-layout.ts`, not in a page;
 *   - the full APR page does not also mount the compact APR sidebar.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "generated" ? [] : walk(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
const FILES = walk(SRC).map((p) => ({ path: relative(SRC, p).replace(/\\/g, "/"), text: readFileSync(p, "utf8").replace(/\r\n/g, "\n") }));
const filesMatching = (re: RegExp) => FILES.filter((f) => re.test(f.text)).map((f) => f.path);

describe("one Planning Requirements sidebar", () => {
  it("is mounted only by the two planning workspaces, and both use the shared planning hook", () => {
    const mounts = filesMatching(/<Palette\s*\/>/);
    expect([...new Set(mounts)].sort()).toEqual(["components/degree-plan/DegreePlanWorkspace.tsx", "components/degree-plan/PlanningComparisonWorkspace.tsx"]);
    for (const path of new Set(mounts)) {
      expect(FILES.find((f) => f.path === path)!.text, path).toMatch(/usePlanningWorkspace\(/);
    }
  });

  it("is the only thing that fetches a plan's requirements, so no page keeps its own copy", () => {
    expect(filesMatching(/useGetPlanRequirements\(/)).toEqual(["components/degree-plan/usePlanningWorkspace.ts"]);
  });

  it("takes its column widths from the shared layout tokens, not from a page", () => {
    for (const path of ["components/degree-plan/DegreePlanWorkspace.tsx", "components/degree-plan/PlanningComparisonWorkspace.tsx"]) {
      expect(FILES.find((f) => f.path === path)!.text, path).toMatch(/from "@\/lib\/workspace-layout"/);
    }
    expect(filesMatching(/grid-cols-\[minmax\(260px,320px\)/)).toEqual(["lib/workspace-layout.ts"]);
  });
});

describe("one compact APR sidebar", () => {
  it("is the same WorkdayAprPanel on Degree Plan, Quarter Planning and Degree Checksheets", () => {
    expect(filesMatching(/<WorkdayAprPanel\s*\/>/).sort()).toEqual([
      "components/degree-plan/ContextPanel.tsx",
      "components/degree-plan/PlanningComparisonWorkspace.tsx",
      "pages/planner.tsx",
    ]);
  });

  it("is not mounted by the full APR page: its whole center already is the APR", () => {
    const page = FILES.find((f) => f.path === "pages/progress-report.tsx")!.text;
    expect(page).not.toMatch(/WorkdayAprPanel|AprReferenceSheet/);
    expect(page).toMatch(/showCompactApr=\{false\}/);
  });
});
