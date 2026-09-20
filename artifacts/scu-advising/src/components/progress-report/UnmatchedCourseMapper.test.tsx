// @vitest-environment jsdom
/**
 * "Match this unrecognized item to a catalog course" (the professor's optional
 * feature): the interaction, its guard rails, and what it shows.
 *
 * The rules under test: a mapping is the STUDENT'S note (labelled as such, never
 * as Workday's), the picker only offers what the catalog search returns, a
 * failure is shown and leaves the picker open, and nothing is saved until a
 * catalog course is explicitly chosen.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ParsedProgressReport } from "@workspace/api-client-react";

const upsert = vi.fn();
const del = vi.fn();
const reset = vi.fn();
const state = { upsertError: null as unknown, searchError: false };
const searched: string[] = [];

const CATALOG = [
  { code: "ENGL 1A", title: "Critical Thinking and Writing I", units: 4, coreAreas: [], sectionsThisQuarter: null },
  { code: "ENGL 1B", title: "Critical Thinking and Writing II", units: 4, coreAreas: [], sectionsThisQuarter: null },
];

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useSearchCourses: (params: { q: string }, opts: { query: { enabled: boolean } }) => {
      if (opts.query.enabled) searched.push(params.q);
      return {
        data: opts.query.enabled
          ? { courses: CATALOG.filter((c) => `${c.code} ${c.title}`.toLowerCase().includes(params.q.toLowerCase())), hasMore: false }
          : undefined,
        isFetching: false,
        isError: state.searchError,
      };
    },
    useUpsertProgressReportMapping: () => ({ mutateAsync: upsert, isPending: false, error: state.upsertError, reset }),
    useDeleteProgressReportMapping: () => ({ mutateAsync: del, isPending: false, error: null, reset }),
    useListProgressReportMappings: () => ({ data: { mappings: [] } }),
  };
});

import { UnmatchedCourseMapper } from "./UnmatchedCourseMapper";
import { AprStructuredView } from "./AprStructuredView";

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({});
  del.mockReset().mockResolvedValue({ deleted: true });
  reset.mockReset();
  state.upsertError = null;
  state.searchError = false;
  searched.length = 0;
});
afterEach(cleanup);

describe("UnmatchedCourseMapper — matching an item", () => {
  it("offers a labelled button; nothing is searched or saved until the student chooses to", () => {
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" />);
    const open = screen.getByRole("button", { name: "Match ENGL 2A to a catalog course" });
    expect(open.textContent).toBe("Match to a catalog course");
    expect(screen.queryByTestId("catalog-course-picker")).toBeNull();
    expect(searched).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("opens a labelled search, needs two characters, then lists ONLY catalog results", async () => {
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" />);
    fireEvent.click(screen.getByTestId("mapper-open-ENGL-2A"));
    const input = screen.getByLabelText("Which catalog course is ENGL 2A?");
    expect(screen.getByTestId("catalog-picker-status").textContent).toMatch(/at least two characters/);
    fireEvent.change(input, { target: { value: "E" } });
    await new Promise((r) => setTimeout(r, 350));
    expect(searched).toEqual([]); // one character never triggers a search

    fireEvent.change(input, { target: { value: "engl" } });
    const results = await screen.findByTestId("catalog-picker-results");
    expect(within(results).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "ENGL 1ACritical Thinking and Writing I4 units",
      "ENGL 1BCritical Thinking and Writing II4 units",
    ]);
    expect(screen.getByTestId("catalog-picker-status").textContent).toBe("2 matches.");
  });

  it("debounces: a burst of typing sends one search for the final text", async () => {
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" />);
    fireEvent.click(screen.getByTestId("mapper-open-ENGL-2A"));
    const input = screen.getByLabelText("Which catalog course is ENGL 2A?");
    for (const v of ["en", "eng", "engl", "engl 1"]) fireEvent.change(input, { target: { value: v } });
    await screen.findByTestId("catalog-picker-results");
    expect(new Set(searched)).toEqual(new Set(["engl 1"]));
  });

  it("choosing a result saves exactly that course for exactly that report code, then closes", async () => {
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" />);
    fireEvent.click(screen.getByTestId("mapper-open-ENGL-2A"));
    fireEvent.change(screen.getByLabelText("Which catalog course is ENGL 2A?"), { target: { value: "engl 1b" } });
    fireEvent.click(await screen.findByTestId("catalog-picker-result-ENGL-1B"));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledWith({ rawCode: "ENGL 2A", data: { courseCode: "ENGL 1B" } });
    await waitFor(() => expect(screen.queryByTestId("catalog-course-picker")).toBeNull());
  });

  it("says when nothing in the catalog matches, and cancel saves nothing", async () => {
    wrap(<UnmatchedCourseMapper raw="TESP 4" />);
    fireEvent.click(screen.getByTestId("mapper-open-TESP-4"));
    fireEvent.change(screen.getByLabelText("Which catalog course is TESP 4?"), { target: { value: "zzzz" } });
    await waitFor(() => expect(screen.getByTestId("catalog-picker-status").textContent).toMatch(/No catalog course matches/));
    fireEvent.click(screen.getByTestId("catalog-picker-cancel"));
    expect(screen.queryByTestId("catalog-course-picker")).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("a failed save is announced, keeps the picker open for a retry, and never claims success", async () => {
    upsert.mockRejectedValue(new Error("boom"));
    state.upsertError = new Error("boom");
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" />);
    fireEvent.click(screen.getByTestId("mapper-open-ENGL-2A"));
    fireEvent.change(screen.getByLabelText("Which catalog course is ENGL 2A?"), { target: { value: "engl 1a" } });
    fireEvent.click(await screen.findByTestId("catalog-picker-result-ENGL-1A"));
    await waitFor(() => expect(upsert).toHaveBeenCalled());
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn.t save that/);
    expect(screen.getByTestId("catalog-course-picker")).toBeTruthy();
  });

  it("reports a catalog-search failure instead of an empty list", async () => {
    state.searchError = true;
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" />);
    fireEvent.click(screen.getByTestId("mapper-open-ENGL-2A"));
    fireEvent.change(screen.getByLabelText("Which catalog course is ENGL 2A?"), { target: { value: "engl" } });
    await waitFor(() => expect(screen.getByTestId("catalog-picker-status").textContent).toMatch(/search failed/));
  });
});

describe("UnmatchedCourseMapper — an existing mapping", () => {
  const mapped = { courseCode: "ENGL 1A", courseTitle: "Critical Thinking and Writing I" };

  it("shows the student's match, labelled as theirs, with Change and Remove", () => {
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" mappedTo={mapped} />);
    expect(screen.getByTestId("unmatched-mapper-ENGL-2A").textContent).toMatch(/Matched by you to ENGL 1A Critical Thinking and Writing I/);
    expect(screen.getByRole("button", { name: "Change the catalog course matched to ENGL 2A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove the match for ENGL 2A" })).toBeTruthy();
  });

  it("Remove deletes that one mapping", async () => {
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" mappedTo={mapped} />);
    fireEvent.click(screen.getByTestId("mapper-remove-ENGL-2A"));
    await waitFor(() => expect(del).toHaveBeenCalledWith({ rawCode: "ENGL 2A" }));
  });

  it("Change reopens the picker and saves the new choice over the old one", async () => {
    wrap(<UnmatchedCourseMapper raw="ENGL 2A" mappedTo={mapped} />);
    fireEvent.click(screen.getByTestId("mapper-open-ENGL-2A"));
    fireEvent.change(screen.getByLabelText("Which catalog course is ENGL 2A?"), { target: { value: "engl 1b" } });
    fireEvent.click(await screen.findByTestId("catalog-picker-result-ENGL-1B"));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith({ rawCode: "ENGL 2A", data: { courseCode: "ENGL 1B" } }));
  });
});

describe("AprStructuredView — where mappings appear", () => {
  const parsed = (): ParsedProgressReport =>
    ({
      completedCourses: [{ code: "MATH 11", title: "Calculus", units: 4, confidence: "high" }],
      possibleCourses: [{ raw: "ENGL 2A" }, { raw: "TESP 4" }],
      notes: [],
      groups: [
        { name: "X Major Requirements", kind: "major", requirements: [
          { name: "Writing", status: "completed", scope: "program", courses: [
            { code: "ENGL 2A", title: "Critical Thinking and Writing II", units: 4, grade: null, inCatalog: false },
          ] },
        ] },
      ],
    }) as unknown as ParsedProgressReport;
  const mine = [{ rawCode: "ENGL 2A", courseCode: "ENGL 1A", courseTitle: "Critical Thinking and Writing I" }];

  it("moves a matched item out of 'verify' into 'Matched by you', in words that say whose note it is", () => {
    wrap(<AprStructuredView parsed={parsed()} variant="page" mappings={mine} />);
    const review = screen.getByTestId("apr-review");
    expect(review.textContent).toMatch(/1 item to verify in Workday/); // only TESP 4 is left
    expect(review.textContent).toContain("TESP 4");
    expect(review.textContent).not.toContain("ENGL 2A");
    const mapped = screen.getByTestId("apr-mapped");
    expect(mapped.textContent).toMatch(/Matched by you \(1\)/);
    expect(mapped.textContent).toMatch(/ENGL 2A on your report → ENGL 1A Critical Thinking and Writing I/);
    expect(mapped.textContent).toMatch(/Workday has not\s+confirmed them, and they do not count as completed/);
  });

  it("annotates the course row in the requirement list, labelled as the student's note", () => {
    wrap(<AprStructuredView parsed={parsed()} variant="page" mappings={mine} />);
    expect(document.body.textContent).toMatch(/matched by you to ENGL 1A \(your\s+note, not Workday.s\)/);
  });

  it("with no mappings nothing changes: both items still ask to be verified, and there is no 'Matched' box", () => {
    wrap(<AprStructuredView parsed={parsed()} variant="page" />);
    expect(screen.getByTestId("apr-review").textContent).toMatch(/2 items to verify in Workday/);
    expect(screen.queryByTestId("apr-mapped")).toBeNull();
  });

  it("the APR page (editable) offers to match each unrecognized item; the sidebar only displays", () => {
    wrap(<AprStructuredView parsed={parsed()} variant="page" mappings={mine} editableMappings />);
    expect(screen.getByTestId("mapper-open-TESP-4")).toBeTruthy();
    expect(screen.getByTestId("mapper-open-ENGL-2A").textContent).toBe("Change");
    // The match is stated once (in the row), not repeated inside the control.
    expect(screen.getByTestId("apr-mapped").textContent).not.toMatch(/Matched by you to/);
    cleanup();
    wrap(<AprStructuredView parsed={parsed()} variant="sidebar" mappings={mine} />);
    expect(screen.queryByTestId("mapper-open-TESP-4")).toBeNull();
    expect(screen.queryByRole("button", { name: /Match|Change|Remove/ })).toBeNull();
    expect(screen.getByTestId("apr-mapped").textContent).toMatch(/ENGL 2A on your report → ENGL 1A/);
  });

  it("offers no Match control for an item that is not code-shaped (the server would refuse it) but still lists it to verify", () => {
    const p = parsed();
    p.possibleCourses = [{ raw: "ENGL 2A" }, { raw: "???" }];
    wrap(<AprStructuredView parsed={p} variant="page" editableMappings />);
    expect(screen.getByTestId("apr-review").textContent).toContain("???");
    expect(screen.getByTestId("mapper-open-ENGL-2A")).toBeTruthy();
    // Exactly one Match button: the code-shaped item's.
    expect(screen.getAllByRole("button", { name: /Match .* to a catalog course/ })).toHaveLength(1);
  });

  it("never changes the completed count: a mapping is not a completion", () => {
    wrap(<AprStructuredView parsed={parsed()} variant="page" mappings={mine} />);
    expect(within(screen.getByTestId("apr-tally-completed")).getByText("1")).toBeTruthy();
    expect(screen.getByTestId("apr-completed-courses").textContent).toMatch(/MATH 11/);
    expect(screen.getByTestId("apr-completed-courses").textContent).not.toMatch(/ENGL 1A/);
  });
});
