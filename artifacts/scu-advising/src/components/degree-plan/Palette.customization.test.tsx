// @vitest-environment jsdom
/**
 * The requirements sidebar's planning customizations ("Edit requirements").
 *
 * Normal mode keeps its clean appearance: no controls, hidden requirements are
 * gone from the student's view, and an edited or custom requirement is marked
 * so it can never pass for the SCU original. Edit mode adds explicit, labelled,
 * keyboard-reachable controls. Every change goes through the plan-scoped API;
 * nothing here can mark a requirement complete.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls = {
  save: vi.fn().mockResolvedValue({}),
  reset: vi.fn().mockResolvedValue({}),
  resolve: vi.fn().mockResolvedValue({}),
  create: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  remove: vi.fn().mockResolvedValue({}),
};
const mutation = (fn: ReturnType<typeof vi.fn>) => () => ({ mutateAsync: fn, mutate: fn, isPending: false });

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useAddPlanItem: () => ({ mutate: vi.fn(), isPending: false }),
    useSaveRequirementEdit: () => mutation(calls.save)(),
    useResetRequirementEdits: () => mutation(calls.reset)(),
    useResolveRequirementSourceChange: () => mutation(calls.resolve)(),
    useCreateCustomRequirement: () => mutation(calls.create)(),
    useUpdateCustomRequirement: () => mutation(calls.update)(),
    useDeleteCustomRequirement: () => mutation(calls.remove)(),
  };
});
vi.mock("@/components/course-discovery/CoreAreaCourseFinder", () => ({ CoreAreaCourseFinder: () => null }));

import { Palette } from "./Palette";
import { DegreePlanProvider } from "./DegreePlanContext";

afterEach(cleanup);
beforeEach(() => Object.values(calls).forEach((c) => c.mockClear()));

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
const customization = (over: object) => ({
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

const group = {
  id: "major-primary",
  stableKey: "major:fixture-science",
  title: "Major Requirements — Fixture Science",
  kind: "major",
  sourceUrl: "https://example.test/bulletin",
  sourceLabel: "Fixture Bulletin",
  academicYear: "2099-00",
  lastVerified: "2099-01-01",
  notes: [],
  autoTrackedCount: 0,
  autoCompletedCount: 0,
  manualCount: 0,
  items: [
    { ...base, id: "plain", stableKey: "major:fixture-science#plain", label: "FX 1 — Plain" },
    {
      ...base,
      id: "renamed",
      stableKey: "major:fixture-science#renamed",
      label: "My wording for FX 2",
      customization: customization({ titleEdited: true, title: "My wording for FX 2", note: "Take with FX 9", originalLabel: "FX 2 — Second" }),
    },
    {
      ...base,
      id: "hidden",
      stableKey: "major:fixture-science#hidden",
      label: "FX 3 — Hidden one",
      customization: customization({ hidden: true, originalLabel: "FX 3 — Hidden one" }),
    },
    {
      ...base,
      id: "stale",
      stableKey: "major:fixture-science#stale",
      label: "FX 4 — Updated source wording",
      customization: customization({
        sourceChanged: true,
        title: "Old edit",
        originalLabel: "FX 4 — Updated source wording",
        labelAtEdit: "FX 4 — Older wording",
        sourceVersionAtEdit: "2098-99",
        sourceVersionNow: "2099-00",
      }),
    },
    {
      ...base,
      id: "custom-abc",
      stableKey: "major:fixture-science#custom:abc",
      label: "Honors thesis",
      courses: ["HIST 11A", "ENGL 1A"],
      autoTracked: false,
      customization: customization({ kind: "custom", title: "Honors thesis", note: "Ask Dr. K", done: false }),
    },
  ],
};

const meta = {
  sourceLabel: "Requirement data loaded in CampusVal from SCU Bulletin sources.",
  policyDecided: false,
  summary: { edited: 1, hidden: 1, custom: 1, sourceChanged: 1, orphaned: 1 },
  orphaned: [{ entryType: "source_edit", targetKey: "major:gone#x", groupKey: null, reason: "program_not_in_plan", title: "Ghost edit", note: null, updatedAt: "2099-01-01T00:00:00Z" }],
};

function renderPalette(withMeta = true) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <DegreePlanProvider
        value={{
          activePlan: { id: 7, name: "Degree Plan", planType: "degree", items: [], metadata: {}, sourcePlanId: null, createdAt: "", updatedAt: "" } as any,
          activePlanId: 7,
          setActivePlanId: vi.fn(),
          profile: undefined,
          requirements: [group as any],
          requirementsMeta: withMeta ? (meta as any) : null,
          scheduleAvailability: undefined,
          catalog: [],
        }}
      >
        <Palette />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}
const openGroup = () => fireEvent.click(screen.getByText("Major Requirements — Fixture Science"));

describe("normal mode", () => {
  it("looks like the sidebar always did: no edit controls, hidden requirements gone", () => {
    renderPalette();
    openGroup();
    expect(screen.getByText("FX 1 — Plain")).toBeTruthy();
    expect(screen.queryByText("FX 3 — Hidden one")).toBeNull();
    expect(screen.queryByTestId("edit-controls-plain")).toBeNull();
    expect(screen.queryByTestId("edit-requirements-panel")).toBeNull();
  });

  it("marks an edited requirement and a requirement of the student's own, so neither passes for the original", () => {
    renderPalette();
    openGroup();
    expect(screen.getByText("My wording for FX 2")).toBeTruthy();
    expect(screen.getByTestId("mark-edited-renamed").textContent).toBe("My edit");
    expect(screen.getByTestId("mark-edited-renamed").getAttribute("title")).toContain("FX 2 — Second");
    expect(screen.getByTestId("my-note-renamed").textContent).toContain("Take with FX 9");
    expect(screen.getByTestId("mark-custom-custom-abc").textContent).toBe("My requirement");
    expect(screen.getByTestId("my-note-custom-abc").textContent).toContain("Ask Dr. K");
  });

  it("never offers a custom requirement as something a course can satisfy, and never calls it complete", () => {
    renderPalette();
    openGroup();
    const card = screen.getByText("Honors thesis").closest("[data-customized]") as HTMLElement;
    expect(within(card).queryByText(/Add placeholder/)).toBeNull();
    expect(within(card).queryByText(/Satisfied/)).toBeNull();
    expect(card.textContent).toContain("not an SCU record");
  });

  it("offers a custom requirement's own courses as add-to-plan shortcuts, as real buttons", () => {
    renderPalette();
    openGroup();
    const box = screen.getByTestId("custom-courses-custom-abc");
    expect(within(box).getByRole("button", { name: "Add HIST 11A to the plan" })).toBeTruthy();
    expect(within(box).getByRole("button", { name: "Add ENGL 1A to the plan" })).toBeTruthy();
  });

  it("shows where the group's data comes from without entering edit mode", () => {
    renderPalette();
    openGroup();
    expect(screen.getByTestId("source-line-major").textContent).toContain("Fixture Bulletin");
  });

  it("does not apply an edit whose source has changed, and says so", () => {
    renderPalette();
    openGroup();
    expect(screen.getByText("FX 4 — Updated source wording")).toBeTruthy();
    expect(screen.getByTestId("source-changed-stale").textContent).toMatch(/changed since you customized it.*not applied/);
  });

  it("says so plainly when the requirements cannot be loaded, without touching the plan", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DegreePlanProvider
          value={{
            activePlan: { id: 7, name: "Degree Plan", planType: "degree", items: [], metadata: {}, sourcePlanId: null, createdAt: "", updatedAt: "" } as any,
            activePlanId: 7,
            setActivePlanId: vi.fn(),
            profile: undefined,
            requirements: undefined,
            requirementsMeta: null,
            requirementsError: true,
            scheduleAvailability: undefined,
            catalog: [],
          }}
        >
          <Palette />
        </DegreePlanProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("requirements-load-error").textContent).toMatch(/couldn.t be loaded.*plan and any edits you made are safe/);
    expect(screen.queryByTestId("toggle-edit-requirements")).toBeNull();
  });

  it("offers no edit toggle when the requirements are not from a plan", () => {
    renderPalette(false);
    expect(screen.queryByTestId("toggle-edit-requirements")).toBeNull();
  });
});

describe("edit mode", () => {
  const enter = () => {
    renderPalette();
    openGroup();
    fireEvent.click(screen.getByTestId("toggle-edit-requirements"));
  };

  it("is explicit, labelled and says what an edit does and does not change", () => {
    enter();
    const toggle = screen.getByTestId("toggle-edit-requirements");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    const panel = screen.getByTestId("edit-requirements-panel").textContent!;
    expect(panel).toMatch(/this plan only/);
    expect(panel).toMatch(/never change SCU.s requirements, your Workday APR, your Degree Checksheets or what counts as complete/);
    expect(screen.getByTestId("customization-summary").textContent).toContain("1 edited · 1 hidden · 1 of my own · 1 to review");
    expect(screen.getByTestId("requirements-source-label").textContent).not.toMatch(/official/i);
  });

  it("shows hidden requirements dimmed, with Restore, and restores through the API", async () => {
    enter();
    expect(screen.getByText("FX 3 — Hidden one")).toBeTruthy();
    fireEvent.click(screen.getByTestId("restore-hidden"));
    await waitFor(() => expect(calls.save).toHaveBeenCalledWith({ id: 7, data: { sourceKey: "major:fixture-science#hidden", hidden: false } }));
  });

  it("hides a requirement from the plan without deleting it", async () => {
    enter();
    fireEvent.click(screen.getByTestId("hide-plain"));
    await waitFor(() => expect(calls.save).toHaveBeenCalledWith({ id: 7, data: { sourceKey: "major:fixture-science#plain", hidden: true } }));
    expect(calls.remove).not.toHaveBeenCalled();
  });

  it("edits the wording and note of a source requirement, showing the source original", async () => {
    enter();
    fireEvent.click(screen.getByTestId("edit-plain"));
    expect(screen.getByTestId("edit-original").textContent).toContain("FX 1 — Plain");
    fireEvent.change(screen.getByTestId("req-edit-title"), { target: { value: "  Intro to FX  " } });
    fireEvent.change(screen.getByTestId("req-edit-note"), { target: { value: "Fall only" } });
    fireEvent.click(screen.getByTestId("req-edit-save"));
    await waitFor(() =>
      expect(calls.save).toHaveBeenCalledWith({ id: 7, data: { sourceKey: "major:fixture-science#plain", title: "Intro to FX", note: "Fall only" } }),
    );
  });

  it("resets one requirement to the source", async () => {
    enter();
    fireEvent.click(screen.getByTestId("reset-renamed"));
    await waitFor(() => expect(calls.reset).toHaveBeenCalledWith({ id: 7, params: { sourceKey: "major:fixture-science#renamed" } }));
  });

  it("adds a requirement of the student's own to the group, and refuses an empty title", async () => {
    enter();
    fireEvent.click(screen.getByTestId("add-custom-requirement"));
    fireEvent.click(screen.getByTestId("req-edit-save"));
    expect(screen.getByTestId("req-edit-error").textContent).toMatch(/title/);
    expect(calls.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("req-edit-title"), { target: { value: "Study abroad prerequisite" } });
    fireEvent.click(screen.getByTestId("req-edit-save"));
    await waitFor(() =>
      expect(calls.create).toHaveBeenCalledWith({ id: 7, data: { groupKey: "major:fixture-science", title: "Study abroad prerequisite", note: null, courseCodes: [] } }),
    );
  });

  it("moves a requirement of the student's own up and down, from labelled buttons", async () => {
    enter();
    fireEvent.click(screen.getByTestId("move-up-custom-abc"));
    await waitFor(() => expect(calls.update).toHaveBeenCalledWith({ id: 7, customId: "abc", data: { move: "up" } }));
    fireEvent.click(screen.getByTestId("move-down-custom-abc"));
    await waitFor(() => expect(calls.update).toHaveBeenCalledWith({ id: 7, customId: "abc", data: { move: "down" } }));
  });

  it("deletes a requirement of the student's own", async () => {
    enter();
    fireEvent.click(screen.getByTestId("delete-custom-custom-abc"));
    await waitFor(() => expect(calls.remove).toHaveBeenCalledWith({ id: 7, customId: "abc" }));
  });

  it("lets the student keep their edit or take the updated source when the source changed", async () => {
    enter();
    fireEvent.click(within(screen.getByTestId("source-changed-stale")).getByText("Review"));
    const dialog = screen.getByTestId("source-change-dialog");
    expect(dialog.textContent).toContain("FX 4 — Older wording");
    expect(dialog.textContent).toContain("FX 4 — Updated source wording");
    expect(dialog.textContent).toContain("Old edit");
    fireEvent.click(screen.getByTestId("keep-my-edit"));
    await waitFor(() => expect(calls.resolve).toHaveBeenCalledWith({ id: 7, data: { sourceKey: "major:fixture-science#stale", action: "keep_mine" } }));
  });

  it("asks before resetting everything, then resets", async () => {
    enter();
    fireEvent.click(screen.getByTestId("reset-all-requirements"));
    expect(calls.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-reset-all"));
    await waitFor(() => expect(calls.reset).toHaveBeenCalledWith({ id: 7, params: { all: true } }));
  });

  it("lists edits that no longer match anything, and removes them on request", async () => {
    enter();
    const list = screen.getByTestId("orphaned-customizations");
    expect(list.textContent).toContain("Ghost edit");
    fireEvent.click(within(list).getByText("Remove"));
    await waitFor(() => expect(calls.reset).toHaveBeenCalledWith({ id: 7, params: { sourceKey: "major:gone#x" } }));
  });

  it("gives every control a text label and 32px-tall hit area, not an icon alone", () => {
    enter();
    for (const id of ["edit-plain", "hide-plain", "reset-renamed", "delete-custom-custom-abc"]) {
      const b = screen.getByTestId(id);
      expect(b.textContent!.trim().length).toBeGreaterThan(2);
      expect(b.className).toMatch(/\bh-8\b/);
    }
    expect(screen.getByTestId("toggle-edit-requirements").className).toMatch(/\bh-8\b/);
  });

  it("leaving edit mode returns to the clean view", () => {
    enter();
    fireEvent.click(screen.getByTestId("toggle-edit-requirements"));
    expect(screen.queryByTestId("edit-controls-plain")).toBeNull();
    expect(screen.queryByText("FX 3 — Hidden one")).toBeNull();
  });
});
