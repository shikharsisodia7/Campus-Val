// @vitest-environment jsdom
/**
 * Department Notes in the requirements sidebar.
 *
 * A Department Note and a student's My Note must never be mistaken for each
 * other: different label, different markup, and a student has no control that
 * edits a Department Note. Notes render as plain text (never markup), long ones
 * collapse without being lost, and a department's wording change is marked and
 * keeps the Bulletin wording one hover away. University rules are read-only.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  const noop = () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false });
  return {
    ...actual,
    useAddPlanItem: () => ({ mutate: vi.fn(), isPending: false }),
    useSaveRequirementEdit: noop,
    useResetRequirementEdits: noop,
    useResolveRequirementSourceChange: noop,
    useCreateCustomRequirement: noop,
    useUpdateCustomRequirement: noop,
    useDeleteCustomRequirement: noop,
  };
});
vi.mock("@/components/course-discovery/CoreAreaCourseFinder", () => ({ CoreAreaCourseFinder: () => null }));

import { Palette } from "./Palette";
import { DegreePlanProvider } from "./DegreePlanContext";

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
const note = (over: object) => ({
  id: 1,
  body: "Take during the first year when possible.",
  kind: "sequence",
  programKey: "major:fixture-science",
  programTitle: "Fixture Science",
  sourceLabel: "Fixture Science Requirements Checklist",
  sourceUrl: null,
  sourceReference: "Fixture!D3",
  origin: "imported",
  reviewed: false,
  updatedAt: "2099-01-01T00:00:00Z",
  ...over,
});
const longBody = `${"A very long piece of advising guidance. ".repeat(12)}END-OF-NOTE`;

const groups = [
  {
    id: "university-requirements",
    stableKey: "university-requirements",
    category: "UNIVERSITY",
    title: "University Degree Requirements",
    kind: "university",
    sourceUrl: null,
    sourceLabel: "Bulletin Ch. 8",
    academicYear: "2099-00",
    lastVerified: "2099-01-01",
    notes: [],
    autoTrackedCount: 0,
    autoCompletedCount: 0,
    manualCount: 1,
    items: [{ ...base, id: "university-requirements-minimum-units", stableKey: "university-requirements#minimum-units", label: "Minimum quarter units", autoTracked: false, needsVerification: true }],
  },
  {
    id: "major-primary",
    stableKey: "major:fixture-science",
    category: "MAJOR",
    title: "Major Requirements — Fixture Science",
    kind: "major",
    sourceUrl: null,
    sourceLabel: "Fixture Bulletin",
    academicYear: "2099-00",
    lastVerified: "2099-01-01",
    notes: [],
    autoTrackedCount: 3,
    autoCompletedCount: 0,
    manualCount: 0,
    departmentNotes: [note({ id: 10, body: "This program's students should meet an advisor in Fall.", reviewed: true, origin: "admin", sourceLabel: null })],
    items: [
      {
        ...base,
        id: "one",
        stableKey: "major:fixture-science#one",
        label: "FX 1 — One",
        departmentNotes: [
          note({ id: 11 }),
          note({ id: 12, body: "<img src=x onerror=alert(1)> GPA > 2.0", origin: "admin", reviewed: true }),
          note({ id: 13, body: longBody, reviewed: true }),
        ],
        customization: {
          kind: "edit", titleEdited: false, title: null, note: "my private reminder", hidden: false, done: false, sourceChanged: false,
          originalLabel: "FX 1 — One", originalDescription: "", labelAtEdit: null, sourceVersionAtEdit: null, sourceVersionNow: null, updatedAt: "2099-01-01T00:00:00Z",
        },
      },
      {
        ...base,
        id: "two",
        stableKey: "major:fixture-science#two",
        label: "Department wording for FX 2",
        department: { overridden: true, originalLabel: "FX 2 — Two", originalDescription: "", added: false, programKey: "major:fixture-science", programTitle: "Fixture Science" },
      },
      {
        ...base,
        id: "dept-added",
        stableKey: "major:fixture-science#dept:xyz",
        label: "Senior seminar",
        courses: ["FX 99"],
        department: { overridden: false, originalLabel: null, originalDescription: null, added: true, programKey: "major:fixture-science", programTitle: "Fixture Science" },
      },
    ],
  },
];

function renderPalette() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DegreePlanProvider
        value={{
          activePlan: { id: 7, name: "Degree Plan", planType: "degree", items: [], metadata: {}, sourcePlanId: null, createdAt: "", updatedAt: "" } as any,
          activePlanId: 7,
          setActivePlanId: vi.fn(),
          profile: undefined,
          requirements: groups as any,
          requirementsMeta: { sourceLabel: "x", policyDecided: false, summary: { edited: 0, hidden: 0, custom: 0, sourceChanged: 0, orphaned: 0 }, orphaned: [] } as any,
          scheduleAvailability: undefined,
          catalog: [],
        }}
      >
        <Palette />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}
const open = (title: string) => fireEvent.click(screen.getByText(title));

describe("Department Notes beside My Notes", () => {
  it("labels a Department Note and a My Note differently, in different markup", () => {
    renderPalette();
    open("Major Requirements — Fixture Science");
    const dept = screen.getByTestId("department-note-11");
    const mine = screen.getByTestId("my-note-one");
    expect(within(dept).getByText("Department Note")).toBeTruthy();
    expect(dept.textContent).toContain("Take during the first year when possible.");
    expect(dept.textContent).not.toContain("My Note");
    expect(mine.textContent).toContain("My Note:");
    expect(mine.textContent).toContain("my private reminder");
    expect(mine.textContent).not.toContain("Department Note");
    expect(dept.className).toContain("amber");
    expect(mine.className).toContain("sky");
    expect(dept.className).not.toBe(mine.className);
  });

  it("says where an imported note came from and that no one has reviewed it", () => {
    renderPalette();
    open("Major Requirements — Fixture Science");
    expect(screen.getByTestId("department-note-11").textContent).toMatch(/Fixture Science Requirements Checklist.*published checklist.*not yet reviewed/);
    expect(screen.getByTestId("department-note-12").textContent).not.toMatch(/not yet reviewed/);
  });

  it("gives a student no control that edits or removes a Department Note", () => {
    renderPalette();
    open("Major Requirements — Fixture Science");
    fireEvent.click(screen.getByTestId("toggle-edit-requirements"));
    const card = screen.getByTestId("department-notes-one");
    expect(within(card).queryAllByRole("button").map((b) => b.textContent)).toEqual(["Show more"]);
    expect(within(card).queryAllByRole("textbox")).toHaveLength(0);
  });

  it("renders note text as plain text, never as markup", () => {
    renderPalette();
    open("Major Requirements — Fixture Science");
    const body = screen.getByTestId("department-note-12");
    expect(body.querySelector("img")).toBeNull();
    expect(body.textContent).toContain("<img src=x onerror=alert(1)> GPA > 2.0");
  });

  it("collapses a very long note without losing it", () => {
    renderPalette();
    open("Major Requirements — Fixture Science");
    const card = screen.getByTestId("department-note-13");
    expect(card.textContent).not.toContain("END-OF-NOTE");
    const more = within(card).getByRole("button", { name: "Show more" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(card.textContent).toContain("END-OF-NOTE");
    expect(within(card).getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("shows a program-level note on the group", () => {
    renderPalette();
    open("Major Requirements — Fixture Science");
    expect(screen.getByTestId("group-department-note-10").textContent).toContain("meet an advisor in Fall");
  });
});

describe("department changes to the wording", () => {
  it("marks a department edit and keeps the Bulletin wording available", () => {
    renderPalette();
    open("Major Requirements — Fixture Science");
    const mark = screen.getByTestId("mark-dept-edit-two");
    expect(mark.textContent).toBe("Department edit");
    expect(mark.getAttribute("title")).toContain("FX 2 — Two");
  });

  it("marks a requirement the department added as not from the Bulletin", () => {
    renderPalette();
    open("Major Requirements — Fixture Science");
    const mark = screen.getByTestId("mark-dept-added-dept-added");
    expect(mark.textContent).toBe("Added by Fixture Science");
    expect(mark.getAttribute("title")).toContain("Bulletin does not list it");
  });
});

describe("University degree rules", () => {
  it("are shown with their own category and offer nothing to place or add", () => {
    renderPalette();
    const trigger = screen.getByText("University Degree Requirements");
    expect(trigger.closest("[data-category-kind]")?.getAttribute("data-category-kind")).toBe("university");
    fireEvent.click(trigger);
    expect(screen.getByText("Minimum quarter units")).toBeTruthy();
    expect(screen.queryByTestId("add-placeholder-university-requirements-minimum-units")).toBeNull();
  });
});
