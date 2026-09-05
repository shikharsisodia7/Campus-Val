// @vitest-environment jsdom
/**
 * Regression coverage found while independently re-auditing the codebase for
 * the accessibility pattern the professor flagged before (raw `<div
 * onClick>` with no keyboard equivalent). The Planning Support chat's
 * conversation-list items and CourseCard's course tiles were already fixed
 * in an earlier pass, but this sidebar list item was missed: it was a plain
 * div with onClick and no role/tabIndex/keyboard handler, so a keyboard-only
 * or screen-reader user could not switch conversations at all.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey,
} from "@workspace/api-client-react";

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
  useLocation: () => ["/advisor", vi.fn()],
}));

import Advisor from "./advisor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAdvisor() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ isAdmin: false }), { status: 200 })),
    ),
  );
  // jsdom doesn't implement scrollTo — advisor.tsx auto-scrolls the message
  // pane on new messages.
  window.HTMLElement.prototype.scrollTo = vi.fn();

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const conversations = [
    { id: 1, title: "Can I take ENGR 1 and MATH 11 together?", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: 2, title: "Transfer credit question", createdAt: "2026-01-02T00:00:00.000Z" },
  ];
  queryClient.setQueryData(getListOpenaiConversationsQueryKey(), conversations);
  queryClient.setQueryData(getGetOpenaiConversationQueryKey(1), {
    id: 1,
    title: conversations[0]!.title,
    messages: [],
  });
  queryClient.setQueryData(getGetOpenaiConversationQueryKey(2), {
    id: 2,
    title: conversations[1]!.title,
    messages: [],
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Advisor />
    </QueryClientProvider>,
  );
}

describe("Advisor — conversation list accessibility", () => {
  it("exposes each conversation as a keyboard-reachable control, not a bare div only a mouse can activate", () => {
    renderAdvisor();

    const secondConvo = screen.getByTestId("conv-2");
    expect(secondConvo.getAttribute("role")).toBe("button");
    expect(secondConvo.getAttribute("tabindex")).toBe("0");
    expect(secondConvo.getAttribute("aria-label")).toMatch(/Transfer credit question/);
  });

  it("switches the active conversation on Enter, not just a mouse click", () => {
    renderAdvisor();

    const secondConvo = screen.getByTestId("conv-2");
    fireEvent.keyDown(secondConvo, { key: "Enter" });

    expect(secondConvo.getAttribute("aria-current")).toBe("true");
  });

  it("labels the delete button so it isn't just an unnamed icon", () => {
    renderAdvisor();

    expect(
      screen.getByRole("button", { name: /Delete conversation: Transfer credit question/i }),
    ).toBeTruthy();
  });
});
