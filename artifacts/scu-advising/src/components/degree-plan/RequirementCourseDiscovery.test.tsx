// @vitest-environment jsdom
/**
 * Clicking a Core requirement in the Degree Plan / Tentative Degree Plan
 * palette used to offer only "Add placeholder" — the requirement's course list
 * is empty for every non-Leavey Core area — so it looked like there were no
 * courses. It now opens the complete catalog list for the mapped Core area,
 * and says so plainly when there is no mapping.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/course-discovery/CoreAreaCourseFinder", () => ({
  CoreAreaCourseFinder: ({ coreAreaTag, requirementLabel, onAdd }: any) => (
    <div data-testid="finder" data-tag={coreAreaTag} data-label={requirementLabel}>
      <button onClick={() => onAdd({ code: "ENGL 1A" })}>add ENGL 1A</button>
    </div>
  ),
}));

import { RequirementCourseDiscovery } from "./RequirementCourseDiscovery";

afterEach(cleanup);

const core = { id: "core", kind: "university_core", sourceUrl: "https://www.scu.edu/bulletin/core", sourceLabel: "SCU Bulletin Ch. 2" };
const item = (over: object = {}) =>
  ({ id: "ctw1", label: "Critical Thinking & Writing 1", courses: [], coreArea: { tag: "Critical Thinking & Writing", code: "CTW", courseCount: 5, catalogStatedCount: 5 }, ...over }) as any;

describe("RequirementCourseDiscovery", () => {
  it("a mapped Core requirement gets a 'Find courses' control with the CTW code and count, collapsed until used", () => {
    render(<RequirementCourseDiscovery req={item()} group={core} onAdd={vi.fn()} disabled={false} />);
    const btn = screen.getByTestId("find-courses-ctw1");
    expect(btn.textContent).toMatch(/Find courses \(CTW\)/);
    expect(btn.textContent).toMatch(/5/);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("finder")).toBeNull();
  });

  it("opens the finder for the canonical tag and adds the chosen course against THIS requirement", () => {
    const onAdd = vi.fn();
    render(<RequirementCourseDiscovery req={item()} group={core} onAdd={onAdd} disabled={false} />);
    fireEvent.click(screen.getByTestId("find-courses-ctw1"));
    expect(screen.getByTestId("find-courses-ctw1").getAttribute("aria-expanded")).toBe("true");
    const finder = screen.getByTestId("finder");
    expect(finder.getAttribute("data-tag")).toBe("Critical Thinking & Writing");
    fireEvent.click(screen.getByText("add ENGL 1A"));
    expect(onAdd).toHaveBeenCalledWith("ENGL 1A");
    // collapses again
    fireEvent.click(screen.getByTestId("find-courses-ctw1"));
    expect(screen.queryByTestId("finder")).toBeNull();
  });

  it("an area the catalog has no courses for is disabled and says so — no empty, silent panel", () => {
    render(
      <RequirementCourseDiscovery
        req={item({ id: "elsj", label: "ELSJ", coreArea: { tag: "Experiential Learning for Social Justice", code: "ELSJ", courseCount: 0, catalogStatedCount: 0 } })}
        group={core}
        onAdd={vi.fn()}
        disabled={false}
      />,
    );
    expect((screen.getByTestId("find-courses-elsj") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("no-tagging-elsj").textContent).toMatch(/no courses tagged.*Check the SCU Bulletin or Workday/);
  });

  it("a University Core requirement with NO mapping (Pathways) says CampusVal has no tagging and links to its source", () => {
    render(<RequirementCourseDiscovery req={item({ id: "pathway", label: "Pathway", coreArea: null })} group={core} onAdd={vi.fn()} disabled={false} />);
    const note = screen.getByTestId("no-mapping-pathway");
    expect(note.textContent).toMatch(/doesn't have course tagging for this requirement/);
    const link = note.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://www.scu.edu/bulletin/core");
    expect(link.getAttribute("rel")).toMatch(/noreferrer/);
  });

  it("renders nothing for a requirement that has explicit courses and no Core mapping (major requirements)", () => {
    const { container } = render(
      <RequirementCourseDiscovery req={item({ id: "m1", coreArea: null, courses: ["CSCI 10"] })} group={{ kind: "major" }} onAdd={vi.fn()} disabled={false} />,
    );
    expect(container.textContent).toBe("");
  });
});
