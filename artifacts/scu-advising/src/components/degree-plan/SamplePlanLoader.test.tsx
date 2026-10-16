// @vitest-environment jsdom
/**
 * Load Sample Plan: browse by school and program, preview, then create a NEW
 * Tentative Degree Plan. The default never touches an existing plan, and adding
 * to the Degree Plan needs an explicit confirmation.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const customFetch = vi.fn();
vi.mock("@workspace/api-client-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/api-client-react")>();
  return { ...actual, customFetch: (...args: unknown[]) => customFetch(...args) };
});

import { SamplePlanLoader } from "./SamplePlanLoader";
import { DegreePlanProvider } from "./DegreePlanContext";

afterEach(cleanup);
beforeEach(() => {
  // Braces matter: returning the mock would make vitest call it as a cleanup hook.
  customFetch.mockReset();
});

const browse = {
  schools: [
    {
      code: "CAS",
      name: "College of Arts and Sciences",
      programs: [{ program: "Biology", plans: [{ id: 5, slug: "cas-bio-1", version: "2026-27", school: "CAS", schoolName: "College of Arts and Sciences", program: "Biology", title: "First-year plan — Option One", description: null, planLength: "first_year", sourceType: "official_department" as const, academicYear: null, sourceLabel: "CAS first-year course plan: Biology", sourceUrl: "https://example.test/plan", sourceReference: "Biology.docx, Option One", importedAt: "2026-01-15T12:00:00.000Z", status: "published" as const }] }],
    },
    { code: "SOE", name: "School of Engineering", programs: [{ program: "Civil Engineering", plans: [{ id: 6, slug: "soe-civil", version: "2026-27", school: "SOE", schoolName: "School of Engineering", program: "Civil Engineering", title: "Four-year plan", description: null, planLength: "four_year", sourceType: "official_department" as const, academicYear: "2026-27", sourceLabel: "SOE four-year plan", sourceUrl: "https://example.test/engineering", sourceReference: "Civil Engineering four-year plan", importedAt: "2026-01-15T12:00:00.000Z", status: "published" as const }] }] },
  ],
};
const preview = {
  ...browse.schools[0]!.programs[0]!.plans[0]!,
  warnings: [{ code: "course_not_in_catalog", message: "ZZZZ 999 is not in the CampusVal catalog; it is loaded as a placeholder." }],
  terms: {
    "1:fall": [{ kind: "course", courseCode: "BIOL 1A", title: "Cell Biology", units: 5, label: null, note: null }, { kind: "placeholder", courseCode: null, title: null, units: null, label: "CTW 1", note: null }],
    "1:winter": [{ kind: "course", courseCode: "BIOL 1B", title: "Genetics", units: 5, label: null, note: null }],
  },
};

function mount(planType: "degree" | "tentative" = "degree") {
  const setActivePlanId = vi.fn();
  customFetch.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    if (url === "/api/sample-plans") return browse;
    if (url === "/api/sample-plans/5") return preview;
    if (url === "/api/sample-plans/5/load") return { plan: { id: 99, name: "Biology — First-year plan" }, added: 3, skippedDuplicates: ["BIOL 1A"], warnings: [], loadedAsPlaceholders: ["ZZZZ 999"], _body: init?.body };
    throw new Error(`unexpected ${String(url)}`);
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DegreePlanProvider
        value={{
          activePlan: { id: 7, name: planType === "degree" ? "Degree Plan" : "My scenario", planType, items: [], metadata: {}, sourcePlanId: null, createdAt: "", updatedAt: "" } as any,
          activePlanId: 7,
          setActivePlanId,
          profile: { currentYear: 2026 } as any,
          requirements: [],
          scheduleAvailability: undefined,
          catalog: [],
        }}
      >
        <SamplePlanLoader />
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
  return { setActivePlanId };
}

// Radix Select is awkward in jsdom: pick through the hidden native handling by clicking its items.
async function choose(testId: string, optionText: RegExp | string) {
  fireEvent.pointerDown(await screen.findByTestId(testId), { button: 0, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: optionText }));
}

async function reachPreview() {
  fireEvent.click(screen.getByTestId("button-load-sample-plan"));
  await choose("sample-plan-school", "College of Arts and Sciences");
  await choose("sample-plan-program", /Biology/);
  fireEvent.click(await screen.findByTestId("sample-plan-choice-5"));
  return screen.findByTestId("sample-plan-preview");
}

describe("generated plans cannot appear in the public picker", () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  });

  it("filters a generated entry even if a stale API response contains one", async () => {
    mount();
    const generated = { ...browse.schools[0]!.programs[0]!.plans[0]!, id: 5, sourceType: "campusval_generated" as const };
    customFetch.mockImplementation(async (url: string) => {
      if (url === "/api/sample-plans") return { schools: [{ ...browse.schools[0]!, programs: [{ program: "Biology", plans: [generated] }] }] };
      if (url === "/api/sample-plans/5") return { ...preview, ...generated };
      throw new Error(`unexpected ${String(url)}`);
    });
    fireEvent.click(screen.getByTestId("button-load-sample-plan"));
    await screen.findByTestId("sample-plan-empty");
    expect(screen.queryByTestId("sample-plan-choice-5")).toBeNull();
    expect(screen.queryByText(/Example, not an SCU plan/i)).toBeNull();
  });

  it("filters staff-authored and provenance-incomplete entries even if a stale API response contains them", async () => {
    mount();
    const basePlan = browse.schools[0]!.programs[0]!.plans[0]!;
    const adminEntry = { ...basePlan, id: 7, sourceType: "admin_entry" as const };
    const noSource = { ...basePlan, id: 8, sourceUrl: null, sourceReference: null };
    const noImportDate = { ...basePlan, id: 9, importedAt: "" };
    const badSourceUrl = { ...basePlan, id: 10, sourceUrl: "not-a-url" };
    customFetch.mockImplementation(async (url: string) => {
      if (url === "/api/sample-plans") return { schools: [{ ...browse.schools[0]!, programs: [{ program: "Biology", plans: [adminEntry, noSource, noImportDate, badSourceUrl] }] }] };
      throw new Error(`unexpected ${String(url)}`);
    });
    fireEvent.click(screen.getByTestId("button-load-sample-plan"));
    await screen.findByTestId("sample-plan-empty");
    expect(screen.queryByTestId("sample-plan-choice-7")).toBeNull();
    expect(screen.queryByTestId("sample-plan-choice-8")).toBeNull();
    expect(screen.queryByTestId("sample-plan-choice-9")).toBeNull();
    expect(screen.queryByTestId("sample-plan-choice-10")).toBeNull();
  });
});

describe("Load Sample Plan", () => {
  beforeEach(() => {
    // jsdom lacks these; Radix Select needs them.
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  });

  it("groups plans by school, then program, then plan, and previews before anything is created", async () => {
    mount();
    fireEvent.click(screen.getByTestId("button-load-sample-plan"));
    fireEvent.pointerDown(await screen.findByTestId("sample-plan-school"), { button: 0, pointerType: "mouse" });
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["College of Arts and Sciences", "School of Engineering"]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  });

  it("previews terms, courses, placeholders, source, version and warnings, and says it is not a guarantee", async () => {
    mount();
    const box = await reachPreview();
    expect(within(box).getByText("BIOL 1A")).toBeTruthy();
    expect(within(box).getByText("CTW 1")).toBeTruthy();
    expect(box.textContent).toContain("CAS first-year course plan: Biology");
    expect(box.textContent).toContain("version 2026-27");
    expect(box.textContent).toContain("imported Jan 15, 2026");
    expect(box.textContent).toMatch(/not an official guarantee/);
    expect(screen.getByTestId("sample-plan-warnings").textContent).toContain("ZZZZ 999");
    expect(customFetch.mock.calls.some(([u]) => String(u).endsWith("/load"))).toBe(false);
  });

  it("creates a new Tentative Degree Plan by default, sends no target plan, and switches to the new plan", async () => {
    const { setActivePlanId } = mount();
    await reachPreview();
    expect((screen.getByTestId("sample-mode-new") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("sample-plan-load").textContent).toBe("Create Tentative Degree Plan");
    fireEvent.click(screen.getByTestId("sample-plan-load"));
    const done = await screen.findByTestId("sample-plan-result");
    const call = customFetch.mock.calls.find(([u]) => String(u).endsWith("/load"))!;
    expect(JSON.parse(call[1].body)).toEqual({ mode: "new_tentative", startYear: 2026 });
    expect(done.textContent).toContain("Created “Biology — First-year plan”");
    expect(done.textContent).toContain("BIOL 1A");
    expect(done.textContent).toContain("ZZZZ 999");
    expect(done.textContent).toContain("Your Degree Plan was not changed");
    // The workspace switches to the new plan only once the student has read the result and closed it.
    expect(setActivePlanId).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("sample-plan-done"));
    await waitFor(() => expect(setActivePlanId).toHaveBeenCalledWith(99));
  });

  it("will not add to the Degree Plan until the student confirms", async () => {
    mount("degree");
    await reachPreview();
    fireEvent.click(screen.getByTestId("sample-mode-add"));
    const button = screen.getByTestId("sample-plan-load") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("sample-confirm-degree"));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await screen.findByTestId("sample-plan-result");
    expect(JSON.parse(customFetch.mock.calls.find(([u]) => String(u).endsWith("/load"))![1].body)).toMatchObject({ mode: "add_to_plan", targetPlanId: 7, confirmDegreePlan: true });
  });

  it("needs no confirmation to add to a Tentative Degree Plan", async () => {
    mount("tentative");
    await reachPreview();
    fireEvent.click(screen.getByTestId("sample-mode-add"));
    expect(screen.queryByTestId("sample-confirm-degree")).toBeNull();
    expect((screen.getByTestId("sample-plan-load") as HTMLButtonElement).disabled).toBe(false);
  });
});
