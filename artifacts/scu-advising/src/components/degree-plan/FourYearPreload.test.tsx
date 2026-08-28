// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Radix menus open on pointerdown, not a plain click, under jsdom. */
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(trigger);
}

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual<any>("@workspace/api-client-react");
  return {
    ...actual,
    useGetProfile: () => ({ data: { major: "CSE", startYear: 2024 } }),
    useAddPlanItem: () => ({ mutateAsync: vi.fn() }),
  };
});

import { FourYearPreload } from "./FourYearPreload";

const INDEX_RESPONSE = {
  majors: [
    { code: "CSE", title: "Computer Science & Engineering", sequenceTrust: "prescribed" },
    { code: "ECEN", title: "Electrical & Computer Engineering", sequenceTrust: "recommended" },
  ],
};

function mockFetchSequence(indexBody: any) {
  global.fetch = vi.fn((url: string) => {
    if (url.includes("four_year_index")) {
      return Promise.resolve({ ok: true, json: async () => indexBody } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        type: "four_year",
        major: "CSE",
        title: "Computer Science & Engineering — Standard 4-Year Path",
        summary: "test",
        feasibilityNote: "test",
        averageUnitsPerQuarter: 15,
        requiresOverload: false,
        sequenceTrust: "prescribed",
        provenance: { sourceUrl: "https://scu.edu/x", sourceLabel: "SCU source" },
        quarters: [{ year: 1, term: "fall", label: "Y1 Fall", courses: ["CSCI 10"], plannedUnits: 5 }],
        risks: [],
      }),
    } as Response);
  }) as any;
}

function renderComp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FourYearPreload degreePlan={{ id: 1 }} />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());
beforeEach(() => vi.restoreAllMocks());

describe("FourYearPreload dropdown", () => {
  it("renders nothing while the verified-plan index is empty", async () => {
    mockFetchSequence({ majors: [] });
    const { container } = renderComp();
    await waitFor(() => expect(container.querySelector("button")).toBeNull());
  });

  it("lists only majors with a real (non-example) plan, never a fabricated one", async () => {
    mockFetchSequence(INDEX_RESPONSE);
    renderComp();
    const trigger = await screen.findByTestId("button-load-four-year-plan");
    openMenu(trigger);

    expect(await screen.findByTestId("four-year-menu-item-CSE")).toBeTruthy();
    expect(screen.getByTestId("four-year-menu-item-ECEN")).toBeTruthy();
    expect(screen.getByText(/Majors with a department-defined four-year plan/)).toBeTruthy();
    expect(
      screen.getByText(/Most majors don't publish a fixed four-year plan/),
    ).toBeTruthy();
  });

  it("marks the student's own declared major in the list", async () => {
    mockFetchSequence(INDEX_RESPONSE);
    renderComp();
    openMenu(await screen.findByTestId("button-load-four-year-plan"));
    expect(screen.getByText("(your major)")).toBeTruthy();
  });

  it("opens the preload dialog for a selected 'prescribed' major with a one-click load button", async () => {
    mockFetchSequence(INDEX_RESPONSE);
    renderComp();
    openMenu(await screen.findByTestId("button-load-four-year-plan"));
    fireEvent.click(await screen.findByTestId("four-year-menu-item-CSE"));

    expect(await screen.findByTestId("dialog-four-year-preload")).toBeTruthy();
    expect(await screen.findByTestId("button-confirm-four-year-preload")).toBeTruthy();
  });
});
