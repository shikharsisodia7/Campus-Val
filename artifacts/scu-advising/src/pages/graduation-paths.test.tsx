// @vitest-environment jsdom
/**
 * Regression coverage for the engineering-only preload correction:
 * the "Load Engineering Four-Year Plan" action must only ever appear for a
 * sequence CampusVal has marked "prescribed" (verified against an official
 * SCU source) — never for a "recommended" or "example" sequence — and it
 * must never silently overwrite courses already in the student's plan.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockAddPlanItemMutate = vi.fn();

vi.mock("@clerk/react", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      fullName: "QA Tester",
      firstName: "QA",
      primaryEmailAddress: { emailAddress: "qatest@scu.edu" },
    },
  }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ["/graduation-paths", vi.fn()],
}));

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useGetProfile: () => ({
      data: { major: "CSE", secondMajor: null, startYear: 2026, completedCourseCodes: [] },
    }),
    useListPlans: () => ({ data: { plans: [{ id: 1, planType: "degree" }] } }),
    useAddPlanItem: () => ({ mutateAsync: mockAddPlanItemMutate }),
  };
});

import GraduationPaths from "./graduation-paths";

function pathResponse(sequenceTrust: "prescribed" | "recommended" | "example") {
  return {
    type: "four_year",
    major: "CSE",
    title: "Computer Science & Engineering — Standard 4-Year Path",
    summary: "test",
    feasibilityNote: "test",
    averageUnitsPerQuarter: 15,
    requiresOverload: false,
    sequenceTrust,
    provenance: {
      sourceUrl: sequenceTrust === "example" ? undefined : "https://www.scu.edu/example.pdf",
      sourceLabel: "SCU test source",
      catalogYear: "2023-24",
      verificationNote: "test note",
    },
    risks: [],
    quarters: [
      {
        year: 1,
        term: "fall",
        label: "Y1 Fall",
        courses: ["Core: Critical Thinking & Writing 1", "MATH 11", "CHEM 11", "CSEN 10 or ENGR 1"],
        plannedUnits: 12,
      },
    ],
  };
}

function mockFetchFor(sequenceTrust: "prescribed" | "recommended" | "example") {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/graduation-paths/majors")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ majors: [{ code: "CSE", title: "CSE", college: "SOE" }] }),
        });
      }
      if (url.includes("/graduation-paths/requirements")) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(pathResponse(sequenceTrust)),
      });
    }) as any,
  );
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GraduationPaths />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockAddPlanItemMutate.mockReset();
  mockAddPlanItemMutate.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Graduation Paths — engineering preload scope", () => {
  it("shows the preload action for a prescribed sequence", async () => {
    mockFetchFor("prescribed");
    renderPage();
    await screen.findByTestId("button-load-engineering-plan");
    expect(screen.getByTestId("sequence-trust-badge").textContent).toContain("Prescribed");
  });

  it("never shows the preload action for a recommended sequence", async () => {
    mockFetchFor("recommended");
    renderPage();
    await screen.findByTestId("sequence-trust-badge");
    expect(screen.queryByTestId("button-load-engineering-plan")).toBeNull();
  });

  it("never shows the preload action for an example-only sequence", async () => {
    mockFetchFor("example");
    renderPage();
    await screen.findByTestId("sequence-trust-badge");
    expect(screen.queryByTestId("button-load-engineering-plan")).toBeNull();
  });

  it("only adds real course codes, skipping Core/elective/choice slots, and never silently overwrites", async () => {
    mockFetchFor("prescribed");
    renderPage();
    await screen.findByTestId("button-load-engineering-plan");

    fireEvent.click(screen.getByTestId("button-load-engineering-plan"));
    const confirmButton = await screen.findByTestId("button-confirm-preload");
    fireEvent.click(confirmButton);

    await waitFor(() => {
      // Only MATH 11 and CHEM 11 are real, addable codes — the Core slot
      // and the "X or Y" choice slot must never be sent to the API.
      expect(mockAddPlanItemMutate).toHaveBeenCalledTimes(2);
    });
    const sentCodes = mockAddPlanItemMutate.mock.calls.map((c) => c[0].data.courseCode);
    expect(sentCodes.sort()).toEqual(["CHEM 11", "MATH 11"]);
    // No allowDuplicate flag is ever sent — a course already in the plan
    // must 409 and be skipped, never silently overwritten.
    for (const call of mockAddPlanItemMutate.mock.calls) {
      expect(call[0].data.allowDuplicate).toBeUndefined();
    }

    await screen.findByText(/Added 2 courses/);
  });
});
