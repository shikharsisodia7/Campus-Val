// @vitest-environment jsdom
/**
 * Core-category discovery: a Core click returns the COMPLETE result set (paged,
 * scrollable — not a compressed one-row window), the states are distinct, and a
 * discovered course can still be added after filtering. The search API is
 * faked at the hook boundary, but with a realistic paged contract.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Page = { state: string; totalMatching: number; totalWithSections: number | null; offset: number; hasMore: boolean; courses: any[] };
const calls: any[] = [];
let respond: (params: any) => { data?: Page; isFetching?: boolean; isError?: boolean } = () => ({ data: undefined });
const stable = new Map<string, { data?: Page; isFetching?: boolean; isError?: boolean }>();
let coreAreas: any[] = [];

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useSearchCourses: (params: any) => {
      calls.push(params);
      // react-query hands back the SAME data object until a request changes it;
      // a fake that returned a fresh object every render would (rightly) loop.
      const key = JSON.stringify(params);
      if (!stable.has(key)) stable.set(key, respond(params));
      const r = stable.get(key)!;
      return { data: r.data, isFetching: !!r.isFetching, isError: !!r.isError, refetch: vi.fn() };
    },
    useListCoreAreas: () => ({ data: { coreAreas, pathwaysAvailable: false } }),
  };
});

import { CoreAreaCourseFinder } from "./CoreAreaCourseFinder";
import { AdvancedSearchPanel } from "../schedule-planner/AdvancedSearchPanel";

const course = (code: string, extra: object = {}) => ({
  code, title: `${code} title`, units: 4, description: "", coreAreas: ["Critical Thinking & Writing"],
  coreAreaSources: { "Critical Thinking & Writing": "catalog_text" }, sectionsThisQuarter: null, ...extra,
});
const codes = (n: number, start = 0) => Array.from({ length: n }, (_, i) => course(`ENGL ${100 + start + i}`));

/** A server that pages a fixed list, like /course-search does. */
function pagedServer(all: any[]) {
  return (params: any): { data: Page } => {
    const off = params.offset ?? 0;
    const lim = params.limit ?? 30;
    return {
      data: {
        state: all.length ? "results" : "no_matching_courses",
        totalMatching: all.length,
        totalWithSections: null,
        offset: off,
        hasMore: all.length > off + lim,
        courses: all.slice(off, off + lim),
      },
    };
  };
}

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => {
  calls.length = 0;
  stable.clear();
  coreAreas = [
    { name: "Critical Thinking & Writing", code: "CTW", courseCount: 5, catalogStatedCount: 5, requirementIds: ["ctw1", "ctw2"] },
    { name: "Advanced Writing", code: "AW", courseCount: 33, catalogStatedCount: 6, requirementIds: ["advwriting"] },
    { name: "Cultures & Ideas", code: "C&I", courseCount: 75, catalogStatedCount: 12, requirementIds: ["ci1", "ci2"] },
    { name: "Experiential Learning for Social Justice", code: "ELSJ", courseCount: 0, catalogStatedCount: 0, requirementIds: ["elsj"] },
  ];
});
afterEach(cleanup);

