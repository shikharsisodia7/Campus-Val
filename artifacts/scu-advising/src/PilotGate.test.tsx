// @vitest-environment jsdom
/**
 * Route-gating regression coverage: proves PilotGate (used to wrap every
 * PILOT_HIDDEN route in App.tsx) blocks and redirects a non-admin while
 * rendering unchanged for an admin -- the same rule desktop/mobile nav
 * already enforce via lib/pilot-features.ts, now proven at the route level
 * so a direct URL can never bypass nav hiding.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const setLocationMock = vi.fn();
const toastMock = vi.fn();
let adminStatus: { isAdmin: boolean; isLoading: boolean; canUseDegreeCompletionRND: boolean } = {
  isAdmin: false,
  isLoading: false,
  canUseDegreeCompletionRND: false,
};

vi.mock("wouter", () => ({
  useLocation: () => ["/advice", setLocationMock],
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/hooks/use-is-admin", () => ({
  useAdminStatus: () => adminStatus,
}));

import { PilotGate } from "./App";

describe("PilotGate", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing and redirects a non-admin away from a PILOT_HIDDEN route, with a pilot-scoped toast", async () => {
    adminStatus = { isAdmin: false, isLoading: false, canUseDegreeCompletionRND: false };
    render(
      <PilotGate path="/advice">
        <div data-testid="hidden-feature">Advice Board content</div>
      </PilotGate>,
    );

    expect(screen.queryByTestId("hidden-feature")).toBeNull();
    await waitFor(() => expect(setLocationMock).toHaveBeenCalledWith("/"));
    expect(toastMock).toHaveBeenCalledTimes(1);
    const call = toastMock.mock.calls[0][0];
    expect(call.title).toMatch(/not part of the current pilot/i);
  });

  it("renders the real feature unchanged for an admin, never redirecting", async () => {
    adminStatus = { isAdmin: true, isLoading: false, canUseDegreeCompletionRND: false };
    render(
      <PilotGate path="/advice">
        <div data-testid="hidden-feature">Advice Board content</div>
      </PilotGate>,
    );

    expect(screen.getByTestId("hidden-feature")).toBeTruthy();
    expect(setLocationMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("renders nothing yet while the admin check is still loading -- never flashes the feature or redirects early", () => {
    adminStatus = { isAdmin: false, isLoading: true, canUseDegreeCompletionRND: false };
    render(
      <PilotGate path="/advice">
        <div data-testid="hidden-feature">Advice Board content</div>
      </PilotGate>,
    );

    expect(screen.queryByTestId("hidden-feature")).toBeNull();
    expect(setLocationMock).not.toHaveBeenCalled();
  });

  it("renders a PILOT_VISIBLE/CORE path's children unchanged for a non-admin (no gating)", () => {
    adminStatus = { isAdmin: false, isLoading: false, canUseDegreeCompletionRND: false };
    render(
      <PilotGate path="/courses">
        <div data-testid="visible-feature">Course Catalog content</div>
      </PilotGate>,
    );

    expect(screen.getByTestId("visible-feature")).toBeTruthy();
    expect(setLocationMock).not.toHaveBeenCalled();
  });

  it("keeps the assessment R&D route hidden from an admin until the server capability is enabled", async () => {
    adminStatus = { isAdmin: true, isLoading: false, canUseDegreeCompletionRND: false };
    render(
      <PilotGate path="/experimental/apr-assessment">
        <div data-testid="rnd-feature">Experimental assessment</div>
      </PilotGate>,
    );

    expect(screen.queryByTestId("rnd-feature")).toBeNull();
    await waitFor(() => expect(setLocationMock).toHaveBeenCalledWith("/"));
  });

  it("renders the assessment R&D route only for an authorized enabled admin", () => {
    adminStatus = { isAdmin: true, isLoading: false, canUseDegreeCompletionRND: true };
    render(
      <PilotGate path="/experimental/apr-assessment">
        <div data-testid="rnd-feature">Experimental assessment</div>
      </PilotGate>,
    );

    expect(screen.getByTestId("rnd-feature")).toBeTruthy();
    expect(setLocationMock).not.toHaveBeenCalled();
  });
});
