// @vitest-environment jsdom
/**
 * Quarter Plan: every course with a lecture and a lab offers BOTH selectors —
 * the same UI for Biology and Physics as for Chemistry — and says plainly when
 * a course is only partly scheduled or when a lab has not been published yet.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getGetCourseComponentsQueryKey,
  getListCourseSectionsQueryKey,
} from "@workspace/api-client-react";
import { QuickAddSearch } from "./QuickAddSearch";
import { courseStatusText } from "./course-components";

afterEach(cleanup);

type Term = "fall" | "winter" | "spring";

function section(courseCode: string, sectionNumber: string, componentType: string, days: string[], startTime: string, endTime: string, term: Term, year: number, extra: object = {}) {
  return {
    id: `${courseCode}-${sectionNumber}-${term}-${year}`,
    courseCode,
    sectionNumber,
    term,
    year,
    instructor: "Instructor",
    meetingDays: days,
    startTime,
    endTime,
    location: "",
    seatsTotal: 0,
    seatsOpen: 0,
    waitlist: 0,
    seatsKnown: false,
    tentative: term !== "fall",
    componentType,
    componentInferred: true,
    componentSourceLabel: null,
    availabilityStatus: "unknown",
    lastUpdatedAt: null,
    sourceType: "registrar_schedule",
    sourceLabel: "SCU Registrar schedule (no live seat data)",
    isLive: false,
    freshness: "unavailable",
    ...extra,
  };
}

const plan = (courseCode: string, term: Term, year: number, components: Array<[string, number]>) => ({
  courseCode,
  term,
  year,
  tentative: term !== "fall",
  offered: true,
  multiComponent: components.length > 1,
  components: components.map(([componentType, sectionCount]) => ({
    componentType,
    required: true,
    sectionCount,
    sectionsPublished: sectionCount > 0,
    evidence: [],
  })),
});

const BIOL = [
  section("BIOL 1B", "1", "lecture", ["T", "R"], "08:30", "10:10", "fall", 2026),
  section("BIOL 1B", "2", "lecture", ["T", "R"], "10:20", "12:00", "fall", 2026),
  section("BIOL 1B", "3", "lab", ["T"], "13:00", "14:30", "fall", 2026),
  section("BIOL 1B", "4", "lab", ["W"], "13:00", "14:30", "fall", 2026),
];
const PHYS = [
  section("PHYS 11", "1", "lecture", ["M", "W", "F"], "09:15", "10:20", "fall", 2026),
  section("PHYS 11", "3", "lab", ["M"], "14:15", "17:00", "fall", 2026),
  section("PHYS 11", "4", "lab", ["T"], "14:15", "17:00", "fall", 2026),
];

function renderCourse(opts: {
  courseCode: string;
  term?: Term;
  year?: number;
  sections: ReturnType<typeof section>[];
  components: Array<[string, number]>;
  events?: Array<{ id: number; sectionNumber: string; componentType: string }>;
}) {
  const term = opts.term ?? "fall";
  const year = opts.year ?? 2026;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const params = { term, year };
  client.setQueryData(getListCourseSectionsQueryKey(opts.courseCode, params), opts.sections);
  client.setQueryData(getGetCourseComponentsQueryKey(opts.courseCode, params), plan(opts.courseCode, term, year, opts.components));
  const workspace = {
    activeTerm: term,
    activeYear: year,
    activeScheduleId: 1,
    activeSchedule: {
      id: 1,
      events: (opts.events ?? []).map((e) => ({ ...e, kind: "section", courseCode: opts.courseCode, scheduleId: 1, meetingDays: [], startTime: "", endTime: "" })),
    },
    invalidateSchedules: vi.fn(),
  } as any;
  render(
    <QueryClientProvider client={client}>
      <QuickAddSearch workspace={workspace} initialCourse={opts.courseCode} />
    </QueryClientProvider>,
  );
}

describe.each([
  ["BIOL 1B", BIOL, 2, 2],
  ["PHYS 11", PHYS, 1, 2],
])("%s offers lecture and lab selectors", (courseCode, sections, lectures, labs) => {
  it("groups its sections under Lecture and Lab", async () => {
    renderCourse({ courseCode, sections, components: [["lecture", lectures], ["lab", labs]] });
    const lectureGroup = await screen.findByTestId("section-group-lecture");
    const labGroup = screen.getByTestId("section-group-lab");
    expect(within(lectureGroup).getByRole("heading").textContent).toBe("Lecture sections");
    expect(within(labGroup).getByRole("heading").textContent).toBe("Lab sections");
    expect(within(lectureGroup).getAllByRole("button")).toHaveLength(lectures);
    expect(within(labGroup).getAllByRole("button")).toHaveLength(labs);
    expect(within(labGroup).getAllByRole("button").every((b) => /Add lab/.test(b.textContent ?? ""))).toBe(true);
  });

  it("says the course requires Lecture + Lab before anything is chosen", async () => {
    renderCourse({ courseCode, sections, components: [["lecture", lectures], ["lab", labs]] });
    expect((await screen.findByTestId("component-requirement")).textContent).toBe("This course requires Lecture + Lab.");
    expect(screen.getByTestId("missing-components").textContent).toMatch(/Lecture \+ Lab required/);
  });

  it("with only the lecture chosen: Lecture selected, Lab required — not complete", async () => {
    renderCourse({
      courseCode,
      sections,
      components: [["lecture", lectures], ["lab", labs]],
      events: [{ id: 10, sectionNumber: "1", componentType: "lecture" }],
    });
    expect((await screen.findByTestId("scheduled-components")).textContent).toMatch(/Selected:\s*Lecture$/);
    expect(screen.getByTestId("missing-components").textContent).toMatch(/Lab\s+required/);
    expect(screen.queryByTestId("all-components-scheduled")).toBeNull();
    // Choosing a lab ADDS it; it never replaces the lecture.
    const labButtons = within(screen.getByTestId("section-group-lab")).getAllByRole("button");
    expect(labButtons.every((b) => /Add lab/.test(b.textContent ?? ""))).toBe(true);
  });

  it("with both chosen: complete, and each component is swapped only with its own kind", async () => {
    renderCourse({
      courseCode,
      sections,
      components: [["lecture", lectures], ["lab", labs]],
      events: [
        { id: 10, sectionNumber: "1", componentType: "lecture" },
        { id: 11, sectionNumber: "3", componentType: "lab" },
      ],
    });
    expect((await screen.findByTestId("all-components-scheduled")).textContent).toMatch(/All parts scheduled/);
    expect(screen.queryByTestId("missing-components")).toBeNull();
    const otherLab = within(screen.getByTestId("section-group-lab")).getAllByRole("button");
    expect(otherLab.map((b) => b.textContent)).toEqual(["Replace this lab"]);
  });
});

describe("a tentative future term", () => {
  const SPRING = [
    section("BIOL 1B", "1", "lecture", ["T", "R"], "08:30", "10:10", "spring", 2027),
    section("BIOL 1B", "2", "lecture", ["T", "R"], "10:20", "12:00", "spring", 2027),
  ];

  it("says the lab is required but its times are not published — and offers no invented lab", async () => {
    renderCourse({ courseCode: "BIOL 1B", term: "spring", year: 2027, sections: SPRING, components: [["lecture", 2], ["lab", 0]] });
    expect((await screen.findByTestId("component-requirement")).textContent).toBe("This course requires Lecture + Lab.");
    const notice = screen.getByTestId("unpublished-components");
    expect(notice.textContent).toMatch(/Lab times are not\s+published yet/);
    expect(notice.textContent).toMatch(/does not invent\s+a time/);
    expect(screen.queryByTestId("section-group-lab")).toBeNull();
    expect(screen.getByTestId("section-group-lecture")).toBeTruthy();
  });

  it("offers the lab as soon as the term's data lists one, labelled as published", async () => {
    renderCourse({
      courseCode: "BIOL 1B",
      term: "spring",
      year: 2027,
      sections: [
        ...SPRING,
        section("BIOL 1B", "L1", "lab", ["W"], "13:00", "14:30", "spring", 2027, { componentInferred: false, componentSourceLabel: "Laboratory" }),
      ],
      components: [["lecture", 2], ["lab", 1]],
    });
    const lab = await screen.findByTestId("section-group-lab");
    expect(lab.textContent).toMatch(/as published/);
    expect(screen.queryByTestId("unpublished-components")).toBeNull();
  });
});

describe("other component combinations", () => {
  it("supports lecture + lab + discussion", async () => {
    renderCourse({
      courseCode: "PHYS 12",
      sections: [
        section("PHYS 12", "1", "lecture", ["M", "W", "F"], "08:00", "09:05", "fall", 2026),
        section("PHYS 12", "L1", "lab", ["T"], "14:15", "17:00", "fall", 2026),
        section("PHYS 12", "D1", "discussion", ["F"], "12:00", "12:50", "fall", 2026),
      ],
      components: [["lecture", 1], ["lab", 1], ["discussion", 1]],
    });
    expect((await screen.findByTestId("component-requirement")).textContent).toBe(
      "This course requires Lecture + Lab + Discussion.",
    );
    expect(screen.getByTestId("section-group-discussion")).toBeTruthy();
  });

  it("a lecture-only course shows no multi-component notice", async () => {
    renderCourse({
      courseCode: "MATH 11",
      sections: [section("MATH 11", "1", "lecture", ["M", "W", "F"], "08:00", "09:05", "fall", 2026)],
      components: [["lecture", 1]],
    });
    await screen.findByTestId("section-group-lecture");
    expect(screen.queryByTestId("multi-component-notice")).toBeNull();
  });
});

describe("status wording", () => {
  it("names what is selected and what is still required, in words", () => {
    expect(courseStatusText({ scheduled: ["lecture"], missing: ["lab"], notYetPublished: [] })).toBe(
      "Lecture selected · Lab required",
    );
    expect(courseStatusText({ scheduled: ["lecture", "lab"], missing: [], notYetPublished: [] })).toBe(
      "Lecture + Lab selected",
    );
    expect(courseStatusText({ scheduled: ["lecture"], missing: [], notYetPublished: ["lab"] })).toBe(
      "Lecture selected · Lab times not yet published",
    );
  });
});

describe("no department-specific code in the Quarter Plan UI", () => {
  it.each(["QuickAddSearch.tsx", "course-components.ts", "CourseDetailsDialog.tsx"])("%s", (file) => {
    const source = readFileSync(resolve(__dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$|placeholder="[^"]*"/gm, "");
    expect(source).not.toMatch(/\b(CHEM|BIOL|PHYS)\b/);
  });
});
