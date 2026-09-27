/**
 * Lecture + lab scheduling for EVERY course that has both, through the real
 * schedules API and the real Fall 2026 Registrar data:
 *
 *   BIOL 1B   1,2 = TR lectures        3..12 = 90-minute weekly labs
 *   PHYS 11   1,2 = MWF lectures       3..7  = 165-minute weekly labs
 *
 * and for a future term, where lab sections exist only once a source lists them.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

const { db, quarterSchedulesTable, scheduleEventsTable, courseSectionsTable } = await import("@workspace/db");
const { buildAvailabilityService, setAvailabilityServiceForTests } = await import("../lib/availability");
const schedulesRouter = (await import("./schedules")).default;
const coursesRouter = (await import("./courses")).default;

const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  next();
});
app.use("/api", schedulesRouter);
app.use("/api", coursesRouter);

const RUN = Date.now();
const USER = `test-multi-component-${RUN}`;
const OTHER = `test-multi-component-other-${RUN}`;
const as = (r: request.Test, user = USER) => r.set("x-test-user", user);

// A future-term course no other suite seeds: PHYS 13, Spring 2027.
const FUTURE = { courseCode: "PHYS 13", term: "spring", year: 2027 } as const;

async function cleanup() {
  const rows = await db
    .select({ id: quarterSchedulesTable.id })
    .from(quarterSchedulesTable)
    .where(inArray(quarterSchedulesTable.userId, [USER, OTHER]));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.delete(scheduleEventsTable).where(inArray(scheduleEventsTable.scheduleId, ids));
    await db.delete(quarterSchedulesTable).where(inArray(quarterSchedulesTable.id, ids));
  }
  await db
    .delete(courseSectionsTable)
    .where(
      and(
        eq(courseSectionsTable.courseCode, FUTURE.courseCode),
        eq(courseSectionsTable.term, FUTURE.term),
        eq(courseSectionsTable.year, FUTURE.year),
      ),
    );
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  setAvailabilityServiceForTests(null);
});

async function newSchedule(name: string, term = "fall", year = 2026, user = USER): Promise<number> {
  const res = await as(request(app).post("/api/schedules"), user).send({ name, term, year }).expect(201);
  return res.body.id;
}
const add = (scheduleId: number, courseCode: string, sectionNumber: string) =>
  as(request(app).post(`/api/schedules/${scheduleId}/events`)).send({ kind: "section", courseCode, sectionNumber });

async function detail(scheduleId: number) {
  const res = await as(request(app).get(`/api/schedules/${scheduleId}`)).expect(200);
  return res.body as {
    events: Array<{ id: number; courseCode: string; sectionNumber: string; componentType: string; meetingDays: string[]; startTime: string; endTime: string }>;
    courseStatus: Array<{ courseCode: string; scheduled: string[]; missing: string[]; notYetPublished: string[]; complete: boolean }>;
  };
}
const statusOf = async (id: number, code: string) => (await detail(id)).courseStatus.find((c) => c.courseCode === code)!;
const parts = async (id: number, code: string) =>
  (await detail(id)).events
    .filter((e) => e.courseCode === code)
    .map((e) => `${e.componentType}:${e.sectionNumber}`)
    .sort();

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
/** The same overlap rule the planner's conflict panel applies to events. */
function conflicts(events: Array<{ courseCode: string; meetingDays: string[]; startTime: string; endTime: string }>) {
  const out: string[] = [];
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]!;
      const b = events[j]!;
      const sharesDay = a.meetingDays.some((d) => b.meetingDays.includes(d));
      if (sharesDay && toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime)) {
        out.push([a.courseCode, b.courseCode].sort().join(" x "));
      }
    }
  }
  return out;
}

describe("the sections API tells lectures from labs for Biology and Physics", () => {
  it.each([
    ["BIOL 1B", { lecture: 2, lab: 10 }],
    ["PHYS 11", { lecture: 2, lab: 5 }],
    ["CHEM 11", { lecture: 12, lab: 25 }],
  ])("%s", async (code, expected) => {
    const res = await request(app).get(`/api/courses/${encodeURIComponent(code)}/sections?term=fall&year=2026`).expect(200);
    const tally: Record<string, number> = {};
    for (const s of res.body) tally[s.componentType] = (tally[s.componentType] ?? 0) + 1;
    expect(tally).toEqual(expected);
    // Term context is part of every section's identity.
    expect(res.body.every((s: any) => s.term === "fall" && s.year === 2026 && s.id.endsWith("-fall-2026"))).toBe(true);
    expect(res.body.every((s: any) => s.componentInferred === true && s.componentSourceLabel === null)).toBe(true);
  });

  it("reports what each course needs in the term", async () => {
    const res = await request(app).get("/api/courses/BIOL%201B/components?term=fall&year=2026").expect(200);
    expect(res.body).toMatchObject({ courseCode: "BIOL 1B", term: "fall", year: 2026, offered: true, multiComponent: true });
    expect(res.body.components.map((c: any) => [c.componentType, c.sectionCount, c.sectionsPublished])).toEqual([
      ["lecture", 2, true],
      ["lab", 10, true],
    ]);
    await request(app).get("/api/courses/BIOL%201B/components").expect(400);
    await request(app).get("/api/courses/ZZZZ%20999/components?term=fall&year=2026").expect(404);
  });
});

