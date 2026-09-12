// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";

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

function renderWithProviders(isAdmin: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ isAdmin }), { status: 200 }),
      ),
    ),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <div>child</div>
      </AppShell>
    </QueryClientProvider>,
  );
}

async function openMobileAdditionalFeatures() {
  fireEvent.click(await screen.findByLabelText("Open navigation"));
  const details = await screen.findByTestId("mobile-additional-features");
  fireEvent.click(within(details).getByText("Additional Features"));
  return details;
}

describe("AppShell primary navigation", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("labels the four primary planning items", async () => {
    renderWithProviders(false);

    expect(screen.getByTestId("primary-nav")).toBeTruthy();
    expect(screen.getByTestId("nav-dashboard").textContent).toContain(
      "Dashboard",
    );
    expect(screen.getByTestId("nav-degree-plan").textContent).toContain(
      "Degree Plan",
    );
    expect(screen.getByTestId("nav-quarter-plan").textContent).toContain(
      "Quarter Plan",
    );
    expect(
      screen.getByTestId("nav-tentative-degree-plan").textContent,
    ).toContain("Tentative Degree Plan");
  });

  it("labels the secondary nav 'Additional Features' for a non-admin pilot tester", async () => {
    renderWithProviders(false);
    await waitFor(() =>
      expect(screen.getByTestId("nav-additional-features").textContent).toContain(
        "Additional Features",
      ),
    );
  });

  it("labels the secondary nav 'Additional Features' for an admin too", async () => {
    renderWithProviders(true);
    await waitFor(() =>
      expect(screen.getByTestId("nav-additional-features").textContent).toContain(
        "Additional Features",
      ),
    );
  });

  it("shows a Pilot badge in the header", async () => {
    renderWithProviders(false);
    expect(screen.getByTestId("badge-pilot").textContent).toContain("Pilot");
  });
});

describe("AppShell -- pilot feature visibility (mobile nav)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows only PILOT_VISIBLE items to a non-admin, never PILOT_HIDDEN ones", async () => {
    renderWithProviders(false);
    const details = await openMobileAdditionalFeatures();

    // PILOT_VISIBLE — the conservative kept set
    expect(within(details).getByText("Course Catalog")).toBeTruthy();
    expect(within(details).getByText("GPA Calculator")).toBeTruthy();
    expect(within(details).getByText("Transfer Credit")).toBeTruthy();
    expect(within(details).getByText(/Workday APR/)).toBeTruthy();
    expect(within(details).getByText("SCU Resources")).toBeTruthy();
    expect(within(details).getByText("Shared with Me (Advisors)")).toBeTruthy();
    expect(within(details).getByText("Core Curriculum")).toBeTruthy();

    // PILOT_HIDDEN — must not render for an ordinary pilot tester
    expect(within(details).queryByText("Advice Board")).toBeNull();
    expect(within(details).queryByText("Planning Support")).toBeNull();
    expect(within(details).queryByText("Voice Planning Support")).toBeNull();
    expect(within(details).queryByText("SCU Policies")).toBeNull();
    expect(within(details).queryByText("AI Evaluation")).toBeNull();
    expect(within(details).queryByText("Graduation Paths")).toBeNull();
    expect(within(details).queryByText("Sync Workday Sections")).toBeNull();
    expect(within(details).queryByText("Feedback (legacy)")).toBeNull();
    expect(within(details).queryByText("Professors")).toBeNull();
    expect(within(details).queryByText("Compare Courses")).toBeNull();
  });

  it("shows PILOT_HIDDEN items to an admin, in a clearly separated group", async () => {
    renderWithProviders(true);
    const details = await openMobileAdditionalFeatures();

    expect(within(details).getByText("Advice Board")).toBeTruthy();
    expect(within(details).getByText("Planning Support")).toBeTruthy();
    expect(within(details).getByText("Voice Planning Support")).toBeTruthy();
    expect(within(details).getByText("SCU Policies")).toBeTruthy();
    expect(within(details).getByText("AI Evaluation")).toBeTruthy();
    expect(within(details).getByText("Graduation Paths")).toBeTruthy();
    expect(within(details).getByText("Sync Workday Sections")).toBeTruthy();
    expect(within(details).getByText("Feedback (legacy)")).toBeTruthy();
    expect(within(details).getByText("Professors")).toBeTruthy();
    expect(within(details).getByText("Compare Courses")).toBeTruthy();
    expect(within(details).getByText("Hidden during pilot (admin/dev only)")).toBeTruthy();
  });
});

describe("AppShell -- Report Error / Suggest Changes placement", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("places the desktop header button after Additional Features and before the account menu, in DOM order", async () => {
    const { container } = renderWithProviders(false);
    await waitFor(() => expect(screen.getByTestId("button-report-error")).toBeTruthy());

    const additionalFeatures = screen.getByTestId("nav-additional-features");
    const reportButton = screen.getByTestId("button-report-error");
    const accountMenuLabel = await screen.findByLabelText(/Account menu for/i);

    const order = Array.from(
      container.querySelectorAll(
        `[data-testid="nav-additional-features"], [data-testid="button-report-error"], [aria-label^="Account menu for"]`,
      ),
    );
    expect(order[0]).toBe(additionalFeatures);
    expect(order[1]).toBe(reportButton);
    expect(order[2]).toBe(accountMenuLabel);
  });

  it("carries the full-phrase tooltip regardless of the responsive text shown", async () => {
    renderWithProviders(false);
    await waitFor(() =>
      expect(screen.getByTestId("button-report-error").getAttribute("title")).toBe(
        "Report Error / Suggest Changes",
      ),
    );
  });

  it("also exposes the action in the mobile navigation sheet", async () => {
    renderWithProviders(false);
    fireEvent.click(await screen.findByLabelText("Open navigation"));
    await waitFor(() => expect(screen.getByTestId("button-report-error-mobile")).toBeTruthy());
  });
});
