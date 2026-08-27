// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RequirementGroupList } from "./RequirementGroupList";
import type { ParsedProgressReportGroupsItem } from "@workspace/api-client-react";

afterEach(() => cleanup());

const GROUPS: ParsedProgressReportGroupsItem[] = [
  {
    name: "Computer Science and Engineering Major Requirements",
    requirements: [
      {
        name: "University Requirement: Must have a minimum 2.000 Cumulative GPA",
        status: "completed",
        courses: [],
      },
      {
        name: "University Requirement: Must complete 180 units",
        status: "in_progress",
        courses: [
          { code: "CSCI 10", title: "Introduction to Computer Science", units: 5, grade: "A", inCatalog: true },
          { code: "CSEN 12", title: "Abstract Data Types and Data Structures", units: 4, grade: null, inCatalog: true },
        ],
      },
      { name: "Upper Division Elective", status: "remaining", courses: [] },
    ],
  },
  {
    name: "Mathematics Minor Requirements",
    requirements: [{ name: "Minor Core Requirement", status: "needs_review", courses: [] }],
  },
];

describe("RequirementGroupList", () => {
  it("renders nothing for an empty groups array", () => {
    const { container } = render(<RequirementGroupList groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders every group's own name — never a hardcoded Core/College/Major/Minor label", () => {
    render(<RequirementGroupList groups={GROUPS} />);
    expect(screen.getByText("Computer Science and Engineering Major Requirements")).toBeTruthy();
    expect(screen.getByText("Mathematics Minor Requirements")).toBeTruthy();
  });

  it("shows a truthful completed/total count per group", () => {
    render(<RequirementGroupList groups={GROUPS} />);
    // First group: 1 of 3 requirements completed.
    expect(screen.getByText("1/3")).toBeTruthy();
    // Second group: 0 of 1 completed.
    expect(screen.getByText("0/1")).toBeTruthy();
  });

  it("renders each requirement's real status label, including 'Verify in Workday' for needs_review", () => {
    render(<RequirementGroupList groups={GROUPS} defaultOpen="all" />);
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.getByText("Remaining")).toBeTruthy();
    expect(screen.getByText("Verify in Workday")).toBeTruthy();
  });

  it("nests courses under their requirement, showing grade or an honest 'in progress' marker", () => {
    render(<RequirementGroupList groups={GROUPS} defaultOpen="all" />);
    expect(screen.getByTestId("requirement-course-0-1-0").textContent).toContain("(A)");
    expect(screen.getByTestId("requirement-course-0-1-1").textContent).toContain("(in progress)");
  });

  it("defaultOpen='none' keeps accordion content collapsed (accessible trigger present, content not expanded)", () => {
    render(<RequirementGroupList groups={GROUPS} defaultOpen="none" />);
    const trigger = screen.getByText("Computer Science and Engineering Major Requirements").closest("button");
    expect(trigger).toBeTruthy();
    expect(trigger!.getAttribute("aria-expanded")).toBe("false");
  });

  it("defaultOpen='all' expands every group's accessible trigger", () => {
    render(<RequirementGroupList groups={GROUPS} defaultOpen="all" />);
    const trigger = screen.getByText("Computer Science and Engineering Major Requirements").closest("button");
    expect(trigger!.getAttribute("aria-expanded")).toBe("true");
  });
});
