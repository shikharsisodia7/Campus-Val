// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

describe("AppShell primary navigation", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("labels the four primary planning items, and reduces secondary nav to 'More tools' by default", async () => {
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
    // Reduced cognitive load for the controlled tester cohort: secondary
    // features are de-emphasized as "More tools", never deleted.
    await waitFor(() =>
      expect(screen.getByTestId("nav-additional-features").textContent).toContain(
        "More tools",
      ),
    );
    expect(screen.queryByText("Tentative Plans")).toBeNull();
    expect(screen.queryByText(/What[- ]?If/i)).toBeNull();
    expect(screen.queryByText("Weekly Schedule")).toBeNull();
  });

  it("shows the full 'Additional Features' label for an admin", async () => {
    renderWithProviders(true);
    await waitFor(() =>
      expect(screen.getByTestId("nav-additional-features").textContent).toContain(
        "Additional Features",
      ),
    );
  });
});
