// @vitest-environment jsdom
/**
 * The sidebar for a plan whose majors span schools (Biology + Finance).
 *
 * Each school the plan's majors belong to has its own SCHOOL group, which says
 * which of the plan's majors bring it in; there is one University Core, and the
 * Leavey School's Core statements sit under the Core items they describe, with
 * their source one click away. Groups start collapsed and toggle independently.
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
const groupBase = {
  sourceUrl: null,
  sourceLabel: "Fixture Bulletin",
  academicYear: "2099-00",
  lastVerified: "2099-01-01",
  notes: [] as string[],
  autoTrackedCount: 1,
  autoCompletedCount: 0,
  manualCount: 0,
  school: null,
};
const leaveySource = {
  sourceLabel: "Leavey School of Business — Core Curriculum for business students",
  sourceUrl: "https://www.scu.edu/business/undergraduates/core/",
  academicYear: "Current (page states no academic year)",
  lastVerified: "2099-01-01",
};

const groups = [
  {
    ...groupBase,
    id: "major-primary",
    stableKey: "major:biology",
    category: "MAJOR",
    kind: "major",
    title: "Major Requirements — Biology",
    items: [{ ...base, id: "major-primary-biol-1a", stableKey: "major:biology#biol-1a", label: "BIOL 1A — Investigations", courses: ["BIOL 1A"] }],
  },
  {
    ...groupBase,
    id: "university-core",
    stableKey: "university-core:cas",
    category: "CORE",
    kind: "university_core",
    title: "University Core Curriculum",
    items: [
      {
        ...base,
        id: "socsci",
        stableKey: "university-core:cas#socsci",
        label: "Social Science",
        courses: ["ECON 1"],
        status: "completed" as const,
        complete: true,
        satisfiedBy: ["ECON 1"],
        annotations: [
          {
            id: "lsb-core-socsci",
            kind: "school_core_fulfillment",
            school: "LSB",
            schoolName: "Leavey School of Business",
            text: "Social Science: ECON 1.",
            courses: ["ECON 1"],
            routes: [{ label: "ECON 1", parts: [["ECON 1"]] }],
            programScope: null,
            schoolRequirementIds: ["lsb-econ1"],
            status: "completed",
            ...leaveySource,
          },
        ],
      },
      {
        ...base,
        id: "advwriting",
        stableKey: "university-core:cas#advwriting",
        label: "Advanced Writing",
        courses: ["BUSN 179"],
        annotations: [
          {
            id: "lsb-core-advwriting",
            kind: "school_core_fulfillment",
            school: "LSB",
            schoolName: "Leavey School of Business",
            text: "Advanced Writing: BUSN 179.",
            courses: ["BUSN 179"],
            routes: [{ label: "BUSN 179", parts: [["BUSN 179"]] }],
            programScope: null,
            schoolRequirementIds: [],
            status: "open",
            ...leaveySource,
          },
        ],
      },
    ],
  },
  {
    ...groupBase,
    id: "college-cas",
    stableKey: "college-cas",
    category: "SCHOOL",
    kind: "college",
    title: "College of Arts and Sciences Requirements",
    school: { code: "CAS", name: "College of Arts and Sciences", activatedBy: ["Biology"] },
    items: [{ ...base, id: "cas-units", stableKey: "college-cas#cas-units", label: "175 quarter units (min), 60 upper-division", autoTracked: false, needsVerification: true }],
  },
  {
    ...groupBase,
    id: "college-lsb",
    stableKey: "college-lsb",
    category: "SCHOOL",
    kind: "college",
    title: "Leavey School of Business Requirements",
    school: { code: "LSB", name: "Leavey School of Business", activatedBy: ["Finance (B.S. Commerce)"] },
    items: [
      { ...base, id: "lsb-busn70", stableKey: "college-lsb#lsb-busn70", label: "Contemporary Business Issues", courses: ["BUSN 70"], status: "completed" as const, complete: true },
      { ...base, id: "lsb-econ1", stableKey: "college-lsb#lsb-econ1", label: "Principles of Microeconomics", courses: ["ECON 1"], status: "completed" as const, complete: true },
      { ...base, id: "lsb-fnce121", stableKey: "college-lsb#lsb-fnce121", label: "Common Core: FNCE 121", courses: ["FNCE 121"] },
    ],
  },
  {
    ...groupBase,
    id: "major-extra-1",
    stableKey: "major:finance-b-s-commerce",
    category: "MAJOR",
    kind: "major",
    title: "Major Requirements — Finance (B.S. Commerce)",
    items: [{ ...base, id: "major-extra-1-fnce-124", stableKey: "major:finance-b-s-commerce#fnce-124", label: "FNCE 124 — Intermediate", courses: ["FNCE 124"] }],
  },
];

function renderPalette() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DegreePlanProvider
        value={{
          activePlan: { id: 7, name: "Degree Plan", planType: "degree", items: [], metadata: {}, sourcePlanId: null, createdAt: "", updatedAt: "" } as never,
          activePlanId: 7,
          setActivePlanId: vi.fn(),
          profile: undefined,
          requirements: groups as never,
          requirementsMeta: { sourceLabel: "x", policyDecided: false, summary: { edited: 0, hidden: 0, custom: 0, sourceChanged: 0, orphaned: 0 }, orphaned: [] } as never,
          scheduleAvailability: undefined,
          catalog: [],
        }}
      >
        <Palette />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}
const trigger = (title: string) => screen.getByText(title).closest("button")!;

describe("a Biology + Finance plan's sidebar", () => {
  it("shows both schools' groups, one Core, and both majors, all collapsed at first", () => {
    renderPalette();
    const kinds = Array.from(document.querySelectorAll("[data-category-kind]")).map((el) => el.getAttribute("data-category-kind"));
    expect(kinds).toEqual(["major", "university_core", "college", "college", "major"]);
    expect(screen.getAllByText("University Core Curriculum")).toHaveLength(1);
    for (const title of ["College of Arts and Sciences Requirements", "Leavey School of Business Requirements"]) {
      expect(trigger(title).getAttribute("aria-expanded")).toBe("false");
    }
  });

  it("says which of the plan's majors bring each school in", () => {
    renderPalette();
    expect(screen.getByTestId("school-activated-by-LSB").textContent).toBe("Required for Leavey business majors · Finance (B.S. Commerce)");
    expect(screen.getByTestId("school-activated-by-CAS").textContent).toBe("School requirements · Biology");
  });

  it("opens the Leavey group on its own, with its requirements and their status", () => {
    renderPalette();
    fireEvent.click(trigger("Leavey School of Business Requirements"));
    expect(trigger("Leavey School of Business Requirements").getAttribute("aria-expanded")).toBe("true");
    expect(trigger("Major Requirements — Finance (B.S. Commerce)").getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Contemporary Business Issues")).toBeTruthy();
    expect(screen.getByText("Common Core: FNCE 121")).toBeTruthy();
    expect(screen.getAllByLabelText("Satisfied")).toHaveLength(2);
  });

  it("puts the Leavey statement under the Core item, in words, with its source behind a disclosure", () => {
    renderPalette();
    fireEvent.click(trigger("University Core Curriculum"));
    const note = screen.getByTestId("core-annotation-lsb-core-socsci");
    expect(within(note).getByText("Leavey School of Business")).toBeTruthy();
    expect(note.textContent).toContain("Social Science: ECON 1.");
    // Status and overlap are stated in text, not by color alone.
    expect(note.textContent).toContain("Completed on this route");
    expect(note.textContent).toContain("Also a Leavey School of Business requirement");
    const source = within(note).getByRole("button", { name: "Source" });
    expect(source.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("core-annotation-lsb-core-socsci-source")).toBeNull();
    fireEvent.click(source);
    expect(source.getAttribute("aria-expanded")).toBe("true");
    const shown = screen.getByTestId("core-annotation-lsb-core-socsci-source");
    expect(shown.textContent).toContain("Leavey School of Business — Core Curriculum for business students");
    expect(within(shown).getByRole("link", { name: "open source" }).getAttribute("href")).toBe("https://www.scu.edu/business/undergraduates/core/");
  });

  it("keeps an open Core area open with the Leavey route offered as a course to add", () => {
    renderPalette();
    fireEvent.click(trigger("University Core Curriculum"));
    const note = screen.getByTestId("core-annotation-lsb-core-advwriting");
    expect(note.getAttribute("data-annotation-status")).toBe("open");
    expect(note.textContent).not.toContain("Completed");
    // The route's course is interactive, not dead text.
    expect(screen.getAllByText("BUSN 179").length).toBeGreaterThan(0);
  });

  it("gives a student no control that edits a school statement", () => {
    renderPalette();
    fireEvent.click(trigger("University Core Curriculum"));
    fireEvent.click(screen.getByTestId("toggle-edit-requirements"));
    const note = screen.getByTestId("core-annotation-lsb-core-socsci");
    expect(within(note).queryAllByRole("button").map((b) => b.textContent)).toEqual(["Source"]);
    expect(within(note).queryAllByRole("textbox")).toHaveLength(0);
  });
});
