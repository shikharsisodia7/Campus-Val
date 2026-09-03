// @vitest-environment jsdom
/**
 * Professor feedback: an academic year can be added by accident and there
 * was no way to remove it. Mirrors Board.summer-toggle.test.tsx's pattern:
 * covers showing the control only for explicitly-added years (never the
 * structural/current year), removing an empty added year, blocking removal
 * when it still has planned items (without deleting them), and respecting a
 * "cancel" on the confirmation prompt.
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

const CURRENT_YEAR = 2026;
const ADDED_YEAR = 2028;

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

describe("Board Remove academic year", () => {
  it("never shows Remove year for the structural/current year (only real items, no addedYears)", () => {
    renderBoard(
      plan([
        {
          id: 1,
          itemType: "course",
          courseCode: "CHEM 11",
          academicYear: CURRENT_YEAR,
          term: "fall",
          position: 0,
        },
      ]),
    );
    expect(screen.queryByTestId(`remove-year-${CURRENT_YEAR}`)).toBeNull();
  });

  it("shows Remove year for an explicitly added, empty year", () => {
    renderBoard(
      plan(
        [
          {
            id: 1,
            itemType: "course",
            courseCode: "CHEM 11",
            academicYear: CURRENT_YEAR,
            term: "fall",
            position: 0,
          },
        ],
        { addedYears: [ADDED_YEAR] },
      ),
    );
    expect(screen.getByTestId(`remove-year-${ADDED_YEAR}`)).toBeTruthy();
  });

  it("removes an empty added year after confirmation", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderBoard(
      plan(
        [
          {
            id: 1,
            itemType: "course",
            courseCode: "CHEM 11",
            academicYear: CURRENT_YEAR,
            term: "fall",
            position: 0,
          },
        ],
        { addedYears: [ADDED_YEAR] },
      ),
    );
    fireEvent.click(screen.getByTestId(`remove-year-${ADDED_YEAR}`));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        data: { metadata: { addedYears: [], summerYears: [] } },
      }),
      expect.anything(),
    );
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("does nothing when the confirmation is cancelled", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderBoard(
      plan(
        [
          {
            id: 1,
            itemType: "course",
            courseCode: "CHEM 11",
            academicYear: CURRENT_YEAR,
            term: "fall",
            position: 0,
          },
        ],
        { addedYears: [ADDED_YEAR] },
      ),
    );
    fireEvent.click(screen.getByTestId(`remove-year-${ADDED_YEAR}`));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId(`remove-year-${ADDED_YEAR}`)).toBeTruthy();
  });

  it("blocks removing an added year that still has planned items, without deleting them", () => {
    renderBoard(
      plan(
        [
          {
            id: 1,
            itemType: "course",
            courseCode: "CHEM 11",
            academicYear: ADDED_YEAR,
            term: "fall",
            position: 0,
          },
          {
            id: 2,
            itemType: "course",
            courseCode: "MATH 11",
            academicYear: ADDED_YEAR,
            term: "winter",
            position: 0,
          },
        ],
        { addedYears: [ADDED_YEAR] },
      ),
    );
    fireEvent.click(screen.getByTestId(`remove-year-${ADDED_YEAR}`));

    expect(mutate).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: expect.stringContaining("2 planned items"),
      }),
    );
    // The year stays visible — nothing was silently hidden or dropped.
    expect(screen.getByTestId(`remove-year-${ADDED_YEAR}`)).toBeTruthy();
  });

  it("also clears any addedSummers entry for the removed year", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderBoard(
      plan(
        [
          {
            id: 1,
            itemType: "course",
            courseCode: "CHEM 11",
            academicYear: CURRENT_YEAR,
            term: "fall",
            position: 0,
          },
        ],
        { addedYears: [ADDED_YEAR], summerYears: [ADDED_YEAR] },
      ),
    );
    fireEvent.click(screen.getByTestId(`remove-year-${ADDED_YEAR}`));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        data: { metadata: { addedYears: [], summerYears: [] } },
      }),
      expect.anything(),
    );
  });
});
