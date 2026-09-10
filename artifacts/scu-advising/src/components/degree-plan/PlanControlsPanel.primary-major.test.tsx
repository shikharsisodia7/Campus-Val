// @vitest-environment jsdom
/**
 * "Set or Change Primary Major" is a first-class Plan Controls action: it sits
 * ABOVE additional majors in both Degree Plan and Tentative Degree Plan, shows
 * the major the student is planning around, and writes programs.primaryMajor
 * without touching the profile/APR. (professor follow-up video 2)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// jsdom lacks ResizeObserver + scrollIntoView, which cmdk touches on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver ??= ResizeObserverStub as any;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const updateMutate = vi.fn();

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useCreatePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useDuplicatePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useDeletePlan: () => ({ mutate: vi.fn(), isPending: false }),
    usePromotePlan: () => ({ mutate: vi.fn(), isPending: false }),
    useUpdatePlan: () => ({ mutate: updateMutate, isPending: false }),
    useListGraduationMajors: () => ({
      data: {
        majors: [
          { code: "BIOL", title: "Biology", college: "CAS" },
          { code: "CHEM", title: "Chemistry", college: "CAS" },
          { code: "MATH", title: "Mathematics", college: "CAS" },
        ],
      },
    }),
    useListGraduationMinors: () => ({ data: { minors: [] } }),
  };
});

import { PlanControlsPanel } from "./PlanControlsPanel";
import { DegreePlanProvider } from "./DegreePlanContext";

const makePlan = (over: any = {}) => ({
  id: 1,
  name: "Degree Plan",
  planType: "degree" as const,
  sourcePlanId: null,
  metadata: {},
  programs: { additionalMajors: [], minors: [], professionalGoals: [] },
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

function renderPanel(plan: any) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DegreePlanProvider
        value={{
          activePlan: plan,
          activePlanId: plan.id,
          setActivePlanId: () => {},
          profile: { major: "BIOL", college: "College of Arts and Sciences" } as any,
          requirements: undefined,
          scheduleAvailability: undefined,
          catalog: undefined,
        }}
      >
        <PlanControlsPanel plans={[plan]} />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  updateMutate.mockReset();
  cleanup();
});

describe("PlanControlsPanel — primary major", () => {
  it("renders a Set or Change Primary Major control", () => {
    renderPanel(makePlan());
    expect(screen.getByText("Set or Change Primary Major")).toBeTruthy();
    expect(screen.getByTestId("select-plan-primary-major")).toBeTruthy();
  });

  it("shows the current planning major (falls back to the profile major)", () => {
    renderPanel(makePlan());
    expect(screen.getByTestId("plan-primary-major-current").textContent).toContain(
      "Biology",
    );
  });

  it("places the primary-major control BEFORE additional majors", () => {
    const { container } = renderPanel(makePlan());
    const html = container.innerHTML;
    expect(html.indexOf("plan-primary-major-section")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("plan-primary-major-section")).toBeLessThan(
      html.indexOf("select-plan-additional-major"),
    );
  });

  it("writes programs.primaryMajor (and never the profile) when a major is chosen", () => {
    renderPanel(makePlan());
    fireEvent.click(screen.getByTestId("select-plan-primary-major"));
    fireEvent.click(screen.getByTestId("major-option-CHEM"));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const [payload] = updateMutate.mock.calls[0];
    expect(payload.data.programs.primaryMajor).toBe("CHEM");
  });

  it("uses Degree-Plan copy that clarifies the APR record is unchanged", () => {
    renderPanel(makePlan());
    expect(
      screen.getByText(/official SCU declaration and Workday APR stay the same/i),
    ).toBeTruthy();
  });

  it("uses scenario-scoped copy inside a Tentative Degree Plan", () => {
    renderPanel(makePlan({ planType: "tentative", name: "What if Chemistry" }));
    expect(
      screen.getByText(/Changes this tentative scenario only/i),
    ).toBeTruthy();
  });
});
