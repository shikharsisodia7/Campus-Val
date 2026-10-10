/**
 * A note or edit saved on a requirement key from before its major was restructured ("MATH 11 was its
 * own item") follows the course to the requirement that now holds it. Production has department notes
 * on such keys (Chemistry B.A. math-11/math-12, Mathematics math-101, Public Health chem-11).
 */
import { describe, expect, it } from "vitest";
import { currentTargetKey } from "./stable-keys";
import { programTree } from "../department/programs";

const candidates = [
  { stableKey: "major:x#mathematics", courses: ["MATH 11", "MATH 12", "MATH 35"], variant: null },
  { stableKey: "major:x#chem-12", courses: ["CHEM 12"], variant: null },
  { stableKey: "major:x#electives", courses: ["CHEM 12", "CHEM 150"], variant: null },
  { stableKey: "major:x#track-a-chem-31", courses: ["CHEM 31"], variant: "a" },
  { stableKey: "major:y#math-11", courses: ["MATH 11"], variant: null },
];

describe("currentTargetKey", () => {
  it("keeps a key that still exists", () => {
    expect(currentTargetKey("major:x#chem-12", candidates)).toBe("major:x#chem-12");
  });
  it("follows a course to the choice that now holds it, inside the same program only", () => {
    expect(currentTargetKey("major:x#math-11", candidates)).toBe("major:x#mathematics");
    expect(currentTargetKey("major:z#math-11", candidates)).toBe("major:z#math-11");
  });
  it("prefers the course's own requirement, then a shared requirement over a track's", () => {
    expect(currentTargetKey("major:x#chem-31", candidates)).toBe("major:x#track-a-chem-31");
  });
  it("leaves a key that is not a course, or a course nothing holds, unchanged", () => {
    expect(currentTargetKey("major:x#capstone", candidates)).toBe("major:x#capstone");
    expect(currentTargetKey("major:x#hist-11a", candidates)).toBe("major:x#hist-11a");
  });

  it("maps the production notes' keys onto the restructured majors", () => {
    const keysOf = (program: string) =>
      programTree(program)!.tree.flatMap((g) =>
        g.items.map((e) => ({ stableKey: e.stableKey, courses: e.item.courses, variant: (e.item as { variant?: string | null }).variant ?? null })),
      );
    const chemBa = keysOf("major:chemistry-b-a");
    expect(currentTargetKey("major:chemistry-b-a#math-11", chemBa)).toBe("major:chemistry-b-a#mathematics");
    expect(currentTargetKey("major:chemistry-b-a#math-12", chemBa)).toBe("major:chemistry-b-a#mathematics");
    expect(currentTargetKey("major:mathematics#math-101", keysOf("major:mathematics"))).toBe("major:mathematics#geometry-discrete-applied");
    expect(currentTargetKey("major:public-health-science#chem-11", keysOf("major:public-health-science"))).toBe(
      "major:public-health-science#health-science-chem-11",
    );
    // Unchanged keys stay put.
    for (const [program, key] of [
      ["major:philosophy", "major:philosophy#phil-14"],
      ["major:neuroscience", "major:neuroscience#biol-1b"],
      ["major:communication", "major:communication#comm-100"],
      ["major:anthropology", "major:anthropology#anth-110"],
      ["major:psychology", "major:psychology#math-8"],
    ] as const) {
      expect(currentTargetKey(key, keysOf(program))).toBe(key);
    }
  });
});
