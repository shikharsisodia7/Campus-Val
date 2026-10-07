// @vitest-environment jsdom
/**
 * The one place every planning surface decides which plan it shows. The comparison pages
 * (Degree Checksheets, Academic Progress Reports) start from the plan the student was just
 * looking at anywhere, then the Degree Plan, and never create a plan.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const plans = [
  { id: 1, name: "Degree Plan", planType: "degree" },
  { id: 2, name: "Finance", planType: "tentative" },
  { id: 3, name: "Computer Science", planType: "tentative" },
];
const requested: number[] = [];
const created = vi.fn();
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useListPlans: () => ({ data: { plans }, isLoading: false }),
    useGetPlan: (id: number) => ({ data: id ? { ...plans.find((p) => p.id === id), items: [], programs: null, metadata: {} } : undefined, isLoading: false }),
    useGetPlanRequirements: (id: number, options: { query: { enabled: boolean } }) => {
      if (options.query.enabled) requested.push(id);
      return { data: undefined, isError: false };
    },
    useGetDegreeRequirements: () => ({ data: undefined }),
    useGetProfile: () => ({ data: undefined }),
    useGetScheduleAvailability: () => ({ data: undefined }),
    useListCourses: () => ({ data: [] }),
    useCreatePlan: () => ({ mutate: created }),
  };
});

import { ACTIVE_PLAN_KEY, LAST_TENTATIVE_PLAN_KEY, usePlanningWorkspace } from "./usePlanningWorkspace";

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

beforeEach(() => {
  sessionStorage.clear();
  requested.length = 0;
});
afterEach(cleanup);

describe("the comparison pages' plan", () => {
  it("starts from the Degree Plan when nothing was looked at yet, and creates nothing", async () => {
    const { result } = renderHook(() => usePlanningWorkspace("compare"), { wrapper });
    await waitFor(() => expect(result.current.activePlanId).toBe(1));
    expect(created).not.toHaveBeenCalled();
    expect(requested).toContain(1);
  });

  it("starts from the plan last shown on any planning page", async () => {
    sessionStorage.setItem(ACTIVE_PLAN_KEY, "3");
    const { result } = renderHook(() => usePlanningWorkspace("compare"), { wrapper });
    await waitFor(() => expect(result.current.activePlanId).toBe(3));
  });

  it("ignores a remembered plan that no longer exists", async () => {
    sessionStorage.setItem(ACTIVE_PLAN_KEY, "99");
    const { result } = renderHook(() => usePlanningWorkspace("compare"), { wrapper });
    await waitFor(() => expect(result.current.activePlanId).toBe(1));
  });

  it("switching plan there is remembered for the next page, the Tentative Degree Plan page included", async () => {
    const { result } = renderHook(() => usePlanningWorkspace("compare"), { wrapper });
    await waitFor(() => expect(result.current.activePlanId).toBe(1));
    act(() => result.current.selectPlan(2));
    await waitFor(() => expect(sessionStorage.getItem(ACTIVE_PLAN_KEY)).toBe("2"));
    expect(sessionStorage.getItem(LAST_TENTATIVE_PLAN_KEY)).toBe("2");
    // Choosing the Degree Plan does not overwrite the remembered tentative plan.
    act(() => result.current.selectPlan(1));
    await waitFor(() => expect(sessionStorage.getItem(ACTIVE_PLAN_KEY)).toBe("1"));
    expect(sessionStorage.getItem(LAST_TENTATIVE_PLAN_KEY)).toBe("2");
  });
});

describe("the planning pages tell the comparison pages what they show", () => {
  it("the Degree Plan page records the Degree Plan", async () => {
    sessionStorage.setItem(ACTIVE_PLAN_KEY, "2");
    renderHook(() => usePlanningWorkspace("degree"), { wrapper });
    await waitFor(() => expect(sessionStorage.getItem(ACTIVE_PLAN_KEY)).toBe("1"));
  });

  it("the Tentative Degree Plan page records the tentative plan it opened", async () => {
    sessionStorage.setItem(LAST_TENTATIVE_PLAN_KEY, "3");
    const { result } = renderHook(() => usePlanningWorkspace("tentative"), { wrapper });
    await waitFor(() => expect(result.current.activePlanId).toBe(3));
    await waitFor(() => expect(sessionStorage.getItem(ACTIVE_PLAN_KEY)).toBe("3"));
  });

  it("every surface reads the same plan-requirements query for the same plan", async () => {
    renderHook(() => usePlanningWorkspace("degree"), { wrapper });
    renderHook(() => usePlanningWorkspace("compare"), { wrapper });
    await waitFor(() => expect(requested.filter((id) => id === 1).length).toBeGreaterThanOrEqual(2));
    expect(new Set(requested)).toEqual(new Set([1]));
  });
});