describe("BIOL 1B: lecture + lab", () => {
  let id: number;

  it("a lecture alone is not a fully scheduled course", async () => {
    id = await newSchedule("Bio");
    await add(id, "BIOL 1B", "1").expect(201);
    expect(await statusOf(id, "BIOL 1B")).toMatchObject({ scheduled: ["lecture"], missing: ["lab"], complete: false });
  });

  it("adding the lab keeps the lecture; both are on the schedule as different components", async () => {
    const res = await add(id, "BIOL 1B", "3").expect(201);
    expect(res.body.componentType).toBe("lab");
    expect(await parts(id, "BIOL 1B")).toEqual(["lab:3", "lecture:1"]);
    expect(await statusOf(id, "BIOL 1B")).toMatchObject({ scheduled: ["lecture", "lab"], missing: [], complete: true });
  });

  it("both components carry their own meeting times", async () => {
    const events = (await detail(id)).events;
    const lecture = events.find((e) => e.sectionNumber === "1")!;
    const lab = events.find((e) => e.sectionNumber === "3")!;
    expect(lecture.meetingDays).toEqual(["T", "R"]);
    expect(lab.meetingDays).toHaveLength(1);
    expect(toMin(lab.endTime) - toMin(lab.startTime)).toBe(90);
  });
});

describe("PHYS 11: swapping one component leaves the other alone", () => {
  let id: number;
  const event = async (section: string) => (await detail(id)).events.find((e) => e.courseCode === "PHYS 11" && e.sectionNumber === section)!;

  it("schedules a lecture and a lab, both belonging to PHYS 11", async () => {
    id = await newSchedule("Physics");
    await add(id, "PHYS 11", "1").expect(201);
    await add(id, "PHYS 11", "3").expect(201);
    expect(await parts(id, "PHYS 11")).toEqual(["lab:3", "lecture:1"]);
  });

  it("changing ONLY the lecture keeps the lab", async () => {
    const lecture = await event("1");
    const res = await as(request(app).patch(`/api/schedules/${id}/events/${lecture.id}`)).send({ sectionNumber: "2" }).expect(200);
    expect(res.body).toMatchObject({ sectionNumber: "2", componentType: "lecture" });
    expect(await parts(id, "PHYS 11")).toEqual(["lab:3", "lecture:2"]);
  });

  it("changing ONLY the lab keeps the lecture", async () => {
    const lab = await event("3");
    await as(request(app).patch(`/api/schedules/${id}/events/${lab.id}`)).send({ sectionNumber: "5" }).expect(200);
    expect(await parts(id, "PHYS 11")).toEqual(["lab:5", "lecture:2"]);
  });

  it("refuses to swap a lecture INTO a lab section, which would silently drop the lecture", async () => {
    const lecture = await event("2");
    const res = await as(request(app).patch(`/api/schedules/${id}/events/${lecture.id}`)).send({ sectionNumber: "4" }).expect(409);
    expect(res.body.code).toBe("component_mismatch");
    expect(res.body.error).toMatch(/lab section, not a lecture/);
    expect(await parts(id, "PHYS 11")).toEqual(["lab:5", "lecture:2"]);
  });

  it("removing one component removes only that component", async () => {
    const lab = await event("5");
    await as(request(app).delete(`/api/schedules/${id}/events/${lab.id}`)).expect(204);
    expect(await parts(id, "PHYS 11")).toEqual(["lecture:2"]);
    expect(await statusOf(id, "PHYS 11")).toMatchObject({ missing: ["lab"], complete: false });
    await add(id, "PHYS 11", "5").expect(201);
  });

  it("removing the WHOLE course removes every component, and nothing else", async () => {
    await add(id, "BIOL 1B", "1").expect(201);
    const res = await as(request(app).delete(`/api/schedules/${id}/courses/${encodeURIComponent("PHYS 11")}`)).expect(200);
    expect(res.body).toEqual({ removed: 2 });
    const after = await detail(id);
    expect(after.events.map((e) => e.courseCode)).toEqual(["BIOL 1B"]);
    expect(after.courseStatus.map((c) => c.courseCode)).toEqual(["BIOL 1B"]);
    await as(request(app).delete(`/api/schedules/${id}/courses/${encodeURIComponent("PHYS 11")}`)).expect(404);
  });

  it("another user cannot remove a course from this schedule", async () => {
    await as(request(app).delete(`/api/schedules/${id}/courses/${encodeURIComponent("BIOL 1B")}`), OTHER).expect(404);
    expect((await detail(id)).events).toHaveLength(1);
  });
});

