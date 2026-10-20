// @vitest-environment jsdom
/**
 * The Core Curriculum page shows every school the student's majors bring in, and the Leavey School's
 * statements under the Core areas they describe. Opening a statement's source never checks the area off.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";

const setCompletion = vi.fn();
const base = {
  courses: [] as string[],
  phase: "Explorations",
  autoTracked: true,
  needsVerification: true,
  satisfiedBy: [] as string[],
  plannedBy: [] as string[],
  crossSatisfiedBy: [] as string[],
  status: "open",
  complete: false,
};
const group = (over: object) => ({
  sourceUrl: null,
  sourceLabel: "Bulletin",
  academicYear: "2099-00",
  lastVerified: "2099-01-01",
  notes: [],
  autoTrackedCount: 0,
  autoCompletedCount: 0,
  manualCount: 0,
  school: null,
  ...over,
});
const DATA = {
  college: "College of Arts and Sciences",
  collegeCode: "CAS",
  major: "BIOL",
  declaredMajor: "BIOL",
  schools: [],
  schoolWarnings: [],
  universityRules: { rules: [], sourceUrl: "https://www.scu.edu/", sourceLabel: "Bulletin" },
  groups: [
    group({
      id: "university-core",
      title: "University Core Curriculum",
      kind: "university_core",
      category: "CORE",
      items: [
        {
          ...base,
          id: "socsci",
          label: "Social Science",
          description: "One course from the approved Social Science list.",
          courses: ["ECON 1"],
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
              status: "open",
              sourceLabel: "Leavey School of Business — Core Curriculum for business students",
              sourceUrl: "https://www.scu.edu/business/undergraduates/core/",
              academicYear: "Current (page states no academic year)",
              lastVerified: "2099-01-01",
            },
          ],
        },
      ],
    }),
    group({ id: "college-cas", title: "College of Arts and Sciences Requirements", kind: "college", category: "SCHOOL", items: [] }),
    group({ id: "college-lsb", title: "Leavey School of Business Requirements", kind: "college", category: "SCHOOL", items: [] }),
  ],
};

vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return {
    ...actual,
    useGetDegreeRequirements: () => ({ data: DATA, isLoading: false, error: null }),
    useListRequirementCompletions: () => ({ data: [] }),
    useSetRequirementCompletion: () => ({ mutate: setCompletion, mutateAsync: setCompletion, isPending: false }),
    useResetRequirementCompletions: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import CoreReqs from "./core-reqs";

afterEach(cleanup);

describe("Core Curriculum page", () => {
  it("shows both schools and the Leavey statement under the Core area; its source does not check the area off", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CoreReqs />
      </QueryClientProvider>,
    );
    expect(screen.getByText("College of Arts and Sciences Requirements")).toBeTruthy();
    expect(screen.getByText("Leavey School of Business Requirements")).toBeTruthy();
    const card = screen.getByTestId("req-university-core-socsci");
    const note = within(card).getByTestId("core-annotation-lsb-core-socsci");
    expect(note.textContent).toContain("Social Science: ECON 1.");
    fireEvent.click(within(note).getByRole("button", { name: "Source" }));
    expect(within(note).getByRole("link", { name: "open source" })).toBeTruthy();
    expect(setCompletion).not.toHaveBeenCalled();
  });
});
