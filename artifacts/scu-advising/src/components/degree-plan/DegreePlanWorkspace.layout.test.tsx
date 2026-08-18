// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Layout class regression — ensure laptop grid keeps a flexible center column
 * and compact side rails instead of fixed 320/300 sidebars.
 */
describe("DegreePlanWorkspace laptop layout classes", () => {
  const source = readFileSync(
    resolve(__dirname, "./DegreePlanWorkspace.tsx"),
    "utf8",
  );

  it("uses a three-column grid with a flexible center track", () => {
    expect(source).toMatch(/minmax\(0,\s*1fr\)/);
    expect(source).toMatch(/minmax\(210px,\s*240px\)/);
    expect(source).toMatch(/minmax\(250px,\s*280px\)/);
    expect(source).not.toMatch(/w-\[320px\]/);
    expect(source).not.toMatch(/w-\[300px\]/);
  });

  it("exposes layout test ids for QA", () => {
    expect(source).toContain('data-testid="degree-plan-layout"');
    expect(source).toContain('data-testid="degree-plan-board-column"');
    expect(source).toContain('data-testid="degree-plan-progress-column"');
  });
});

describe("DegreePlanWorkspace mobile sheet close controls", () => {
  const source = readFileSync(
    resolve(__dirname, "./DegreePlanWorkspace.tsx"),
    "utf8",
  );

  it("does not render a duplicate manual close button that can collide with sheet content", () => {
    // SheetContent already renders a built-in close (X) button at top-4
    // right-4 (see components/ui/sheet.tsx). A second, manually-positioned
    // "Close" button here previously sat at top-3 left-3 inside the right
    // (Academic Progress) sheet, directly overlapping ContextPanel's own
    // "Academic Progress Report" heading at 1024px and other tablet widths.
    expect(source).not.toMatch(/Close palette/);
    expect(source).not.toMatch(/>\s*Close\s*</);
  });
});

describe("planner laptop layout classes", () => {
  const source = readFileSync(
    resolve(__dirname, "../../pages/planner.tsx"),
    "utf8",
  );

  it("gives the calendar a flexible main column instead of 8/4 splits", () => {
    expect(source).toMatch(/minmax\(0,\s*1fr\)/);
    expect(source).not.toMatch(/xl:col-span-8/);
    expect(source).not.toMatch(/xl:col-span-4/);
    expect(source).toContain('data-testid="quarter-plan-layout"');
  });
});
