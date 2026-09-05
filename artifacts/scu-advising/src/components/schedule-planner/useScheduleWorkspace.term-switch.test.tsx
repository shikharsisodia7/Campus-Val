// @vitest-environment jsdom
/**
 * Regression coverage for a second Quarter Plan race, found while
 * independently re-verifying the original MATH-11 fix (which added the
 * isFetchingList guard covered by useScheduleWorkspace.test.ts). That guard
 * stops a schedule-list refetch from clobbering an activeScheduleId a caller
 * just set — but it does nothing when the user switches quarters: activeTerm
 * / activeYear update immediately, while activeScheduleId keeps pointing at
 * the PREVIOUS quarter's schedule until the new quarter's schedule list
 * finishes loading. Since useGetSchedule(activeScheduleId) is keyed only by
 * id (not by term/year), it happily keeps serving the old quarter's already-
 * cached schedule detail in the meantime — so the calendar can render the
 * old quarter's events under the new quarter's header for the length of that
 * network round-trip.
 *
 * This uses a REAL QueryClient (no mocked hooks) with a deliberately
 * deferred fetch for the new quarter's schedule list, so the test can
 * inspect the exact in-between render a live user would see.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useScheduleWorkspace } from "./useScheduleWorkspace";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function Harness() {
  const ws = useScheduleWorkspace();
  return (
    <div>
      <div data-testid="term">
        {ws.activeTerm}-{ws.activeYear}
      </div>
      <div data-testid="schedule-id">{ws.activeScheduleId ?? "none"}</div>
      <div data-testid="detail-term">
        {(ws.activeSchedule as { term?: string } | undefined)?.term ?? "none"}
      </div>
      <button
        onClick={() => {
          ws.setActiveTerm("winter");
          ws.setActiveYear(2027);
        }}
      >
        switch to winter
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useScheduleWorkspace: switching quarters never shows the previous quarter's schedule", () => {
  it("clears the calendar instead of displaying the old quarter's cached schedule while the new quarter's list is still loading", async () => {
    let resolveWinterList!: (r: Response) => void;
    const winterListPromise = new Promise<Response>((resolve) => {
      resolveWinterList = resolve;
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/schedule-availability")) {
        return Promise.resolve(
          jsonResponse({ terms: [{ term: "fall", year: 2026 }, { term: "winter", year: 2027 }] }),
        );
      }
      if (url.startsWith("/api/schedules?term=fall")) {
        return Promise.resolve(jsonResponse({ schedules: [{ id: 1, term: "fall", year: 2026, name: "Fall" }] }));
      }
      if (url.startsWith("/api/schedules?term=winter")) {
        // Deliberately never resolves until the test says so — this is the
        // network round-trip window the bug lived in.
        return winterListPromise;
      }
      if (url === "/api/schedules/1") {
        return Promise.resolve(jsonResponse({ id: 1, term: "fall", year: 2026, events: [] }));
      }
      if (url === "/api/schedules/2") {
        return Promise.resolve(jsonResponse({ id: 2, term: "winter", year: 2027, events: [] }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    });

    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("detail-term").textContent).toBe("fall"));
    expect(screen.getByTestId("term").textContent).toBe("fall-2026");
    expect(screen.getByTestId("schedule-id").textContent).toBe("1");

    fireEvent.click(screen.getByText("switch to winter"));
    await act(async () => {});

    // The header has already moved to Winter, but the Winter schedule list
    // hasn't loaded yet — the calendar must NOT still show Fall's schedule.
    expect(screen.getByTestId("term").textContent).toBe("winter-2027");
    expect(screen.getByTestId("schedule-id").textContent).not.toBe("1");
    expect(screen.getByTestId("detail-term").textContent).not.toBe("fall");

    resolveWinterList(jsonResponse({ schedules: [{ id: 2, term: "winter", year: 2027, name: "Winter" }] }));

    await waitFor(() => expect(screen.getByTestId("detail-term").textContent).toBe("winter"));
    expect(screen.getByTestId("schedule-id").textContent).toBe("2");
  });
});
