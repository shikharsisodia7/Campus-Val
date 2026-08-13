// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("AppShell primary navigation", () => {
  afterEach(() => cleanup());

  it("labels the four primary planning items and Additional Features", () => {
    render(
      <AppShell>
        <div>child</div>
      </AppShell>,
    );

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
    expect(screen.getByTestId("nav-additional-features").textContent).toContain(
      "Additional Features",
    );
    expect(screen.queryByText("Tentative Plans")).toBeNull();
    expect(screen.queryByText(/What[- ]?If/i)).toBeNull();
    expect(screen.queryByText("Weekly Schedule")).toBeNull();
  });
});
