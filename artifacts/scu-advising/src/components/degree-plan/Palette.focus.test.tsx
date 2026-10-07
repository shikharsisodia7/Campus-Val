// @vitest-environment jsdom
/**
 * "Show me where that went": after something is saved into the Planning Requirements from
 * another region (a Degree Checksheet), the sidebar opens the group and marks the requirement.
 * A new My requirement only exists once the refreshed requirements arrive, so the sidebar
 * waits for it. And a transferred note says where it came from, even after that document is gone.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  const idle = () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false });
  return {
    ...actual,
    useAddPlanItem: idle,
    useSaveRequirementEdit: idle,
    useResetRequirementEdits: idle,
    useResolveRequirementSourceChange: idle,
    useCreateCustomRequirement: idle,
    useUpdateCustomRequirement: idle,
    useDeleteCustomRequirement: idle,
  };
});
vi.mock("@/components/course-discovery/CoreAreaCourseFinder", () => ({ CoreAreaCourseFinder: () => null }));

import { Palette } from "./Palette";
import { DegreePlanProvider } from "./DegreePlanContext";
import { focusRequirement } from "@/lib/planning-focus";

afterEach(cleanup);

const base = {
  description: "",
  courses: [] as string[],
  phase: null,
  autoTracked: true,
  needsVerification: false,
  satisfiedBy: [] as string[],
  plannedBy: [] as string[],
  crossSatisfiedBy: [] as string[],
  status: "open" as const,
  complete: false,
};
const edit = (over: object) => ({
  kind: "edit",
  titleEdited: false,
  title: null,
  note: null,
  hidden: false,
  done: false,
  sourceChanged: false,
  originalLabel: "",
  originalDescription: "",
  labelAtEdit: null,
  sourceVersionAtEdit: null,
  sourceVersionNow: null,
  updatedAt: "2099-01-01T00:00:00Z",
  ...over,
});
const group = (items: object[]) => ({
  id: "major-primary",
  stableKey: "major:fixture",
  title: "Major Requirements — Fixture",
  kind: "major",
  notes: [],
  autoTrackedCount: 0,
  autoCompletedCount: 0,
  manualCount: 0,
  items,
});
const plain = { ...base, id: "fx1", stableKey: "major:fixture#fx-1", label: "FX 1 — First" };
const noted = (documentAvailable: boolean) => ({
  ...base,
  id: "fx2",
  stableKey: "major:fixture#fx-2",
  label: "FX 2 — Second",
  customization: edit({ note: "Take it in the fall", noteSource: { type: "DEGREE_CHECKSHEET", label: "Fixture Checksheet", anchor: "Sheet!row 4", documentAvailable } }),
});
const custom = {
  ...base,
  id: "custom-new",
  stableKey: "major:fixture#custom:new",
  label: "Capstone approval",
  autoTracked: false,
  customization: edit({ kind: "custom", title: "Capstone approval" }),
};

function mount(items: object[]) {
  const ui = (list: object[]) => (
    <QueryClientProvider client={new QueryClient()}>
      <DegreePlanProvider
        value={{
          activePlan: { id: 7, name: "Degree Plan", planType: "degree", items: [], metadata: {}, sourcePlanId: null, createdAt: "", updatedAt: "" } as any,
          activePlanId: 7,
          setActivePlanId: vi.fn(),
          profile: undefined,
          requirements: [group(list) as any],
          requirementsMeta: null,
          scheduleAvailability: undefined,
          catalog: [],
        }}
      >
        <Palette />
      </DegreePlanProvider>
    </QueryClientProvider>
  );
  const view = render(ui(items));
  return { rerender: (next: object[]) => view.rerender(ui(next)) };
}
const card = (key: string) => document.querySelector<HTMLElement>(`[data-stable-key="${key}"]`);

describe("after a transfer, the sidebar shows where it went", () => {
  it("opens the closed group and marks the requirement", () => {
    mount([plain, noted(true)]);
    expect(card("major:fixture#fx-2")).toBeNull(); // the group starts closed
    act(() => focusRequirement("major:fixture#fx-2"));
    expect(card("major:fixture#fx-2")?.getAttribute("data-flash")).toBe("true");
    expect(card("major:fixture#fx-1")?.getAttribute("data-flash")).toBeNull();
  });

  it("waits for a new My requirement to arrive, then marks it", () => {
    const view = mount([plain]);
    act(() => focusRequirement("major:fixture", "Capstone approval"));
    expect(document.querySelector('[data-flash="true"]')).toBeNull();
    view.rerender([plain, custom]);
    expect(card("major:fixture#custom:new")?.getAttribute("data-flash")).toBe("true");
  });

  it("does nothing when the requirement is not in this plan", () => {
    mount([plain]);
    act(() => focusRequirement("major:other#x-9"));
    expect(document.querySelector('[data-flash="true"]')).toBeNull();
  });
});

describe("a transferred My Note says where it came from", () => {
  it("names the checksheet", () => {
    mount([noted(true)]);
    act(() => focusRequirement("major:fixture#fx-2"));
    expect(screen.getByTestId("my-note-fx2").textContent).toContain("Take it in the fall");
    expect(screen.getByTestId("my-note-source-fx2").textContent).toBe("From: Fixture Checksheet");
  });

  it("stays when the checksheet is deleted, and says the source is gone", () => {
    mount([noted(false)]);
    act(() => focusRequirement("major:fixture#fx-2"));
    expect(screen.getByTestId("my-note-fx2").textContent).toContain("Take it in the fall");
    expect(screen.getByTestId("my-note-source-fx2").textContent).toBe("From: Fixture Checksheet (source document no longer available)");
  });
});
