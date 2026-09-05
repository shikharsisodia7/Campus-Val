/**
 * Verifies the 21 newly-added minors (docs/SCU_PROGRAM_CATALOG.md) appear
 * in the catalog with real official provenance. Their exact requirement
 * structures were initially left as honest `needsVerification` placeholders
 * and have since been researched against the live SCU Bulletin and encoded
 * (see the "22 minors" closeout pass) — this file now checks that research
 * for internal consistency instead of asserting the old placeholder state.
 */
import { describe, it, expect } from "vitest";
import { getAvailableMinors, getMinorRequirements } from "./graduation-paths";

const NEW_MINOR_CODES = [
  "JOUR-MIN",
  "DFLM-MIN",
  "OBPC-MIN",
  "PWRT-MIN",
  "GEOA-MIN",
  "AFAM-MIN",
  "ASAM-MIN",
  "LATX-MIN",
  "ANIM-MIN",
  "ARTM-MIN",
  "GRDS-MIN",
  "TDTC-MIN",
  "GERO-MIN",
  "MHUM-MIN",
  "BTEC-MIN",
  "MUTH-MIN",
  "RAI-MIN",
  "HCID-MIN",
  "CNST-MIN",
  "INTB-MIN",
  "SFS-MIN",
];

const COURSE_CODE_PATTERN = /^[A-Z]{2,5} \d{1,3}[A-Z]{0,2}$/;

describe("newly-added minors", () => {
  it("all appear in getAvailableMinors", () => {
    const minors = getAvailableMinors();
    for (const code of NEW_MINOR_CODES) {
      expect(minors.find((m) => m.code === code)).toBeTruthy();
    }
  });

  it("every new minor has a real official scu.edu bulletin source URL", () => {
    for (const code of NEW_MINOR_CODES) {
      const recipe = getMinorRequirements(code);
      expect(recipe, `${code} should have a MINOR_RECIPES entry`).toBeTruthy();
      expect(recipe!.sourceUrl).toMatch(/^https:\/\/www\.scu\.edu\/bulletin\//);
    }
  });

  it("every group either lists real-looking, researched course codes, or is honestly left as needsVerification with no invented codes", () => {
    for (const code of NEW_MINOR_CODES) {
      const recipe = getMinorRequirements(code)!;
      expect(recipe.groups.length, `${code} should have at least one requirement group`).toBeGreaterThan(0);

      for (const group of recipe.groups) {
        if (group.courses.length > 0) {
          // A populated course list is asserted researched, not a
          // placeholder — it must not simultaneously claim to be unverified.
          expect(
            group.needsVerification,
            `${code} group '${group.label}' has real courses but is still marked needsVerification`,
          ).not.toBe(true);
          for (const c of group.courses) {
            expect(c, `${code} group '${group.label}' has a non-course-shaped code '${c}'`).toMatch(
              COURSE_CODE_PATTERN,
            );
          }
        } else {
          // An empty course list must be honest about being generic/unverified —
          // never silently presented as if it were a resolved, empty requirement.
          expect(
            group.needsVerification,
            `${code} group '${group.label}' has no courses and must be marked needsVerification`,
          ).toBe(true);
        }
      }
    }
  });

  it("every minor requires at least one course/unit total across its groups (no empty-shell minor)", () => {
    for (const code of NEW_MINOR_CODES) {
      const recipe = getMinorRequirements(code)!;
      const total = recipe.groups.reduce(
        (sum, g) => sum + (g.minimumCourses ?? 0) + (g.minimumUnits ?? 0),
        0,
      );
      expect(total, `${code} should require at least one course or unit`).toBeGreaterThan(0);
    }
  });
});
