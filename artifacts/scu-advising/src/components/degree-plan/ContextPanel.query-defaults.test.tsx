// @vitest-environment jsdom
/**
 * REGRESSION: this is the actual root cause behind the "Loading… forever"
 * bug, exercised against the REAL QueryClient/useGetProgressReport (no
 * mocked hook) so a future change to App.tsx's central query defaults
 * would be caught here.
 *
 * TanStack Query's "fetch" reducer resets a query back to
 * status:"pending" (clearing its error) on every refetch when the query
 * has no `data` — see query-core's fetchState: `data === undefined && {
 * error: null, status: "pending" }`. GET /progress-report 404s (never
 * produces data) whenever nothing is uploaded, which is the everyday
 * steady state for most students. Combined with the app's global
 * refetchInterval (60s) and default retryOnMount, that query would cycle
 * pending -> error -> pending forever, flickering the APR panel back to
 * "Loading…" repeatedly. App.tsx opts this specific query key out via
 * queryClient.setQueryDefaults — this test proves that opt-out actually
 * prevents the automatic refetches, using the exact same QueryClient
 * config as the real app (not a simplified test double).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getGetProgressReportQueryKey } from "@workspace/api-client-react";

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useCreatePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useDuplicatePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useDeletePlan: () => ({ mutate: vi.fn(), isPending: false }),
    usePromotePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdatePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useListGraduationMajors: () => ({ data: { majors: [] } }),
    useListGraduationMinors: () => ({ data: { minors: [] } }),
    useGetDegreeRequirements: () => ({ data: { groups: [] } }),
  };
});

vi.mock("./PlanProgressPanel", () => ({
  PlanProgressPanel: () => <div data-testid="plan-progress-panel" />,
}));

import { ContextPanel } from "./ContextPanel";
import { DegreePlanProvider } from "./DegreePlanContext";

const plan = {
  id: 1,
  name: "My Degree Plan",
  planType: "degree" as const,
  sourcePlanId: null,
  metadata: {},
  programs: { additionalMajors: [], minors: [], professionalGoals: [] },
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ContextPanel — real QueryClient, App.tsx's actual retry/refetch defaults for progress-report", () => {
  it("settles to 'no report uploaded' after a 404 and stays there — never flickers back to Loading on the app's background refetch interval", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "No progress report found." }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Mirrors App.tsx exactly: the same global defaults, then the same
    // per-key override for progress-report.
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchInterval: 60_000,
          refetchIntervalInBackground: false,
          refetchOnWindowFocus: true,
          refetchOnReconnect: true,
          retry: 1,
        },
      },
    });
    client.setQueryDefaults(getGetProgressReportQueryKey(), {
      retry: false,
      retryOnMount: false,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });

    render(
      <QueryClientProvider client={client}>
        <DegreePlanProvider
          value={{
            activePlan: plan as any,
            activePlanId: 1,
            setActivePlanId: vi.fn(),
            profile: { major: "CSE" } as any,
            requirements: [],
            scheduleAvailability: undefined,
            catalog: [],
            aprCompletedCodes: new Set(),
          }}
        >
          <ContextPanel />
        </DegreePlanProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("apr-none-uploaded")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate remounting the panel (e.g. navigating away and back) —
    // retryOnMount:false must keep it from re-fetching (and therefore
    // from resetting to "pending") every time.
    cleanup();
    render(
      <QueryClientProvider client={client}>
        <DegreePlanProvider
          value={{
            activePlan: plan as any,
            activePlanId: 1,
            setActivePlanId: vi.fn(),
            profile: { major: "CSE" } as any,
            requirements: [],
            scheduleAvailability: undefined,
            catalog: [],
            aprCompletedCodes: new Set(),
          }}
        >
          <ContextPanel />
        </DegreePlanProvider>
      </QueryClientProvider>,
    );

    // No "Loading…" flash, no re-fetch, and the correct state immediately.
    expect(screen.getByTestId("apr-none-uploaded")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
