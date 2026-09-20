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
import { getListCourseSectionsQueryKey, getGetSectionAvailabilityStatusQueryKey } from "@workspace/api-client-react";
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

  it("offers exactly two choices — All Sections (default) and Open Sections", async () => {
    renderWithSections();
    await screen.findByTestId("availability-badge-01");
    const group = screen.getByTestId("availability-view");
    expect(group.querySelectorAll("button")).toHaveLength(2);
    expect(screen.getByTestId("availability-view-all").textContent).toBe("All Sections");
    expect(screen.getByTestId("availability-view-open").textContent).toBe("Open Sections");
    expect(screen.getByTestId("availability-view-all").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("availability-view-open").getAttribute("aria-pressed")).toBe("false");
  });

  it("Open Sections hides FULL and WAITLIST but keeps OPEN and UNKNOWN (never hides a section we aren't sure is unavailable); All Sections restores everything", async () => {
    const withWaitlist = [
      ...SECTIONS,
      { ...SECTIONS[1], id: "CHEM-11-04-fall-2026", sectionNumber: "04", availabilityStatus: "waitlist", waitlist: 3 },
    ];
    renderWithSections(withWaitlist as any);
    await screen.findByTestId("availability-badge-01");
    fireEvent.click(screen.getByTestId("availability-view-open"));
    expect(screen.getByTestId("availability-view-open").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("availability-badge-01")).toBeTruthy(); // open
    expect(screen.getByTestId("availability-badge-03")).toBeTruthy(); // unknown stays, labelled
    expect(screen.queryByTestId("availability-badge-02")).toBeNull(); // full
    expect(screen.queryByTestId("availability-badge-04")).toBeNull(); // waitlist
    // The student is told what is being kept and why.
    expect(screen.getByTestId("open-sections-unknown-note").textContent).toMatch(/1 section has unknown availability/);

    fireEvent.click(screen.getByTestId("availability-view-all"));
    for (const n of ["01", "02", "03", "04"]) expect(screen.getByTestId(`availability-badge-${n}`)).toBeTruthy();
  });

  it("with NO known seat data, Open Sections is disabled and explains why instead of pretending nothing is open", async () => {
    renderWithSections(SECTIONS.filter((x) => x.availabilityStatus === "unknown") as any);
    await screen.findByTestId("availability-badge-03");
    expect((screen.getByTestId("availability-view-open") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("open-sections-unavailable").textContent).toMatch(/isn't available yet/);
    // …and every section is still shown.
    expect(screen.getByTestId("add-section-03")).toBeTruthy();
  });

  it("Open Sections says so when every known section is full", async () => {
    renderWithSections([SECTIONS[1]] as any);
    await screen.findByTestId("availability-badge-02");
    fireEvent.click(screen.getByTestId("availability-view-open"));
    expect(screen.getByTestId("availability-filter-empty").textContent).toMatch(/No open sections right now/);
    fireEvent.click(screen.getByTestId("availability-view-all"));
    expect(screen.getByTestId("availability-badge-02")).toBeTruthy();
  });

  it("never shows a LIVE chip for manual-snapshot, registrar-only, or sample data", async () => {
    renderWithSections([
      SECTIONS[0],
      SECTIONS[2],
      { ...SECTIONS[0], id: "x-04", sectionNumber: "04", sourceType: "fixture", sourceLabel: "SAMPLE DATA for development — not real seat counts", isLive: false, freshness: "cached" },
    ] as any);
    await screen.findByTestId("availability-badge-01");
    expect(screen.queryByText("LIVE")).toBeNull();
    expect(screen.getByTestId("availability-source-01").textContent).toBe("SNAPSHOT");
    expect(screen.queryByTestId("availability-source-03")).toBeNull();
    expect(screen.getByTestId("availability-source-04").textContent).toBe("SAMPLE DATA");
  });

  it("shows LIVE only when the server says the feed is live, with a relative 'Updated … ago' line", async () => {
    const now = Date.now();
    renderWithSections([
      { ...SECTIONS[0], sourceType: "workday_live", sourceLabel: "Workday (SCU-approved availability feed)", isLive: true, freshness: "live", lastUpdatedAt: new Date(now - 2 * 60_000).toISOString() },
    ] as any);
    await screen.findByTestId("availability-badge-01");
    expect(screen.getByTestId("availability-source-01").textContent).toBe("LIVE");
    expect(screen.getByTestId("freshness-01").textContent).toMatch(/Updated 2 minutes ago \(Workday/);
  });

  it("a stale record is flagged OUT OF DATE and its status is unknown, never a stale 'open'", async () => {
    renderWithSections([
      { ...SECTIONS[0], availabilityStatus: "unknown", seatsKnown: false, freshness: "stale", lastUpdatedAt: "2026-09-01T00:00:00.000Z" },
    ] as any);
    await screen.findByTestId("availability-badge-01");
    expect(screen.getByTestId("availability-badge-01").textContent).toContain("UNKNOWN");
    expect(screen.getByTestId("availability-source-01").textContent).toBe("OUT OF DATE");
    expect(screen.getByTestId("freshness-01").textContent).toMatch(/Out of date/);
  });

  it.each([
    ["live", /Live availability/],
    ["cached", /not live right now/],
    ["stale", /out of date.*unknown/],
    ["unavailable", /currently unavailable/],
    ["not_connected", /isn't connected yet/],
    ["sample", /SAMPLE DATA/],
    ["manual_snapshot", /manual snapshot.*not live/],
  ])("the banner for state '%s' says the honest thing", async (state, text) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const params = { term: "fall" as const, year: 2026 };
    queryClient.setQueryData(getListCourseSectionsQueryKey("CHEM 11", params), SECTIONS);
    queryClient.setQueryData(getGetSectionAvailabilityStatusQueryKey(params), {
      term: "fall", year: 2026, state, liveConfigured: state !== "not_connected",
      lastUpdatedAt: new Date(Date.now() - 60_000).toISOString(), sectionsWithKnownAvailability: 2,
      counts: { open: 1, waitlist: 0, full: 1, unknown: 1 },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <QuickAddSearch workspace={fakeWorkspace()} initialCourse="CHEM 11" />
      </QueryClientProvider>,
    );
    const banner = await screen.findByTestId("availability-banner");
    expect(banner.getAttribute("data-state")).toBe(state);
    expect(banner.textContent).toMatch(text);
  });

  it("with no status loaded (or the feed erroring) the banner falls back to the conservative not-connected wording and planning still works", async () => {
    renderWithSections();
    const banner = await screen.findByTestId("availability-banner");
    expect(banner.textContent).toMatch(/isn't connected yet/);
    expect(screen.getByTestId("add-section-01")).toBeTruthy();
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
