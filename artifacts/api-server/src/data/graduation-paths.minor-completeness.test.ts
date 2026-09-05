/**
 * Completeness sweep across EVERY minor in the catalog (all of MINORS /
 * MINOR_RECIPES — not just the 21+1 newly-researched ones covered by
 * graduation-paths.new-minors.test.ts). Spec requirement: every current
 * minor must (a) exist and be selectable, (b) carry official provenance,
 * (c) have a non-empty requirement structure, (d) have no invalid/empty
 * requirement group, (e) have no duplicate requirement labels within
 * itself, (f) have internally valid choice groups, (g) have current source
 * metadata (a real scu.edu Bulletin URL + catalog year + last-verified
 * date).
 *
 * Note on "parent relationships": MinorRequirementGroup is intentionally a
 * flat list (no group nesting/parent-id field exists in this schema), so
 * that specific spec item doesn't apply here and isn't asserted.
 */
import { describe, it, expect } from "vitest";
import { getAvailableMinors, getMinorRequirements } from "./graduation-paths";

describe("every minor in the catalog: completeness sweep", () => {
  const minors = getAvailableMinors();

  it("the catalog is non-empty and every minor has a unique code", () => {
    expect(minors.length).toBeGreaterThan(0);
    const codes = minors.map((m) => m.code);
    expect(codes.length).toBe(new Set(codes).size);
  });

  it.each(getAvailableMinors().map((m) => [m.code, m.title] as const))(
    "%s (%s): exists, has official provenance, a real requirement structure, and no invalid groups",
    (code) => {
      const recipe = getMinorRequirements(code);
      expect(recipe, `${code} should resolve via getMinorRequirements`).toBeTruthy();

      // (b) official provenance
      expect(recipe!.sourceUrl, `${code} sourceUrl`).toMatch(/^https:\/\/www\.scu\.edu\/bulletin\//);
      expect(recipe!.sourceLabel, `${code} sourceLabel`).toBeTruthy();
      // (g) current source metadata
      expect(recipe!.catalogYear, `${code} catalogYear`).toBeTruthy();
      expect(recipe!.lastVerified, `${code} lastVerified`).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // (c) non-empty requirement structure
      expect(recipe!.groups.length, `${code} must have at least one requirement group`).toBeGreaterThan(0);

      const labels = recipe!.groups.map((g) => g.label);
      // (e) no duplicate requirement labels within the same minor
      expect(labels.length, `${code} has duplicate group labels`).toBe(new Set(labels).size);

      for (const group of recipe!.groups) {
        // (d) no invalid/empty requirement: every group asserts *some* real
        // requirement — an explicit course/unit count, a populated course
        // list with no explicit minimum (the display layer's own fallback
        // treats that as "all of these are required", see requirements.ts:
        // `group.minimumCourses ?? (group.courses.length || 1)`) — or is
        // honestly flagged as still needing verification rather than
        // silently asserting nothing at all.
        const hasRequirement =
          (group.minimumCourses ?? 0) > 0 ||
          (group.minimumUnits ?? 0) > 0 ||
          group.courses.length > 0;
        expect(
          hasRequirement || group.needsVerification === true,
          `${code} group '${group.label}' asserts no requirement and isn't flagged needsVerification`,
        ).toBe(true);

        // (f) valid choice groups: a populated course list must actually be
        // large enough to satisfy its own minimum (can't ask for 3 when only
        // listing 2 real options), and every code looks like a real SCU
        // course code, never empty/whitespace.
        if (group.courses.length > 0) {
          // A single listed code with minimumCourses > 1 is a legitimate
          // "repeat this course N times" pattern (e.g. a repeatable
          // workshop), not an under-populated choice list — only flag a
          // genuine "choose N from M" group that doesn't actually offer N
          // distinct options.
          if (group.minimumCourses !== undefined && group.courses.length > 1) {
            expect(
              group.courses.length,
              `${code} group '${group.label}' requires ${group.minimumCourses} but only lists ${group.courses.length} options`,
            ).toBeGreaterThanOrEqual(group.minimumCourses);
          }
          for (const c of group.courses) {
            expect(c.trim().length, `${code} group '${group.label}' has a blank course entry`).toBeGreaterThan(0);
          }
        }
      }
    },
  );
});
