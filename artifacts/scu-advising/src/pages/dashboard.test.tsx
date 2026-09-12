// @vitest-environment jsdom
/**
 * Pilot-focus regression coverage for the Dashboard: the professor asked for
 * exactly three Quick Action workflows (Degree Plan / Quarter Plan /
 * Tentative Degree Plan), no AI-assistant action, a non-overclaiming
 * subtitle, and removal of registration/GPA/unit-cap/deadline snapshot
 * cards that CampusVal can't guarantee are current. Primary-major planning-
 * vs-SCU-record semantics from PR #45 must keep working unchanged.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@/hooks/use-track-usage", () => ({
  useTrackUsage: () => {},
}));

let mockSummary: any;
let mockProfile: any = { name: "QA Tester" };

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useGetProfile: () => ({
      data: mockProfile,
      isLoading: false,
      isError: false,
    }),
    getGetProfileQueryKey: () => ["/profile"],
    useGetDashboardSummary: () => ({ data: mockSummary, isLoading: false }),
  };
});

import Dashboard from "./dashboard";

function baseSummary(overrides: Record<string, any> = {}) {
  return {
    profile: {
      name: "QA Tester",
      college: "School of Engineering",
      major: "Computer Science & Engineering",
      secondMajor: null,
      minor: null,
      startTerm: "fall",
      startYear: 2024,
      expectedGradTerm: "spring",
      expectedGradYear: 2028,
      unitsCompletedAtSCU: 60,
      unitsTransferredIn: 0,
      priorityRegistration: false,
      currentTerm: "fall",
      currentYear: 2026,
      cumulativeGpa: 3.5,
      majorGpa: 3.6,
    },
    planningMajor: "CSE",
    declaredMajor: "CSE",
    classification: "Sophomore",
    totalUnitsAllSources: 60,
    unitsToGraduation: 115,
    progressPercent: 34,
    canOverloadNextTerm: false,
    overloadReason: "Standard load.",
    unitCapNextTerm: 19,
    registrationWindowNote: "Standard registration window.",
    todayTerm: "fall",
    todayYear: 2026,
    nextTerm: "winter",
    nextTermYear: 2027,
    upcomingDeadlines: [],
    warnings: [],
    currentRegistrationWindow: null,
    ...overrides,
  };
}

function renderDashboard() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ isAdmin: false }), { status: 200 })),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dashboard -- pilot-focused Quick Actions", () => {
  it("shows exactly the three key workflows with the professor's exact copy, and no AI assistant action", () => {
    mockSummary = baseSummary();
    renderDashboard();

    expect(screen.getByTestId("quick-degree-plan").textContent).toContain("Degree Plan");
    expect(screen.getByText("Build or update your academic plan")).toBeTruthy();

    expect(screen.getByTestId("quick-planner").textContent).toContain("Quarter Plan");
    expect(
      screen.getByText("Turn your intended courses into an actual quarter schedule"),
    ).toBeTruthy();

    expect(screen.getByTestId("quick-tentative-plans").textContent).toContain(
      "Tentative Degree Plan",
    );
    expect(
      screen.getByText(
        "Workshop another major or planning scenario without changing your main plan",
      ),
    ).toBeTruthy();

    expect(screen.queryByText(/Ask the AI assistant/i)).toBeNull();
    expect(screen.queryByTestId("quick-advisor")).toBeNull();
    expect(screen.queryByTestId("quick-transfer")).toBeNull();
    expect(screen.queryByTestId("quick-gpa")).toBeNull();
  });

  it("exposes a small Report Error / Suggest Changes action without a fourth Quick Action card", () => {
    mockSummary = baseSummary();
    renderDashboard();
    expect(screen.getByTestId("dashboard-report-error")).toBeTruthy();
  });
});

describe("Dashboard -- no overclaiming, no unverifiable snapshot data", () => {
  it("does not claim to be grounded in real SCU policy/transcript data", () => {
    mockSummary = baseSummary();
    renderDashboard();
    expect(screen.queryByText(/grounded in real SCU policy/i)).toBeNull();
  });

  it("states CampusVal is an evaluation workspace and defers to Workday/Registrar/Bulletin", () => {
    mockSummary = baseSummary();
    renderDashboard();
    expect(screen.getByText(/under (pilot )?evaluation/i)).toBeTruthy();
    expect(screen.getAllByText(/Workday/).length).toBeGreaterThan(0);
  });

  it("removes the registration-window prediction banner", () => {
    mockSummary = baseSummary({
      currentRegistrationWindow: {
        status: "open",
        headline: "Registration opens soon",
        detail: "Detail",
        publishedSource: "Registrar",
      },
    });
    renderDashboard();
    expect(screen.queryByTestId("registration-banner")).toBeNull();
  });

  it("removes the overload-eligibility and unit-cap stat cards", () => {
    mockSummary = baseSummary();
    renderDashboard();
    expect(screen.queryByText("Overload eligibility")).toBeNull();
    expect(screen.queryByText("Next-term unit cap")).toBeNull();
  });

  it("removes the cumulative/major GPA stat card", () => {
    mockSummary = baseSummary();
    renderDashboard();
    expect(screen.queryByText("Cumulative GPA")).toBeNull();
    expect(screen.queryByText(/Major GPA/)).toBeNull();
  });

  it("removes the upcoming-deadlines list", () => {
    mockSummary = baseSummary({
      upcomingDeadlines: [
        { title: "Registration opens", date: "2026-11-01", description: "desc" },
      ],
    });
    renderDashboard();
    expect(screen.queryByText("Registration opens")).toBeNull();
  });

  it("still surfaces real, actionable warnings (not a stale prediction) when present", () => {
    mockSummary = baseSummary({ warnings: ["You're close to the transfer-credit cap."] });
    renderDashboard();
    expect(screen.getByText("You're close to the transfer-credit cap.")).toBeTruthy();
  });
});

describe("Dashboard -- primary-major planning-vs-record semantics (PR #45, must not regress)", () => {
  it("shows the planning-intent hint when the planning major differs from the SCU/Workday record", () => {
    mockSummary = baseSummary({ planningMajor: "CHEM", declaredMajor: "BIOL" });
    renderDashboard();
    const hint = screen.getByTestId("dashboard-planning-major-note");
    expect(hint.textContent).toContain("Planning intent");
    expect(hint.textContent).toContain("BIOL");
  });

  it("shows no hint when the planning major matches the declared record", () => {
    mockSummary = baseSummary({ planningMajor: "CSE", declaredMajor: "CSE" });
    renderDashboard();
    expect(screen.queryByTestId("dashboard-planning-major-note")).toBeNull();
  });
});

describe("Dashboard -- what you're planning summary", () => {
  it("shows planning major, college, and expected graduation up top", () => {
    mockSummary = baseSummary();
    renderDashboard();
    const card = screen.getByTestId("dashboard-plan-summary");
    expect(card.textContent).toContain("School of Engineering");
    expect(card.textContent).toContain("Computer Science & Engineering");
    expect(card.textContent).toContain("2028");
  });
});
