import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression coverage for the reported production bug: clicking an intended
 * course (e.g. MATH 11) in Quarter Plan appeared to do nothing. Root cause —
 * the intended-course chip was `disabled` whenever the focused quarter had
 * no schedule yet (the default state the very first time a student opens a
 * quarter), and Find Courses itself only renders once a schedule exists, so
 * the click target effectively didn't exist. Full render coverage isn't
 * practical here (planner.tsx pulls in a lot of scheduling/query context);
 * source inspection is enough to catch a regression back to the disabled
 * state or the fabricated-section-number duplicate handoff panel.
 */
const plannerSource = readFileSync(
  join(import.meta.dirname, "planner.tsx"),
  "utf-8",
);

describe("Quarter Plan: clicking an intended course always does something", () => {
  it("never disables the intended-course chip based on whether a schedule exists yet", () => {
    expect(plannerSource).not.toMatch(/disabled=\{!hasActiveSchedule\}/);
    expect(plannerSource).not.toMatch(/hasActiveSchedule/);
  });

  it("auto-creates a schedule on click when the focused quarter has none, instead of no-oping", () => {
    expect(plannerSource).toMatch(/handleFindSections/);
    expect(plannerSource).toMatch(/useCreateSchedule/);
    expect(plannerSource).toMatch(/onFindSections=\{handleFindSections\}/);
  });

  it("deleted the orphaned duplicate Workday-handoff component that fabricated section numbers for tentative schedules", () => {
    const componentsDir = join(import.meta.dirname, "../components/schedule-planner");
    expect(existsSync(join(componentsDir, "RegistrationSummary.tsx"))).toBe(false);
  });
});
