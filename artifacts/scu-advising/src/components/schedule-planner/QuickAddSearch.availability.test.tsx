// @vitest-environment jsdom
/**
 * Coverage for the 2026-09 professor-feedback pass: Find Courses must show a
 * truthful OPEN/WAITLIST/FULL/UNKNOWN text badge on every section (closed/
 * full sections stay visible, never disappear), offer a conservative-default
 * availability filter, and show a freshness line instead of claiming
 * real-time data.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getListCourseSectionsQueryKey } from "@workspace/api-client-react";
import { QuickAddSearch } from "./QuickAddSearch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fakeWorkspace() {
  return {
    activeTerm: "fall",
    activeYear: 2026,
    activeScheduleId: 1,
    activeSchedule: { id: 1, events: [] },
    invalidateSchedules: vi.fn(),
  } as any;
}

const SECTIONS = [
  {
    id: "CHEM-11-01-fall-2026",
    courseCode: "CHEM 11",
    sectionNumber: "01",
    term: "fall",
    year: 2026,
    instructor: "Prof. A",
    meetingDays: ["M", "W"],
    startTime: "10:00",
    endTime: "10:50",
    location: "Hall 1",
    seatsTotal: 30,
    seatsOpen: 5,
    waitlist: 0,
    seatsKnown: true,
    tentative: false,
    componentType: "lecture",
    componentInferred: false,
    availabilityStatus: "open",
    lastUpdatedAt: "2026-09-16T12:00:00.000Z",
    sourceType: "workday_self_paste",
    sourceLabel: "Your own Workday paste-in",
  },
  {
    id: "CHEM-11-02-fall-2026",
    courseCode: "CHEM 11",
    sectionNumber: "02",
    term: "fall",
    year: 2026,
    instructor: "Prof. B",
    meetingDays: ["T", "R"],
    startTime: "11:00",
    endTime: "11:50",
    location: "Hall 2",
    seatsTotal: 30,
    seatsOpen: 0,
    waitlist: 0,
    seatsKnown: true,
    tentative: false,
    componentType: "lecture",
    componentInferred: false,
    availabilityStatus: "full",
    lastUpdatedAt: "2026-09-16T12:00:00.000Z",
    sourceType: "workday_self_paste",
    sourceLabel: "Your own Workday paste-in",
  },
  {
    id: "CHEM-11-03-fall-2026",
    courseCode: "CHEM 11",
    sectionNumber: "03",
    term: "fall",
    year: 2026,
    instructor: "Prof. C",
    meetingDays: ["F"],
    startTime: "13:00",
    endTime: "13:50",
    location: "Hall 3",
    seatsTotal: 0,
    seatsOpen: 0,
    waitlist: 0,
    seatsKnown: false,
    tentative: false,
    componentType: "lecture",
    componentInferred: false,
    availabilityStatus: "unknown",
    lastUpdatedAt: null,
    sourceType: "registrar_schedule",
    sourceLabel: "SCU Registrar schedule (no live seat data)",
  },
];

function renderWithSections(sections = SECTIONS) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const params = { term: "fall" as const, year: 2026 };
  queryClient.setQueryData(getListCourseSectionsQueryKey("CHEM 11", params), sections);
  render(
    <QueryClientProvider client={queryClient}>
      <QuickAddSearch workspace={fakeWorkspace()} initialCourse="CHEM 11" />
    </QueryClientProvider>,
  );
}

describe("QuickAddSearch — availability badges, filter, freshness", () => {
  it("shows a text badge (OPEN/FULL/UNKNOWN) on every section, and keeps full sections visible by default", async () => {
    renderWithSections();
    expect((await screen.findByTestId("availability-badge-01")).textContent).toContain("OPEN");
    expect(screen.getByTestId("availability-badge-02").textContent).toContain("FULL");
    expect(screen.getByTestId("availability-badge-03").textContent).toContain("UNKNOWN");
    // All three sections rendered — the default filter never hides anything.
    expect(screen.getByTestId("add-section-01")).toBeTruthy();
    expect(screen.getByTestId("add-section-02")).toBeTruthy();
    expect(screen.getByTestId("add-section-03")).toBeTruthy();
  });

  it("shows a freshness line distinguishing a live Workday paste from the Registrar-only fallback", async () => {
    renderWithSections();
    await screen.findByTestId("availability-badge-01");
    expect(screen.getByTestId("freshness-01").textContent).toMatch(/Your own Workday paste-in/);
    expect(screen.getByTestId("freshness-03").textContent).toMatch(/no live seat data/);
  });

  it("warns before adding a full or waitlisted section, encouraging a backup plan, without blocking the add", async () => {
    renderWithSections();
    await screen.findByTestId("availability-badge-02");
    expect(screen.getByTestId("not-available-warning-02").textContent).toMatch(/full/i);
    expect(screen.queryByTestId("not-available-warning-01")).toBeNull();
    // Still addable — CampusVal warns, never blocks.
    expect((screen.getByTestId("add-section-02") as HTMLButtonElement).disabled).toBe(false);
  });

  it("'Show open only' hides FULL but keeps UNKNOWN (never hides a section we aren't sure is unavailable)", async () => {
    renderWithSections();
    await screen.findByTestId("availability-badge-01");
    fireEvent.change(screen.getByTestId("select-availability-filter"), {
      target: { value: "open" },
    });
    expect(screen.getByTestId("availability-badge-01")).toBeTruthy();
    expect(screen.queryByTestId("availability-badge-02")).toBeNull();
    expect(screen.getByTestId("availability-badge-03")).toBeTruthy();
  });

  it("'Show open + waitlist' hides only FULL sections", async () => {
    const withWaitlist = [
      ...SECTIONS,
      {
        ...SECTIONS[1],
        id: "CHEM-11-04-fall-2026",
        sectionNumber: "04",
        availabilityStatus: "waitlist",
        waitlist: 3,
      },
    ];
    renderWithSections(withWaitlist as any);
    await screen.findByTestId("availability-badge-01");
    fireEvent.change(screen.getByTestId("select-availability-filter"), {
      target: { value: "open_waitlist" },
    });
    expect(screen.getByTestId("availability-badge-01")).toBeTruthy();
    expect(screen.queryByTestId("availability-badge-02")).toBeNull();
    expect(screen.getByTestId("availability-badge-04")).toBeTruthy();
    expect(screen.getByTestId("availability-badge-03")).toBeTruthy();
  });

  it("future tentative-term sections are always UNKNOWN, never a fabricated live status", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = { term: "winter" as const, year: 2027 };
    queryClient.setQueryData(getListCourseSectionsQueryKey("MATH 36", params), [
      {
        id: "MATH-36-1-winter-2027",
        courseCode: "MATH 36",
        sectionNumber: "1",
        term: "winter",
        year: 2027,
        instructor: "",
        meetingDays: ["M"],
        startTime: "",
        endTime: "",
        location: "",
        seatsTotal: 0,
        seatsOpen: 0,
        waitlist: 0,
        seatsKnown: false,
        tentative: true,
        componentType: "lecture",
        componentInferred: true,
        availabilityStatus: "unknown",
        lastUpdatedAt: null,
        sourceType: "registrar_schedule",
        sourceLabel: "SCU Registrar Tentative Schedule (no live seat data)",
      },
    ]);
    render(
      <QueryClientProvider client={queryClient}>
        <QuickAddSearch
          workspace={{ ...fakeWorkspace(), activeTerm: "winter", activeYear: 2027 }}
          initialCourse="MATH 36"
        />
      </QueryClientProvider>,
    );
    expect((await screen.findByTestId("availability-badge-1")).textContent).toContain("UNKNOWN");
    expect(screen.getByText(/Tentative schedule — no seat data yet/)).toBeTruthy();
  });
});
