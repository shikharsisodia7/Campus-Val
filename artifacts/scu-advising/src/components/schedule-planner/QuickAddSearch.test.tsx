// @vitest-environment jsdom
/**
 * Regression coverage found while independently re-auditing the codebase for
 * the accessibility pattern the professor flagged before (raw `<div
 * onClick>` with no keyboard equivalent, already fixed once in CalendarGrid
 * and CourseCard). This search-result card in the Quarter Plan's "Find
 * Courses" panel — the very entry point into picking a section — had the
 * same defect: a plain div with onClick and no role/tabIndex/keyboard
 * handler, so a keyboard-only or screen-reader user could not open a
 * course's sections at all.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getSearchCoursesQueryKey } from "@workspace/api-client-react";
import { QuickAddSearch } from "./QuickAddSearch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fakeWorkspace() {
  return {
    activeTerm: "fall",
    activeYear: 2026,
    activeScheduleId: 1,
    activeSchedule: { id: 1, events: [] },
    invalidateSchedules: vi.fn(),
  } as any;
}

describe("QuickAddSearch — search-result card accessibility", () => {
  it("exposes each course result as a keyboard-reachable control, not a bare div only a mouse can activate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network disabled in tests"))),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = { q: "CHEM 11", term: "fall" as const, year: 2026, limit: 10 };
    queryClient.setQueryData(getSearchCoursesQueryKey(params), {
      state: "results",
      totalMatching: 1,
      courses: [
        { code: "CHEM 11", title: "General Chemistry I", units: 5, coreAreas: [], sectionsThisQuarter: 2 },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <QuickAddSearch workspace={fakeWorkspace()} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Search by code or title/i), {
      target: { value: "CHEM 11" },
    });

    const card = await waitFor(() => screen.getByRole("button", { name: /CHEM 11: General Chemistry I/i }));
    expect(card.getAttribute("tabindex")).toBe("0");

    // Keyboard activation (Enter) must open the section list, same as a click.
    fireEvent.keyDown(card, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("CHEM 11")).toBeTruthy());
    expect(screen.getByText(/Select a section to add to your schedule/i)).toBeTruthy();
  });
});
