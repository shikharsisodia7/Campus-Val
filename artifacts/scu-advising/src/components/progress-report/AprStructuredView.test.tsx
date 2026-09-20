// @vitest-environment jsdom
/**
 * The shared structured APR view (used by the planning sidebar AND the APR
 * page): Workday's own grouping in planning order, completed-vs-remaining
 * that survives without color, units shown only when stated, uncertainty
 * surfaced rather than guessed, and NO grades unless explicitly asked.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ParsedProgressReport } from "@workspace/api-client-react";
import { AprStructuredView } from "./AprStructuredView";

afterEach(cleanup);

const course = (code: string, grade: string | null = "A", inCatalog = true) => ({
  code, title: `${code} title`, units: 4, grade, inCatalog,
});

function parsed(over: Partial<ParsedProgressReport> = {}): ParsedProgressReport {
  return {
    completedCourses: [{ code: "CSCI 10", title: "Intro to CS", units: 5, confidence: "high" }],
    nonCompletedCourses: [{ code: "CSEN 12", title: "Abstract Data Types", units: 4, status: "in_progress" }],
    possibleCourses: [],
    notes: [],
    summary: {
      totalUnits: { name: "University Requirement: Must complete 180 units", status: "in_progress", requiredUnits: 180, detail: "Minimum 40.0 Unit(s)", order: 3 },
      upperDivisionUnits: { name: "University Requirement: Must complete 60 upper division units", status: "remaining", requiredUnits: 60, detail: null, order: 4 },
    },
    groups: [
      { name: "Mathematics Minor Requirements", kind: "minor", order: 9, requirements: [
        { name: "Minor Core", status: "remaining", scope: "program", courses: [] },
      ] },
      { name: "Computer Science Major Requirements", kind: "major", order: 1, requirements: [
        { name: "University Requirement: Must have a minimum 2.000 Cumulative GPA", status: "completed", scope: "university", courses: [] },
        { name: "Lower Division Core", status: "completed", scope: "program", courses: [course("CSCI 10", "A"), course("XFER 1", null, false)] },
        { name: "Upper Division Elective", status: "remaining", scope: "program", courses: [] },
        { name: "Mystery row", status: "needs_review", scope: "program", sourceText: "Mystery row ???", courses: [] },
      ] },
      { name: "University Core Curriculum Requirements", kind: "core", order: 5, requirements: [
        { name: "Critical Thinking & Writing 1", status: "completed", scope: "program", courses: [course("ENGL 1A", "B+")] },
        { name: "Ethics", status: "in_progress", scope: "program", courses: [] },
      ] },
    ],
    ...over,
  } as ParsedProgressReport;
}

describe("sections and order", () => {
  it("labels University Core, then Major, then Minor, in that order, with the document's own group names", () => {
    render(<AprStructuredView parsed={parsed()} variant="sidebar" />);
    const sections = ["core", "major", "minor"].map((k) => screen.getByTestId(`apr-section-${k}`));
    expect(sections.map((s) => s.textContent)).toEqual(["University Core", "Major", "Minor"]);
    // …and they appear in the DOM in exactly that order.
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(sections[0]!, sections[1]!)).toBe(true);
    expect(follows(sections[1]!, sections[2]!)).toBe(true);
    expect(screen.getByText("Computer Science Major Requirements")).toBeTruthy();
    expect(screen.getByText("Mathematics Minor Requirements")).toBeTruthy();
    expect(screen.getByText("University Core Curriculum Requirements")).toBeTruthy();
  });

  it("shows other university requirements once, without the repeated 'University Requirement:' prefix", () => {
    render(<AprStructuredView parsed={parsed()} variant="sidebar" />);
    const uni = screen.getByTestId("apr-university-requirements");
    expect(within(uni).getByText("Must have a minimum 2.000 Cumulative GPA")).toBeTruthy();
    expect(within(uni).queryByText(/University Requirement:/)).toBeNull();
  });
});

describe("completed vs remaining (never color alone)", () => {
  it("every requirement row carries a text status label", () => {
    render(<AprStructuredView parsed={parsed()} variant="page" />);
    const labels = screen.getAllByTestId("badge-requirement-status").map((b) => b.textContent!.trim());
    for (const l of labels) expect(["Completed", "In Progress", "Remaining", "Verify in Workday"]).toContain(l);
    expect(labels).toEqual(expect.arrayContaining(["Completed", "Remaining", "In Progress", "Verify in Workday"]));
  });

  it("summarizes completed / in progress / remaining / verify counts as text", () => {
    render(<AprStructuredView parsed={parsed()} variant="sidebar" />);
    expect(screen.getByTestId("apr-tally-completed").textContent).toMatch(/Completed\s*2/);
    expect(screen.getByTestId("apr-tally-in_progress").textContent).toMatch(/In progress\s*1/);
    expect(screen.getByTestId("apr-tally-remaining").textContent).toMatch(/Remaining\s*2/);
    expect(screen.getByTestId("apr-tally-needs_review").textContent).toMatch(/Verify in Workday\s*1/);
  });

  it("'Still needed' hides completed requirements and is announced via aria-pressed", () => {
    render(<AprStructuredView parsed={parsed()} variant="sidebar" />);
    const needed = screen.getByTestId("apr-filter-needed");
    expect(needed.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(needed);
    expect(needed.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Lower Division Core")).toBeNull();
    expect(screen.getByText("Upper Division Elective")).toBeTruthy();
    expect(screen.getByText("Ethics")).toBeTruthy();
  });

  it("the sidebar opens only groups that still have something outstanding", () => {
    render(<AprStructuredView parsed={parsed()} variant="sidebar" />);
    // Minor/Major/Core all have outstanding rows here, so all open; a fully-completed group would not.
    const done = parsed({ groups: [{ name: "Finished Major Requirements", kind: "major", requirements: [{ name: "All done", status: "completed", courses: [] }] }] });
    cleanup();
    render(<AprStructuredView parsed={done} variant="sidebar" />);
    expect(screen.queryByText("All done")).toBeNull(); // collapsed
  });
});

describe("grades", () => {
  it("never renders a grade by default, in either variant", () => {
    for (const variant of ["sidebar", "page"] as const) {
      render(<AprStructuredView parsed={parsed()} variant={variant} />);
      expect(document.body.textContent).not.toMatch(/\((A|B\+)\)/);
      expect(document.body.textContent).not.toMatch(/\(in progress\)/);
      cleanup();
    }
  });

  it("renders grades only when explicitly asked (APR page toggle)", () => {
    render(<AprStructuredView parsed={parsed()} variant="page" showGrades />);
    expect(document.body.textContent).toMatch(/\(A\)/);
    expect(document.body.textContent).toMatch(/\(B\+\)/);
  });
});

describe("units — only what the report states", () => {
  it("shows total and upper-division units with Workday's own words and status", () => {
    render(<AprStructuredView parsed={parsed()} variant="sidebar" />);
    const total = screen.getByTestId("apr-units-total");
    expect(total.textContent).toMatch(/Total units/);
    expect(total.textContent).toMatch(/Workday requires 180/);
    expect(total.textContent).toMatch(/Workday shows: Minimum 40\.0 Unit\(s\)/);
    expect(within(total).getByTestId("badge-requirement-status").textContent).toMatch(/In Progress/);
    expect(screen.getByTestId("apr-units-upper").textContent).toMatch(/Upper-division units/);
  });

  it("says so — rather than inventing a figure — when the report lists no unit rows", () => {
    render(<AprStructuredView parsed={parsed({ summary: undefined })} variant="sidebar" />);
    expect(screen.getByTestId("apr-units-none").textContent).toMatch(/doesn't list a total-units/);
    expect(screen.queryByTestId("apr-units-total")).toBeNull();
  });

  it("shows cumulative credits earned only when the report printed it", () => {
    render(<AprStructuredView parsed={parsed({ summary: { creditsEarned: 31 } })} variant="sidebar" />);
    expect(screen.getByTestId("apr-units-earned").textContent).toMatch(/31/);
  });
});

describe("uncertainty is surfaced, never guessed", () => {
  it("lists rows to verify in Workday, and unmatched courses, with a link to the APR page in the sidebar", () => {
    render(<AprStructuredView parsed={parsed({ possibleCourses: [{ raw: "ZXQW 999" }] })} variant="sidebar" />);
    const review = screen.getByTestId("apr-review");
    expect(review.textContent).toMatch(/2 items to verify in Workday/);
    expect(review.textContent).toMatch(/Mystery row/);
    expect(review.textContent).toMatch(/ZXQW 999/);
    expect(review.textContent).toMatch(/isn't treating them as completed|not treating them as completed/);
    expect(within(review).getByRole("link", { name: /Review on the APR page/ })).toBeTruthy();
  });

  it("the APR page variant shows the row exactly as Workday printed it, so it can be compared", () => {
    render(<AprStructuredView parsed={parsed()} variant="page" />);
    expect(screen.getAllByText(/As printed: Mystery row \?\?\?/).length).toBeGreaterThan(0);
  });

  it("marks a course that is not in the CampusVal catalog instead of pretending it matched", () => {
    render(<AprStructuredView parsed={parsed()} variant="page" />);
    expect(screen.getByText(/not matched to the CampusVal catalog/)).toBeTruthy();
  });

  it("no review box at all when there is nothing to verify", () => {
    const clean = parsed();
    clean.groups![1]!.requirements = clean.groups![1]!.requirements.filter((r) => r.status !== "needs_review");
    render(<AprStructuredView parsed={clean} variant="sidebar" />);
    expect(screen.queryByTestId("apr-review")).toBeNull();
  });
});

describe("course lists", () => {
  it("lists completed and in-progress courses by code and title; collapsed in the sidebar, open on the page", () => {
    render(<AprStructuredView parsed={parsed()} variant="sidebar" />);
    const details = screen.getByTestId("apr-course-lists") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByTestId("apr-completed-courses").textContent).toMatch(/CSCI 10.*Intro to CS/);
    expect(within(details).getByTestId("apr-inprogress-courses").textContent).toMatch(/CSEN 12/);
    cleanup();
    render(<AprStructuredView parsed={parsed()} variant="page" />);
    expect((screen.getByTestId("apr-course-lists") as HTMLDetailsElement).open).toBe(true);
  });
});

describe("no recognizable requirement sections", () => {
  it("still shows the courses it did read and points to the original file", () => {
    render(<AprStructuredView parsed={parsed({ groups: undefined })} variant="sidebar" />);
    expect(screen.getByTestId("apr-no-groups").textContent).toMatch(/original file as the source of truth/);
    expect(screen.getByTestId("apr-course-lists")).toBeTruthy();
  });
});
