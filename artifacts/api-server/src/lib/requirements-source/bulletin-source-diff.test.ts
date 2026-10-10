import { describe, expect, it } from "vitest";
import { codesIn, majorSections, pageLines } from "./bulletin-source-text";

describe("Bulletin source diff parsing", () => {
  it("reads codes only where the text names their subject, including shorthand lists", () => {
    const { codes } = codesIn("BIOL 1A, 1B, and 1C\nCHEM 11, 12, 31, 32, and 33\nPHYS 11, 12, 13 or PHYS 31, 32, 33\nMATH 35 and 36 (recommended) or MATH 11 and 12");
    expect(codes).toEqual([
      "BIOL 1A", "BIOL 1B", "BIOL 1C",
      "CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33",
      "PHYS 11", "PHYS 12", "PHYS 13", "PHYS 31", "PHYS 32", "PHYS 33",
      "MATH 35", "MATH 36", "MATH 11", "MATH 12",
    ]);
  });

  it("never attributes a bare-number list to a subject; it counts it for a person", () => {
    const { codes, unattributedLists } = codesIn("Cell and Molecular Biology (CMB): 110, 112, 113, 115\nA GPA 2.0 minimum and 175 units");
    expect(codes).toEqual([]);
    expect(unattributedLists).toBe(1);
  });

  it("takes the major's requirement section only, up to the minor or the course listings", () => {
    const lines = pageLines(
      "<h2>Requirements for the Major</h2><ul><li>BIOL 1A, 1B</li></ul><h2>Requirements for the Minor</h2><ul><li>BIOL 2</li></ul><h2>Lower-Division Courses</h2><h3>1A. Title</h3>",
    );
    const sections = majorSections(lines);
    expect(sections.map((s) => [s.heading, s.lines])).toEqual([["Requirements for the Major", ["BIOL 1A, 1B"]]]);
  });
});
