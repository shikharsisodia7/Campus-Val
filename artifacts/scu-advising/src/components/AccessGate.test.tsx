// @vitest-environment jsdom
/**
 * AccessGate is the UI half of the pilot access policy: the server refuses
 * every data request from an account outside the pilot, and this shows such an
 * account one clear message instead of the app. It must fail closed — nothing
 * of the app renders while the check is loading or after it fails.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const signOutMock = vi.fn();
vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: { primaryEmailAddress: { emailAddress: "not-invited@scu.edu" } } }),
  useClerk: () => ({ signOut: signOutMock }),
}));

import { AccessGate } from "./AccessGate";

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccessGate>
        <div data-testid="app-content">Dashboard</div>
      </AccessGate>
    </QueryClientProvider>,
  );
}

function mockAccess(response: { status: number; body?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(response.body ?? {}), { status: response.status })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AccessGate", () => {
  it("shows the pilot message and not the app to an account the server refuses", async () => {
    mockAccess({
      status: 200,
      body: {
        allowed: false,
        accessMode: "pilot",
        message:
          "CampusVal is currently available only to invited pilot participants while SCU reviews hosting, security, and rollout.",
      },
    });
    renderGate();
    expect(await screen.findByTestId("pilot-access-denied")).toBeTruthy();
    expect(screen.getByText(/invited pilot participants/)).toBeTruthy();
    expect(screen.getByText("not-invited@scu.edu")).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
    expect(screen.getByTestId("button-access-sign-out")).toBeTruthy();
  });

  it("renders the app for an admitted account", async () => {
    mockAccess({ status: 200, body: { allowed: true, accessMode: "pilot", message: null } });
    renderGate();
    expect(await screen.findByTestId("app-content")).toBeTruthy();
  });

  it("fails closed: a failed access check never renders the app", async () => {
    mockAccess({ status: 500 });
    renderGate();
    // The hook retries once (about a second) before reporting the failure.
    await waitFor(() => expect(screen.getByText(/couldn.t confirm your access/i)).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByTestId("app-content")).toBeNull();
  });

  it("renders nothing of the app while the check is in flight", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    renderGate();
    expect(screen.getByText(/checking access/i)).toBeTruthy();
    expect(screen.queryByTestId("app-content")).toBeNull();
  });
});
