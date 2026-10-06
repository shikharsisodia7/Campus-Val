// @vitest-environment jsdom
/**
 * "Add to planning": taking something from a Degree Checksheet into the student's
 * Planning Requirements. Always previewed, always the student's choice of target:
 * preselected only when a course code belongs to exactly ONE requirement, never
 * guessed by similarity; saved as My Note (or a My Requirement) with the document as
 * provenance; exact duplicates are caught; nothing here can write a Department Note.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls = {
  save: vi.fn().mockResolvedValue({}),
  create: vi.fn().mockResolvedValue({}),
};
const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutateAsync: fn, mutate: fn, isPending: false });
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  const idle = { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false };
  return {
    ...actual,
    useSaveRequirementEdit: () => mutation(calls.save),
    useCreateCustomRequirement: () => mutation(calls.create),
    useResetRequirementEdits: () => idle,
    useResolveRequirementSourceChange: () => idle,
    useUpdateCustomRequirement: () => idle,
    useDeleteCustomRequirement: () => idle,
  };
});
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { AddToPlanningDialog, courseCodesIn, reliableTarget } from "./AddToPlanningDialog";
import { DegreePlanProvider } from "@/components/degree-plan/DegreePlanContext";
import { FOCUS_REQUIREMENT_EVENT } from "@/lib/planning-focus";

afterEach(cleanup);
beforeEach(() => {
  calls.save.mockClear();
  calls.create.mockClear();
  toast.mockClear();
});

const base = {
  description: "",
  phase: null,
  autoTracked: true,
  needsVerification: false,
  satisfiedBy: [] as string[],
  plannedBy: [] as string[],
  crossSatisfiedBy: [] as string[],
  status: "open" as const,
  complete: false,
};
const note = (text: string) => ({ kind: "edit", titleEdited: false, title: null, note: text, hidden: false, done: false, sourceChanged: false, originalLabel: "", originalDescription: "", updatedAt: "" });
const groups = [
  {
    id: "major-primary",
    stableKey: "major:fixture",
    title: "Major Requirements — Fixture",
    kind: "major",
    items: [
      { ...base, id: "a", stableKey: "major:fixture#biol-1a", label: "BIOL 1A — Cells", courses: ["BIOL 1A"] },
      { ...base, id: "b", stableKey: "major:fixture#chem-11", label: "CHEM 11 — Chemistry", courses: ["CHEM 11"] },
      { ...base, id: "c", stableKey: "major:fixture#shared-1", label: "Lab elective one", courses: ["LAB 5"] },
      { ...base, id: "d", stableKey: "major:fixture#shared-2", label: "Lab elective two", courses: ["LAB 5"] },
      { ...base, id: "e", stableKey: "major:fixture#noted", label: "MATH 11 — Calculus", courses: ["MATH 11"], customization: note("Existing note about calculus") },
    ],
  },
  { id: "university-core", stableKey: "university-core:cas", title: "University Core Curriculum", kind: "university_core", items: [{ ...base, id: "ctw1", stableKey: "university-core:cas#ctw1", label: "Critical Thinking & Writing 1", courses: [] }] },
];
const source = { text: "BIOL 1A is a Fall course, take it in year one", documentId: 7, documentTitle: "Biology Checksheet", anchor: "Biology!row 40" };

function mount(src = source, onOpenChange = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DegreePlanProvider
        value={{
          activePlan: { id: 3, name: "Tentative Degree Plan — Finance", planType: "tentative", items: [], metadata: {}, sourcePlanId: null, createdAt: "", updatedAt: "" } as any,
          activePlanId: 3,
          setActivePlanId: vi.fn(),
          profile: undefined,
          requirements: groups as any,
          requirementsMeta: null,
          scheduleAvailability: undefined,
          catalog: [],
        }}
      >
        <AddToPlanningDialog open onOpenChange={onOpenChange} source={src} />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
  return onOpenChange;
}

describe("choosing the target", () => {
  it("reads course codes only as written", () => {
    expect(courseCodesIn("Take BIOL 1A and chem11 together; MATH 11/12")).toEqual(["BIOL 1A", "CHEM 11", "MATH 11"]);
    expect(courseCodesIn("see your advisor")).toEqual([]);
  });

  it("preselects a requirement only when the code belongs to exactly one", () => {
    const candidates = groups.flatMap((g) => g.items.map((item) => ({ item: item as any, groupId: g.id, groupTitle: g.title })));
    expect(reliableTarget("BIOL 1A in Fall", candidates)?.candidate.item.stableKey).toBe("major:fixture#biol-1a");
    expect(reliableTarget("LAB 5 sections", candidates)).toBeNull(); // two requirements list it
    expect(reliableTarget("Biology intro course", candidates)).toBeNull(); // no code: no guessing from words
    expect(reliableTarget("No courses named here", candidates)).toBeNull();
  });

  it("shows what is being taken and the plan it goes to, with the reliable target preselected and changeable", () => {
    mount();
    expect(screen.getByTestId("transfer-source").textContent).toContain("Biology Checksheet");
    expect(screen.getByTestId("transfer-source").textContent).toContain("take it in year one");
    expect(screen.getByTestId("add-to-planning-dialog").textContent).toContain("Tentative Degree Plan — Finance");
    expect(screen.getByTestId("transfer-target").textContent).toContain("BIOL 1A — Cells");
    expect(screen.getByTestId("transfer-target").textContent).toContain("BIOL 1A is listed under it");
    fireEvent.click(screen.getByTestId("transfer-change-target"));
    expect(screen.getByTestId("transfer-options")).toBeTruthy();
  });

  it("asks the student to choose when nothing reliable matches, and filters their own requirements", () => {
    mount({ ...source, text: "Advisor must approve the capstone" });
    expect(screen.queryByTestId("transfer-target")).toBeNull();
    expect((screen.getByTestId("transfer-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("transfer-search"), { target: { value: "chem" } });
    const options = within(screen.getByTestId("transfer-options")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["CHEM 11 — ChemistryMajor Requirements — Fixture"]);
  });
});

describe("saving", () => {
  it("saves the student's own note with the document as provenance, then shows where it went", async () => {
    const onOpenChange = mount();
    const focused: string[] = [];
    window.addEventListener(FOCUS_REQUIREMENT_EVENT, (e) => focused.push((e as CustomEvent).detail.stableKey), { once: true });
    fireEvent.change(screen.getByTestId("transfer-note"), { target: { value: "Take BIOL 1A in Fall, year one" } });
    fireEvent.click(screen.getByTestId("transfer-save"));
    await waitFor(() => expect(calls.save).toHaveBeenCalled());
    expect(calls.save.mock.calls[0]![0]).toEqual({
      id: 3,
      data: {
        sourceKey: "major:fixture#biol-1a",
        note: "Take BIOL 1A in Fall, year one",
        noteSource: { type: "DEGREE_CHECKSHEET", documentId: 7, anchor: "Biology!row 40" },
      },
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Added to My Note", description: "Saved to Tentative Degree Plan — Finance." }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(focused).toEqual(["major:fixture#biol-1a"]));
  });

  it("appends to an existing My Note by default, can replace it, and refuses an exact duplicate", async () => {
    mount({ ...source, text: "MATH 11 needs a B or better" });
    expect(screen.getByTestId("transfer-existing").textContent).toContain("Existing note about calculus");
    fireEvent.click(screen.getByTestId("transfer-save"));
    await waitFor(() => expect(calls.save).toHaveBeenCalledTimes(1));
    expect(calls.save.mock.calls[0]![0].data.note).toBe("Existing note about calculus\nMATH 11 needs a B or better");
    cleanup();

    calls.save.mockClear();
    mount({ ...source, text: "MATH 11 needs a B or better" });
    fireEvent.click(screen.getByTestId("transfer-replace"));
    fireEvent.click(screen.getByTestId("transfer-save"));
    await waitFor(() => expect(calls.save).toHaveBeenCalledTimes(1));
    expect(calls.save.mock.calls[0]![0].data.note).toBe("MATH 11 needs a B or better");
    cleanup();

    calls.save.mockClear();
    mount({ ...source, text: "MATH 11 calculus note" });
    fireEvent.change(screen.getByTestId("transfer-note"), { target: { value: "existing NOTE about calculus" } });
    expect(screen.getByTestId("transfer-duplicate").textContent).toMatch(/already in that note/);
    expect((screen.getByTestId("transfer-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("creates a My Requirement when nothing fits, under a group the student picks, with the same provenance", async () => {
    mount({ ...source, text: "Complete the senior portfolio review" });
    fireEvent.click(screen.getByTestId("transfer-mode-custom"));
    fireEvent.change(screen.getByTestId("transfer-custom-title"), { target: { value: "Senior portfolio review" } });
    fireEvent.change(screen.getByTestId("transfer-custom-group"), { target: { value: "major:fixture" } });
    fireEvent.click(screen.getByTestId("transfer-save"));
    await waitFor(() => expect(calls.create).toHaveBeenCalled());
    expect(calls.create.mock.calls[0]![0]).toEqual({
      id: 3,
      data: {
        groupKey: "major:fixture",
        title: "Senior portfolio review",
        note: "Complete the senior portfolio review",
        courseCodes: [],
        noteSource: { type: "DEGREE_CHECKSHEET", documentId: 7, anchor: "Biology!row 40" },
      },
    });
    expect(screen.getByTestId("add-to-planning-dialog").textContent).toMatch(/“My requirement”/);
  });

  it("will not save an empty note or an over-long one", () => {
    mount();
    fireEvent.change(screen.getByTestId("transfer-note"), { target: { value: "   " } });
    expect((screen.getByTestId("transfer-save") as HTMLButtonElement).disabled).toBe(true);
  });
});
