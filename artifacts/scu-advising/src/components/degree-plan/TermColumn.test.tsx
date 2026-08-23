// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndContext } from "@dnd-kit/core";
import {
  getListCourseSectionsQueryKey,
  type CourseSection,
  type PlanItem,
  type ScheduleAvailability,
  type Term,
} from "@workspace/api-client-react";
import { TermColumn } from "./TermColumn";
import { DegreePlanProvider } from "./DegreePlanContext";

const YEAR = 2026;
const TERM = "fall";

function section(
  code: string,
  num: string,
  days: string[],
  start: string,
  end: string,
): CourseSection {
  return {
    id: `${code.replace(/\s+/g, "-")}-${num}-${TERM}-${YEAR}`,
    courseCode: code,
    sectionNumber: num,
    term: TERM as Term,
    year: YEAR,
    instructor: "Staff",
    meetingDays: days as CourseSection["meetingDays"],
    startTime: start,
    endTime: end,
    location: "Somewhere 101",
    seatsTotal: 30,
    seatsOpen: 10,
  } as CourseSection;
}

function planItem(id: number, code: string): PlanItem {
  return {
    id,
    planId: 1,
    itemType: "course",
    courseCode: code,
    courseTitle: `${code} title`,
    units: 4,
    academicYear: YEAR,
    term: TERM as Term,
    position: id,
  } as PlanItem;
}

function availability(
  status: "published" | "tentative" | null,
  offered: string[],
): ScheduleAvailability {
  return {
    terms: status
      ? [{ year: YEAR, term: TERM as Term, status, offeredCourseCodes: offered } as any]
      : [],
    note: "test",
  };
}

function renderBoard(opts: {
  items: PlanItem[];
  sectionsByCode: Record<string, CourseSection[]>;
  scheduleAvailability: ScheduleAvailability;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 60_000 },
    },
  });
  // Seed the exact query keys useTermCourseConflicts reads via useQueries,
  // so no network fetch ever happens.
  for (const [code, sections] of Object.entries(opts.sectionsByCode)) {
    queryClient.setQueryData(
      getListCourseSectionsQueryKey(code, { term: TERM as Term, year: YEAR }),
      sections,
    );
  }

  const ctx = {
    activePlan: undefined,
    activePlanId: 1,
    setActivePlanId: () => {},
    profile: undefined,
    requirements: undefined,
    scheduleAvailability: opts.scheduleAvailability,
    catalog: undefined,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <DegreePlanProvider value={ctx}>
        <DndContext>
          <TermColumn
            id={`${YEAR}-${TERM}`}
            year={YEAR}
            term={TERM}
            items={opts.items}
            availableYears={[YEAR]}
          />
        </DndContext>
      </DegreePlanProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Any real network attempt is a bug in the test setup — fail loudly.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in tests"))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TermColumn header layout at narrow widths", () => {
  it("keeps the term name and units badge each as one unbroken line", () => {
    // At 390px (3 columns ~101px each), "winter"/"spring" + a units badge
    // don't fit on one row. Without whitespace-nowrap, the badge text itself
    // (e.g. "0 units") wraps mid-phrase ("0" / "UNITS" on separate lines),
    // producing uneven, cramped-looking cards vs. "fall". With nowrap on
    // both pieces plus flex-wrap on the row, the whole badge instead drops
    // cleanly to its own line when needed — confirmed live via Playwright
    // at 390px real viewport width.
    const source = readFileSync(resolve(__dirname, "./TermColumn.tsx"), "utf8");
    expect(source).toMatch(/capitalize whitespace-nowrap/);
    expect(source).toMatch(/whitespace-nowrap text-\[10px\]/);
    expect(source).toMatch(/flex flex-wrap items-center justify-between/);
  });
});

