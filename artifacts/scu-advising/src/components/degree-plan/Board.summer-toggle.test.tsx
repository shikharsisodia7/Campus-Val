// @vitest-environment jsdom
/**
 * REGRESSION: Summer could be added but never removed (professor feedback).
 * `hasSummer` was derived from either an explicit `addedSummers` entry OR the
 * presence of a real "summer" plan item — so even a working remove handler
 * for `addedSummers` couldn't hide a year that still has planned content,
 * and there was no remove handler at all. This covers: add, remove-when-empty,
 * and the safety block when Summer still has planned items.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const mutate = vi.fn();
const toastSpy = vi.fn();

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useUpdatePlan: () => ({ mutate }),
  };
});

vi.mock("./usePlanItemMutations", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useOptimisticUpdatePlanItem: () => ({ mutate: vi.fn() }),
    useOptimisticDeletePlanItem: () => ({ mutate: vi.fn() }),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import { Board } from "./Board";
import { DegreePlanProvider } from "./DegreePlanContext";

const YEAR = 2026;

function plan(items: any[], metadata: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Degree Plan",
    planType: "degree" as any,
    items,
    metadata,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as any;
}

function renderBoard(activePlan: any) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DegreePlanProvider
        value={{
          activePlan,
          activePlanId: 1,
          setActivePlanId: () => {},
          profile: undefined,
          requirements: undefined,
          scheduleAvailability: undefined,
          catalog: undefined,
        } as any}
      >
        <Board plans={[activePlan]} />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in tests"))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mutate.mockClear();
  toastSpy.mockClear();
});

describe("Board Summer toggle", () => {
  it("shows Add summer and no Summer column for a year with no summer content", () => {
    renderBoard(plan([{ id: 1, itemType: "course", courseCode: "CHEM 11", academicYear: YEAR, term: "fall", position: 0 }]));
    expect(screen.getByTestId(`add-summer-${YEAR}`)).toBeTruthy();
    expect(screen.queryByTestId(`remove-summer-${YEAR}`)).toBeNull();
  });

  it("adding summer saves it in plan metadata via updatePlan", () => {
    renderBoard(plan([{ id: 1, itemType: "course", courseCode: "CHEM 11", academicYear: YEAR, term: "fall", position: 0 }]));
    fireEvent.click(screen.getByTestId(`add-summer-${YEAR}`));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        data: { metadata: { addedYears: [], summerYears: [YEAR] } },
      }),
      expect.anything(),
    );
  });

  it("removes an empty added Summer", () => {
    renderBoard(
      plan(
        [{ id: 1, itemType: "course", courseCode: "CHEM 11", academicYear: YEAR, term: "fall", position: 0 }],
        { summerYears: [YEAR] },
      ),
    );
    expect(screen.getByTestId(`remove-summer-${YEAR}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`remove-summer-${YEAR}`));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        data: { metadata: { addedYears: [], summerYears: [] } },
      }),
      expect.anything(),
    );
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("blocks removing a Summer that still has planned items, without deleting them", () => {
    renderBoard(
      plan([
        { id: 1, itemType: "course", courseCode: "CHEM 11", academicYear: YEAR, term: "summer", position: 0 },
        { id: 2, itemType: "course", courseCode: "MATH 11", academicYear: YEAR, term: "summer", position: 1 },
      ]),
    );
    expect(screen.getByTestId(`remove-summer-${YEAR}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`remove-summer-${YEAR}`));

    expect(mutate).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: expect.stringContaining("2 planned items"),
      }),
    );
    // Summer column stays visible — nothing was silently hidden or dropped.
    expect(screen.getByTestId(`remove-summer-${YEAR}`)).toBeTruthy();
  });
});
