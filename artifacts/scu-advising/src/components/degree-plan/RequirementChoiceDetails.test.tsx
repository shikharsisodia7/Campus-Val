// @vitest-environment jsdom
/**
 * A requirement's full course list, as the Bulletin groups it: nothing hidden
 * behind a "+N more" that cannot be opened, counted courses said in words.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Course, RequirementItem } from "@workspace/api-client-react";
import { RequirementChoiceDetails, choiceSummary, countedLine, hasCourseList } from "./RequirementChoiceDetails";

afterEach(cleanup);

const catalog = [
  { code: "BIOL 110", title: "Genetics L&L", units: 5 },
  { code: "BIOL 174", title: "Cell Biology L&L", units: 5 },
  { code: "BIOL 175", title: "Molecular Biology L&L", units: 5 },
  { code: "PHYS 11", title: "General Physics I", units: 5 },
] as unknown as Course[];

const theme: RequirementItem = {
  id: "major-primary-theme-cmb",
  label: "Cell and Molecular Biology (CMB) theme",
  description: "One CMB theme course, with laboratory.",
  courses: ["BIOL 110", "BIOL 174", "BIOL 175", "BIOL 999"],
  autoTracked: true,
  needsVerification: false,
  satisfiedBy: ["BIOL 174"],
  plannedBy: [],
  complete: true,
  status: "completed",
  section: "Upper-division themes — one course from each, all with laboratory",
  choice: {
    kind: "choose",
    minimum: 1,
    completedCount: 1,
    plannedCount: 0,
    lists: [{ key: "cmb", label: "Theme: Cell and Molecular Biology (CMB)", note: null, courses: ["BIOL 110", "BIOL 174", "BIOL 175", "BIOL 999"] }],
    alternatives: [],
  },
};

describe("RequirementChoiceDetails", () => {
  it("says when the courses must come from several lists, and caps a list", () => {
    const areas: RequirementItem = {
      ...theme,
      id: "major-primary-technical-electives-areas",
      satisfiedBy: ["ECEN 116"],
      choice: {
        kind: "choose",
        minimum: 4,
        minDistinctLists: 4,
        completedCount: 1,
        plannedCount: 0,
        lists: [
          { key: "ic", label: "IC Design", note: null, courses: ["ECEN 116"], max: null },
          { key: "sub", label: "Substitutes", note: null, courses: ["CSEN 79"], max: 1 },
        ],
        alternatives: [],
      },
    };
    expect(choiceSummary(areas)).toBe("Choose 4 from at least 4 of the lists · 1 of 4 completed");
    render(<RequirementChoiceDetails req={areas} catalog={catalog} />);
    fireEvent.click(screen.getByTestId(`toggle-course-list-${areas.id}`));
    expect(within(screen.getByTestId(`course-list-${areas.id}-sub`)).getByText(/at most 1/)).toBeTruthy();
  });

  it("summarises a choice in words", () => {
    expect(choiceSummary(theme)).toBe("Choose 1 · 1 of 1 completed");
    expect(countedLine(theme)).toBe("Counted here: BIOL 174 (completed)");
    expect(hasCourseList(theme)).toBe(true);
  });

  it("opens the full named list with titles, says what is counted, and adds a course", () => {
    const onAdd = vi.fn();
    render(<RequirementChoiceDetails req={theme} catalog={catalog} onAdd={onAdd} plannedCourses={new Set(["BIOL 175"])} />);
    expect(screen.queryByTestId(`course-list-${theme.id}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`toggle-course-list-${theme.id}`));
    const list = screen.getByTestId(`course-list-${theme.id}-cmb`);
    expect(within(list).getByText("Theme: Cell and Molecular Biology (CMB)")).toBeTruthy();
    const row = (code: string) => list.querySelector<HTMLElement>(`[data-course="${code}"]`)!;
    expect(row("BIOL 174").textContent).toMatch(/Counted \(completed\)/);
    expect(row("BIOL 175").textContent).toMatch(/In this plan/);
    expect(row("BIOL 999").textContent).toMatch(/Not in CampusVal's course catalog/);
    fireEvent.click(within(row("BIOL 110")).getByRole("button", { name: "Add BIOL 110 to the plan" }));
    expect(onAdd).toHaveBeenCalledWith("BIOL 110");
    // Nothing to add for a counted, planned or unknown course.
    expect(within(row("BIOL 174")).queryByRole("button")).toBeNull();
    expect(within(row("BIOL 999")).queryByRole("button")).toBeNull();
  });

  it("shows the options of an alternatives rule, recommended marked", () => {
    const physics: RequirementItem = {
      ...theme,
      id: "major-primary-mathematics",
      courses: ["PHYS 11"],
      satisfiedBy: [],
      choice: {
        kind: "alternatives",
        minimum: null,
        completedCount: 0,
        plannedCount: 0,
        lists: [],
        alternatives: [
          { label: "MATH 35 and 36", courses: ["PHYS 11"], recommended: true },
          { label: "MATH 11 and 12", courses: [], recommended: false },
        ],
      },
    };
    render(<RequirementChoiceDetails req={physics} catalog={catalog} />);
    expect(screen.getByTestId(`choice-summary-${physics.id}`).textContent).toBe("Complete one: MATH 35 and 36 or MATH 11 and 12");
    fireEvent.click(screen.getByTestId(`toggle-course-list-${physics.id}`));
    expect(screen.getByText("Option 1: MATH 35 and 36 (recommended)")).toBeTruthy();
  });

  it("gives a plain long course list an opener too", () => {
    const flat: RequirementItem = { ...theme, choice: null, courses: ["A 1", "A 2", "A 3", "A 4", "A 5", "A 6"] };
    expect(hasCourseList(flat)).toBe(true);
    render(<RequirementChoiceDetails req={flat} catalog={catalog} />);
    expect(screen.getByTestId(`toggle-course-list-${flat.id}`).textContent).toMatch(/Show all 6 eligible courses/);
  });
});
