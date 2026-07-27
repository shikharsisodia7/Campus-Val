// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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
    expect(screen.getByText("Official schedule not published yet")).toBeTruthy();
  });
});