describe("CoreAreaCourseFinder (Degree Plan requirement click)", () => {
  it("searches by the canonical Core tag and lists every course in a bounded, focusable scroll region", () => {
    respond = pagedServer(codes(5));
    wrap(<CoreAreaCourseFinder coreAreaTag="Critical Thinking & Writing" requirementLabel="Critical Thinking & Writing 1" onAdd={vi.fn()} />);
    expect(calls[0]).toMatchObject({ coreAreas: "Critical Thinking & Writing", limit: 50, offset: 0 });
    const list = screen.getByTestId("course-results-list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(list.getAttribute("tabindex")).toBe("0");
    expect(list.getAttribute("aria-label")).toBe("Courses that satisfy Critical Thinking & Writing 1");
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/max-h-/); // an explicit bounded height, never a flex sliver
    expect(screen.getByTestId("course-results-count").textContent).toMatch(/Showing 5 of 5/);
  });

  it("pages a large category: 'Show more' appends, nothing is dropped or duplicated", async () => {
    respond = pagedServer(codes(120));
    wrap(<CoreAreaCourseFinder coreAreaTag="Cultures & Ideas" requirementLabel="C&I 1" onAdd={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    expect(screen.getByTestId("course-results-count").textContent).toMatch(/Showing 50 of 120/);
    fireEvent.click(screen.getByTestId("course-results-more"));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(100));
    fireEvent.click(screen.getByTestId("course-results-more"));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(120));
    expect(screen.queryByTestId("course-results-more")).toBeNull();
    const shown = screen.getAllByRole("listitem").map((li) => li.getAttribute("data-testid"));
    expect(new Set(shown).size).toBe(120);
  });

  it("labels each course as stated in the Bulletin or inferred, in words", () => {
    respond = pagedServer([
      course("PHIL 1A"),
      course("HIST 20", { coreAreaSources: { "Critical Thinking & Writing": "heuristic" } }),
    ]);
    wrap(<CoreAreaCourseFinder coreAreaTag="Critical Thinking & Writing" requirementLabel="CTW" onAdd={vi.fn()} />);
    expect(screen.getByTestId("course-source-PHIL-1A").textContent).toBe("Stated in Bulletin");
    expect(screen.getByTestId("course-source-HIST-20").textContent).toBe("Inferred — confirm");
  });

  it("adds the discovered course to the plan (adding still works after filtering)", () => {
    respond = pagedServer(codes(3));
    const onAdd = vi.fn();
    wrap(<CoreAreaCourseFinder coreAreaTag="Critical Thinking & Writing" requirementLabel="CTW" onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add ENGL 101" }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ code: "ENGL 101" }));
  });

  it("loading, error (with retry) and empty states are all distinct and none is blank", () => {
    respond = () => ({ data: undefined, isFetching: true });
    const { unmount } = wrap(<CoreAreaCourseFinder coreAreaTag="Arts" requirementLabel="Arts" onAdd={vi.fn()} />);
    expect(screen.getByTestId("course-results-loading")).toBeTruthy();
    unmount();
    stable.clear();

    respond = () => ({ data: undefined, isError: true });
    const { unmount: u2 } = wrap(<CoreAreaCourseFinder coreAreaTag="Arts" requirementLabel="Arts" onAdd={vi.fn()} />);
    expect(screen.getByTestId("course-results-error").getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("course-results-retry")).toBeTruthy();
    u2();
    stable.clear();

    respond = pagedServer([]);
    wrap(<CoreAreaCourseFinder coreAreaTag="Arts" requirementLabel="Arts" onAdd={vi.fn()} />);
    expect(screen.getByTestId("course-results-empty").textContent).toMatch(/no courses tagged.*Arts.*check the SCU Bulletin or Workday/i);
  });
});

describe("Quarter Plan Filter tab (AdvancedSearchPanel)", () => {
  const workspace = { activeTerm: "fall", activeYear: 2026 } as any;

  it("shows a chip per canonical Core area with its code and course count, as real toggle buttons", () => {
    respond = () => ({ data: undefined });
    wrap(<AdvancedSearchPanel workspace={workspace} />);
    const ctw = screen.getByTestId("core-chip-CTW");
    expect(ctw.tagName).toBe("BUTTON");
    expect(ctw.textContent).toMatch(/CTW.*Critical Thinking & Writing.*\(5\)/);
    expect(ctw.getAttribute("aria-pressed")).toBe("false");
    // An area with no catalog tagging is honestly disabled, not silently missing.
    expect((screen.getByTestId("core-chip-ELSJ") as HTMLButtonElement).disabled).toBe(true);
  });

  it("clicking a Core chip searches by that area, returns the complete set, and 'View sections' hands the course to the Find tab", () => {
    respond = pagedServer(codes(5));
    const onFindSections = vi.fn();
    wrap(<AdvancedSearchPanel workspace={workspace} onFindSections={onFindSections} />);
    expect(screen.getByTestId("filter-prompt")).toBeTruthy();
    fireEvent.click(screen.getByTestId("core-chip-CTW"));
    expect(screen.getByTestId("core-chip-CTW").getAttribute("aria-pressed")).toBe("true");
    const last = calls[calls.length - 1];
    expect(last).toMatchObject({ coreAreas: "Critical Thinking & Writing", term: "fall", year: 2026, offeredOnly: false, limit: 50 });
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "View sections for ENGL 102" }));
    expect(onFindSections).toHaveBeenCalledWith("ENGL 102");
  });

  it("the results region is bounded and scrollable, and NOT a flex-1/h-full child (the compressed-window bug)", () => {
    respond = pagedServer(codes(30));
    wrap(<AdvancedSearchPanel workspace={workspace} />);
    fireEvent.click(screen.getByTestId("core-chip-CTW"));
    const list = screen.getByTestId("course-results-list");
    expect(list.className).toMatch(/max-h-\[min\(60vh,32rem\)\]/);
    expect(list.className).toMatch(/overflow-y-auto/);
    const panel = screen.getByTestId("advanced-search-panel");
    expect(panel.className).not.toMatch(/h-full/);
    expect(list.className).not.toMatch(/flex-1/);
  });

  it("'Only courses offered in this quarter' is an explicit choice and defaults OFF (complete catalog result set)", () => {
    respond = pagedServer(codes(3));
    wrap(<AdvancedSearchPanel workspace={workspace} />);
    fireEvent.click(screen.getByTestId("core-chip-CTW"));
    const toggle = screen.getByTestId("toggle-offered-only") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(calls[calls.length - 1].offeredOnly).toBe(false);
    fireEvent.click(toggle);
    expect(calls[calls.length - 1].offeredOnly).toBe(true);
  });

  it("clear filters resets chips and keyword", () => {
    respond = pagedServer(codes(3));
    wrap(<AdvancedSearchPanel workspace={workspace} />);
    fireEvent.click(screen.getByTestId("core-chip-CTW"));
    fireEvent.change(screen.getByTestId("input-filter-keyword"), { target: { value: "poetry" } });
    fireEvent.click(screen.getByTestId("button-clear-filters"));
    expect(screen.getByTestId("core-chip-CTW").getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByTestId("input-filter-keyword") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("filter-prompt")).toBeTruthy();
    expect(screen.queryByTestId("button-clear-filters")).toBeNull();
  });

  it("combines several chips with All/Any and says why 'All' can return nothing", () => {
    respond = () => ({ data: { state: "no_matching_courses", totalMatching: 0, totalWithSections: null, offset: 0, hasMore: false, courses: [] } });
    wrap(<AdvancedSearchPanel workspace={workspace} />);
    fireEvent.click(screen.getByTestId("core-chip-CTW"));
    fireEvent.click(screen.getByTestId("core-chip-AW"));
    expect(calls[calls.length - 1]).toMatchObject({ coreAreas: "Critical Thinking & Writing,Advanced Writing", matchMode: "all" });
    expect(screen.getByTestId("course-results-empty").textContent).toMatch(/try "Any selected"/i);
    fireEvent.click(screen.getByLabelText("Any selected"));
    expect(calls[calls.length - 1].matchMode).toBe("any");
  });

  it("a keyword like 'CTW' is passed straight to the search (the server resolves the alias); ordinary text search still works", async () => {
    respond = pagedServer(codes(2));
    wrap(<AdvancedSearchPanel workspace={workspace} />);
    fireEvent.change(screen.getByTestId("input-filter-keyword"), { target: { value: "CTW" } });
    await waitFor(() => expect(calls[calls.length - 1]).toMatchObject({ q: "CTW" }));
    expect(calls[calls.length - 1].coreAreas).toBeUndefined();
  });
});