describe("TermColumn conflict warning wiring", () => {
  it("shows the time-conflict note on both cards when every section combination clashes", async () => {
    const items = [planItem(101, "CHEM 11"), planItem(102, "MATH 11")];
    renderBoard({
      items,
      sectionsByCode: {
        "CHEM 11": [section("CHEM 11", "01", ["M", "W", "F"], "08:00", "09:05")],
        "MATH 11": [section("MATH 11", "01", ["M", "W"], "08:30", "09:35")],
      },
      scheduleAvailability: availability("published", ["CHEM 11", "MATH 11"]),
    });

    const noteA = await screen.findByTestId("time-conflict-note-101");
    const noteB = await screen.findByTestId("time-conflict-note-102");
    expect(noteA.textContent).toContain("All sections clash with MATH 11");
    expect(noteB.textContent).toContain("All sections clash with CHEM 11");
  });

  it("shows no warning when one section combination is free", async () => {
    const items = [planItem(201, "CHEM 11"), planItem(202, "MATH 11")];
    renderBoard({
      items,
      sectionsByCode: {
        "CHEM 11": [
          section("CHEM 11", "01", ["M", "W", "F"], "08:00", "09:05"),
          // A second section that does not overlap MATH 11 → pairing possible.
          section("CHEM 11", "02", ["T", "R"], "14:00", "15:05"),
        ],
        "MATH 11": [section("MATH 11", "01", ["M", "W"], "08:30", "09:35")],
      },
      scheduleAvailability: availability("published", ["CHEM 11", "MATH 11"]),
    });

    // Both cards rendered, neither carries the warning.
    expect(screen.getByText("CHEM 11")).toBeTruthy();
    expect(screen.getByText("MATH 11")).toBeTruthy();
    expect(screen.queryByTestId("time-conflict-note-201")).toBeNull();
    expect(screen.queryByTestId("time-conflict-note-202")).toBeNull();
  });

  it("shows no warning for a term without a published/tentative schedule", () => {
    const items = [planItem(301, "CHEM 11"), planItem(302, "MATH 11")];
    renderBoard({
      items,
      // Even with clashing cached sections, no schedule → no claim.
      sectionsByCode: {
        "CHEM 11": [section("CHEM 11", "01", ["M", "W", "F"], "08:00", "09:05")],
        "MATH 11": [section("MATH 11", "01", ["M", "W"], "08:30", "09:35")],
      },
      scheduleAvailability: availability(null, []),
    });

    expect(screen.queryByTestId("time-conflict-note-301")).toBeNull();
    expect(screen.queryByTestId("time-conflict-note-302")).toBeNull();
    // Centralized labelling (lib/course-offering): with no SCU schedule for
    // this season at all, the term says so plainly rather than being left
    // unlabelled next to a tentative one.
    expect(screen.getByText("No SCU schedule for this quarter")).toBeTruthy();
  });

  it("clears the conflict warning immediately when the conflicting course is removed from the plan (tasks #40/#41)", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    const sectionsByCode = {
      "CHEM 11": [section("CHEM 11", "01", ["M", "W", "F"], "08:00", "09:05")],
      "MATH 11": [section("MATH 11", "01", ["M", "W"], "08:30", "09:35")],
    };
    for (const [code, sections] of Object.entries(sectionsByCode)) {
      queryClient.setQueryData(
        getListCourseSectionsQueryKey(code, { term: TERM as Term, year: YEAR }),
        sections,
      );
    }
    const ctx = {
      activePlan: undefined,
      activePlanId: 1,
      setActivePlanId: () => {},
      profile: undefined,
      requirements: undefined,
      scheduleAvailability: availability("published", ["CHEM 11", "MATH 11"]),
      catalog: undefined,
    };
    const tree = (items: PlanItem[]) => (
      <QueryClientProvider client={queryClient}>
        <DegreePlanProvider value={ctx}>
          <DndContext>
            <TermColumn
              id={`${YEAR}-${TERM}`}
              year={YEAR}
              term={TERM}
              items={items}
              availableYears={[YEAR]}
            />
          </DndContext>
        </DegreePlanProvider>
      </QueryClientProvider>
    );

    const { rerender } = render(tree([planItem(701, "CHEM 11"), planItem(702, "MATH 11")]));
    expect(await screen.findByTestId("time-conflict-note-701")).toBeTruthy();
    expect(await screen.findByTestId("time-conflict-note-702")).toBeTruthy();

    // Student removes MATH 11 — the same render pass must clear the warning,
    // even though the cached section data is still "fresh" (60s staleTime):
    // conflicts derive from the CURRENT plan items, never stale plan state.
    rerender(tree([planItem(701, "CHEM 11")]));
    expect(screen.queryByTestId("time-conflict-note-701")).toBeNull();
    expect(screen.queryByTestId("time-conflict-note-702")).toBeNull();

    // And re-adding it brings the warning back from the same cached sections.
    rerender(tree([planItem(701, "CHEM 11"), planItem(702, "MATH 11")]));
    expect(await screen.findByTestId("time-conflict-note-701")).toBeTruthy();
  });
});

describe("TermColumn not-in-official-schedule flag wiring", () => {
  it("flags only the course missing from a published term's offeredCourseCodes", async () => {
    const items = [planItem(401, "CHEM 11"), planItem(402, "MATH 11")];
    renderBoard({
      items,
      sectionsByCode: {
        // Non-clashing sections so the time-conflict note stays out of the way.
        "CHEM 11": [section("CHEM 11", "01", ["M", "W", "F"], "08:00", "09:05")],
      },
      // MATH 11 planned but absent from the official schedule.
      scheduleAvailability: availability("published", ["CHEM 11"]),
    });

    const note = await screen.findByTestId("not-offered-note-402");
    expect(note.textContent).toContain("Not in official schedule this quarter");
    expect(screen.queryByTestId("not-offered-note-401")).toBeNull();
  });

  it("shows no flag when every planned course is in offeredCourseCodes", () => {
    const items = [planItem(501, "CHEM 11"), planItem(502, "MATH 11")];
    renderBoard({
      items,
      sectionsByCode: {
        "CHEM 11": [section("CHEM 11", "01", ["M", "W", "F"], "08:00", "09:05")],
        "MATH 11": [section("MATH 11", "01", ["T", "R"], "10:00", "11:05")],
      },
      scheduleAvailability: availability("published", ["CHEM 11", "MATH 11"]),
    });

    expect(screen.getByText("CHEM 11")).toBeTruthy();
    expect(screen.getByText("MATH 11")).toBeTruthy();
    expect(screen.queryByTestId("not-offered-note-501")).toBeNull();
    expect(screen.queryByTestId("not-offered-note-502")).toBeNull();
  });

  it("shows no flag for a term without an official schedule", () => {
    const items = [planItem(601, "CHEM 11"), planItem(602, "MATH 11")];
    renderBoard({
      items,
      sectionsByCode: {},
      // No published/tentative schedule → no honest claim about offerings.
      scheduleAvailability: availability(null, []),
    });

    expect(screen.queryByTestId("not-offered-note-601")).toBeNull();
    expect(screen.queryByTestId("not-offered-note-602")).toBeNull();
    // Centralized labelling (lib/course-offering): with no SCU schedule for
    // this season at all, the term says so plainly rather than being left
    // unlabelled next to a tentative one.
    expect(screen.getByText("No SCU schedule for this quarter")).toBeTruthy();
  });
});