describe("labs take part in conflict checking exactly like lectures", () => {
  it("a lab that overlaps another course's lab is a conflict; the lectures alone are not", async () => {
    const id = await newSchedule("Conflicts");
    // BIOL 1B lecture TR 08:30, PHYS 11 lecture MWF — no overlap.
    await add(id, "BIOL 1B", "1").expect(201);
    await add(id, "PHYS 11", "1").expect(201);
    expect(conflicts((await detail(id)).events)).toEqual([]);

    // Find a BIOL 1B lab and a PHYS 11 lab that really overlap in the Registrar data.
    const [bio, phys] = await Promise.all(
      ["BIOL 1B", "PHYS 11"].map(async (code) =>
        (await request(app).get(`/api/courses/${encodeURIComponent(code)}/sections?term=fall&year=2026`)).body.filter(
          (s: any) => s.componentType === "lab",
        ),
      ),
    );
    let pair: [any, any] | null = null;
    for (const b of bio) {
      for (const p of phys) {
        if (conflicts([b, p]).length > 0) pair = [b, p];
      }
    }
    expect(pair, "the Fall data contains an overlapping BIOL 1B / PHYS 11 lab pair").not.toBeNull();

    await add(id, "BIOL 1B", pair![0].sectionNumber).expect(201);
    await add(id, "PHYS 11", pair![1].sectionNumber).expect(201);
    const events = (await detail(id)).events;
    expect(events).toHaveLength(4);
    expect(events.filter((e) => e.componentType === "lab")).toHaveLength(2);
    expect(conflicts(events)).toEqual(["BIOL 1B x PHYS 11"]);
  });
});

describe("a future term (Spring 2027)", () => {
  let id: number;

  it("with only the Registrar's tentative schedule: the lab is required but not yet published", async () => {
    setAvailabilityServiceForTests(buildAvailabilityService());
    const plan = await request(app).get("/api/courses/PHYS%2013/components?term=spring&year=2027").expect(200);
    expect(plan.body.tentative).toBe(true);
    expect(plan.body.components.map((c: any) => [c.componentType, c.sectionsPublished])).toEqual([
      ["lecture", true],
      ["lab", false],
    ]);

    id = await newSchedule("Spring", "spring", 2027);
    await add(id, "PHYS 13", "1").expect(201);
    expect(await statusOf(id, "PHYS 13")).toEqual({
      courseCode: "PHYS 13",
      scheduled: ["lecture"],
      missing: [],
      notYetPublished: ["lab"],
      complete: true,
    });
    // No lab section is invented to fill the gap.
    const sections = await request(app).get("/api/courses/PHYS%2013/sections?term=spring&year=2027").expect(200);
    expect(sections.body.every((s: any) => s.componentType === "lecture")).toBe(true);
  });

  it("uses the SPRING sections, never Fall's", async () => {
    // Section 3 is a PHYS 11 lab in Fall; PHYS 13 has no section 3 in Spring.
    await add(id, "PHYS 13", "3").expect(400);
    const fall = await request(app).get("/api/courses/PHYS%2013/sections?term=fall&year=2026").expect(200);
    expect(fall.body).toEqual([]);
  });

  it("once a source lists the Spring labs, they can be chosen, scheduled and conflict-checked", async () => {
    // What the data steward's Workday paste stores (synthetic times).
    await db.insert(courseSectionsTable).values([
      { ...FUTURE, sectionNumber: "L1", instructor: "TBA", meetingDays: ["T"], startTime: "14:15", endTime: "17:00", component: "Laboratory" },
      { ...FUTURE, sectionNumber: "L2", instructor: "TBA", meetingDays: ["R"], startTime: "14:15", endTime: "17:00", component: "Laboratory" },
    ]);
    setAvailabilityServiceForTests(buildAvailabilityService());

    const sections = await request(app).get("/api/courses/PHYS%2013/sections?term=spring&year=2027").expect(200);
    const labs = sections.body.filter((s: any) => s.componentType === "lab");
    expect(labs.map((s: any) => s.sectionNumber).sort()).toEqual(["L1", "L2"]);
    expect(labs[0]).toMatchObject({ componentInferred: false, componentSourceLabel: "Laboratory", term: "spring", year: 2027 });

    expect(await statusOf(id, "PHYS 13")).toMatchObject({ missing: ["lab"], notYetPublished: [], complete: false });
    const added = await add(id, "PHYS 13", "L1").expect(201);
    expect(added.body).toMatchObject({ componentType: "lab", meetingDays: ["T"], startTime: "14:15", endTime: "17:00" });
    expect(await statusOf(id, "PHYS 13")).toMatchObject({ scheduled: ["lecture", "lab"], missing: [], complete: true });

    // Swap only the lab; the lecture stays.
    const lab = (await detail(id)).events.find((e) => e.sectionNumber === "L1")!;
    await as(request(app).patch(`/api/schedules/${id}/events/${lab.id}`)).send({ sectionNumber: "L2" }).expect(200);
    expect(await parts(id, "PHYS 13")).toEqual(["lab:L2", "lecture:1"]);
  });
});
