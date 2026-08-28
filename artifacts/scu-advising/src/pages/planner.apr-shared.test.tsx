import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression coverage for the professor's "this window should look just
 * like the same window each time" correction: Quarter Plan's right column
 * used to render a divergent legacy panel (AcademicProgress +
 * ProgressReportSection) with its own CampusVal-computed progress summary
 * and its own upload flow, instead of the same WorkdayAprPanel used on
 * Degree Plan and Tentative Degree Plan.
 *
 * Full component rendering isn't exercised here (planner.tsx pulls in a lot
 * of scheduling context); this locks in the specific regression via source
 * inspection, which is enough to catch a re-introduction of the divergent
 * panel or a stray import of the deleted legacy components.
 */
const plannerSource = readFileSync(
  join(import.meta.dirname, "planner.tsx"),
  "utf-8",
);

describe("Quarter Plan APR panel matches Degree Plan / Tentative Degree Plan", () => {
  it("imports and renders the shared WorkdayAprPanel", () => {
    expect(plannerSource).toMatch(
      /import\s*{\s*WorkdayAprPanel\s*}\s*from\s*"@\/components\/progress-report\/WorkdayAprPanel"/,
    );
    expect(plannerSource).toMatch(/<WorkdayAprPanel\s*\/>/);
  });

  it("no longer imports the divergent legacy AcademicProgress panel", () => {
    expect(plannerSource).not.toMatch(/AcademicProgress/);
  });

  it("deleted the orphaned legacy components entirely, not just stopped importing them", () => {
    const componentsDir = join(import.meta.dirname, "../components");
    expect(existsSync(join(componentsDir, "AcademicProgress.tsx"))).toBe(false);
    expect(existsSync(join(componentsDir, "ProgressReportSection.tsx"))).toBe(false);
  });
});
