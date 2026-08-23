/**
 * Regression coverage for the professor's confirmed lecture+lab bug:
 * "the current system treats all sections as interchangeable and swaps one
 * for another, meaning adding a lab replaces the lecture."
 *
 * These tests drive the real schedules API against real Fall 2026 Registrar
 * data for CHEM 11, which genuinely has both lecture sections (MWF/TR) and
 * lab sections (single 170-minute blocks).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { inArray } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

const { db, quarterSchedulesTable, scheduleEventsTable } = await import(
  "@workspace/db"
);
const schedulesRouter = (await import("./schedules")).default;
const coursesRouter = (await import("./courses")).default;

const stubLogger = (req: any, _res: any, next: any) => {
  req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  next();
};

const app = express();
app.use(express.json());
app.use(stubLogger);
app.use("/api", schedulesRouter);
app.use("/api", coursesRouter);

const RUN = Date.now();
const USER = `test-components-${RUN}`;
const as = (r: request.Test) => r.set("x-test-user", USER);

// Real Fall 2026 CHEM 11 sections (see data/offered-sections.json):
//   1  MWF 08:00-09:05  -> lecture
//   2  MWF 09:15-10:20  -> lecture
//   13 M   14:15-17:05  -> lab
//   14 M   14:15-17:05  -> lab
const TERM = "fall";
const YEAR = 2026;
const LECTURE_A = "1";
const LECTURE_B = "2";
const LAB_A = "13";
const LAB_B = "14";

async function cleanup() {
  const rows = await db
    .select({ id: quarterSchedulesTable.id })
    .from(quarterSchedulesTable)
    .where(inArray(quarterSchedulesTable.userId, [USER]));
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db
      .delete(scheduleEventsTable)
      .where(inArray(scheduleEventsTable.scheduleId, ids));
    await db
      .delete(quarterSchedulesTable)
      .where(inArray(quarterSchedulesTable.id, ids));
  }
}

async function newSchedule(name: string): Promise<number> {
  const res = await as(request(app).post("/api/schedules"))
    .send({ name, term: TERM, year: YEAR })
    .expect(201);
  return res.body.id;
}

function addSection(scheduleId: number, sectionNumber: string) {
  return as(request(app).post(`/api/schedules/${scheduleId}/events`)).send({
    kind: "section",
    courseCode: "CHEM 11",
    sectionNumber,
  });
}

async function eventsOf(scheduleId: number) {
  const res = await as(request(app).get(`/api/schedules/${scheduleId}`)).expect(
    200,
  );
  return res.body.events as Array<{
    id: number;
    courseCode: string | null;
    sectionNumber: string | null;
    componentType: string | null;
  }>;
}

beforeAll(cleanup);
afterAll(cleanup);

describe("course sections API exposes component information", () => {
  it("labels real CHEM 11 lecture and lab sections distinctly", async () => {
    const res = await request(app)
      .get(`/api/courses/CHEM 11/sections?term=${TERM}&year=${YEAR}`)
      .expect(200);
    const bySection = new Map(
      res.body.map((s: any) => [s.sectionNumber, s.componentType]),
    );
    expect(bySection.get(LECTURE_A)).toBe("lecture");
    expect(bySection.get(LAB_A)).toBe("lab");
  });

  it("never presents the component as an official Registrar field", async () => {
    const res = await request(app)
      .get(`/api/courses/CHEM 11/sections?term=${TERM}&year=${YEAR}`)
      .expect(200);
    expect(res.body.every((s: any) => s.componentInferred === true)).toBe(true);
  });

  it("reports the separately-scheduled components from the bulletin", async () => {
    const res = await request(app).get("/api/courses/CHEM 11").expect(200);
    expect(res.body.requiredComponents.lab).toBe(true);
  });
});

describe("lecture + lab can be scheduled at the same time", () => {
  it("keeps the lecture on the schedule after a lab is added", async () => {
    const id = await newSchedule("Lecture plus lab");
    await addSection(id, LECTURE_A).expect(201);
    await addSection(id, LAB_A).expect(201);

    const events = await eventsOf(id);
    const sections = events.map((e) => e.sectionNumber).sort();
    expect(sections).toEqual([LAB_A, LECTURE_A].sort());
    expect(events).toHaveLength(2);
  });

  it("marks the two coexisting events as different components", async () => {
    const id = await newSchedule("Component labels");
    await addSection(id, LECTURE_A).expect(201);
    await addSection(id, LAB_A).expect(201);

    const components = (await eventsOf(id)).map((e) => e.componentType).sort();
    expect(components).toEqual(["lab", "lecture"]);
  });

  it("still rejects adding the very same section twice", async () => {
    const id = await newSchedule("Exact duplicate");
    await addSection(id, LECTURE_A).expect(201);
    await addSection(id, LECTURE_A).expect(409);
    expect(await eventsOf(id)).toHaveLength(1);
  });
});

describe("replacing one component leaves the others alone", () => {
  it("changing only the lab preserves the lecture", async () => {
    const id = await newSchedule("Swap the lab");
    await addSection(id, LECTURE_A).expect(201);
    const labRes = await addSection(id, LAB_A).expect(201);

    await as(request(app).patch(`/api/schedules/${id}/events/${labRes.body.id}`))
      .send({ sectionNumber: LAB_B })
      .expect(200);

    const events = await eventsOf(id);
    expect(events).toHaveLength(2);
    expect(
      events.find((e) => e.componentType === "lecture")?.sectionNumber,
    ).toBe(LECTURE_A);
    expect(events.find((e) => e.componentType === "lab")?.sectionNumber).toBe(
      LAB_B,
    );
  });

  it("changing only the lecture preserves the lab", async () => {
    const id = await newSchedule("Swap the lecture");
    const lectureRes = await addSection(id, LECTURE_A).expect(201);
    await addSection(id, LAB_A).expect(201);

    await as(
      request(app).patch(`/api/schedules/${id}/events/${lectureRes.body.id}`),
    )
      .send({ sectionNumber: LECTURE_B })
      .expect(200);

    const events = await eventsOf(id);
    expect(events).toHaveLength(2);
    expect(
      events.find((e) => e.componentType === "lecture")?.sectionNumber,
    ).toBe(LECTURE_B);
    expect(events.find((e) => e.componentType === "lab")?.sectionNumber).toBe(
      LAB_A,
    );
  });

  it("deleting the lab leaves the lecture scheduled", async () => {
    const id = await newSchedule("Delete the lab");
    await addSection(id, LECTURE_A).expect(201);
    const labRes = await addSection(id, LAB_A).expect(201);

    await as(
      request(app).delete(`/api/schedules/${id}/events/${labRes.body.id}`),
    ).expect(204);

    const events = await eventsOf(id);
    expect(events).toHaveLength(1);
    expect(events[0]!.componentType).toBe("lecture");
  });
});

describe("multi-component schedules survive a reload and duplication", () => {
  it("returns both components on a fresh fetch", async () => {
    const id = await newSchedule("Persistence");
    await addSection(id, LECTURE_A).expect(201);
    await addSection(id, LAB_A).expect(201);

    const reread = await eventsOf(id);
    expect(reread.map((e) => e.componentType).sort()).toEqual([
      "lab",
      "lecture",
    ]);
  });

  it("carries every component into a duplicated schedule", async () => {
    const id = await newSchedule("Plan A");
    await addSection(id, LECTURE_A).expect(201);
    await addSection(id, LAB_A).expect(201);

    const dup = await as(request(app).post(`/api/schedules/${id}/duplicate`))
      .send({ name: "Plan B" })
      .expect(201);

    const copied = await eventsOf(dup.body.id);
    expect(copied).toHaveLength(2);
    expect(copied.map((e) => e.componentType).sort()).toEqual([
      "lab",
      "lecture",
    ]);
  });

  it("keeps Plan A unchanged when the Plan B lab is swapped", async () => {
    const planA = await newSchedule("Independent A");
    await addSection(planA, LECTURE_A).expect(201);
    await addSection(planA, LAB_A).expect(201);

    const dup = await as(request(app).post(`/api/schedules/${planA}/duplicate`))
      .send({ name: "Independent B" })
      .expect(201);
    const planB = dup.body.id;

    const planBLab = (await eventsOf(planB)).find(
      (e) => e.componentType === "lab",
    )!;
    await as(request(app).patch(`/api/schedules/${planB}/events/${planBLab.id}`))
      .send({ sectionNumber: LAB_B })
      .expect(200);

    expect(
      (await eventsOf(planA)).find((e) => e.componentType === "lab")
        ?.sectionNumber,
    ).toBe(LAB_A);
    expect(
      (await eventsOf(planB)).find((e) => e.componentType === "lab")
        ?.sectionNumber,
    ).toBe(LAB_B);
  });
});

describe("saved-schedule list reports a real event count", () => {
  /**
   * REGRESSION: the list endpoint's correlated subquery was rendered without
   * table qualification — `where "schedule_id" = "id"` — so both names bound
   * to schedule_events itself and every schedule reported 0 events. A student
   * who duplicated a schedule saw the copy listed as empty.
   */
  it("counts the sections actually on each schedule", async () => {
    const id = await newSchedule("Counted");
    await addSection(id, LECTURE_A).expect(201);
    await addSection(id, LAB_A).expect(201);

    const res = await as(
      request(app).get(`/api/schedules?term=${TERM}&year=${YEAR}`),
    ).expect(200);
    const row = res.body.schedules.find((s: any) => s.id === id);
    expect(row.eventCount).toBe(2);
  });

  it("reports zero only when a schedule really is empty", async () => {
    const id = await newSchedule("Genuinely empty");
    const res = await as(
      request(app).get(`/api/schedules?term=${TERM}&year=${YEAR}`),
    ).expect(200);
    expect(res.body.schedules.find((s: any) => s.id === id).eventCount).toBe(0);
  });

  it("gives a duplicated schedule the same count as its source", async () => {
    const id = await newSchedule("Source");
    await addSection(id, LECTURE_A).expect(201);
    await addSection(id, LAB_A).expect(201);
    const dup = await as(request(app).post(`/api/schedules/${id}/duplicate`))
      .send({ name: "Copy" })
      .expect(201);

    const res = await as(
      request(app).get(`/api/schedules?term=${TERM}&year=${YEAR}`),
    ).expect(200);
    const source = res.body.schedules.find((s: any) => s.id === id);
    const copy = res.body.schedules.find((s: any) => s.id === dup.body.id);
    expect(copy.eventCount).toBe(source.eventCount);
    expect(copy.eventCount).toBe(2);
  });

  it("does not multiply counts across sibling schedules", async () => {
    const a = await newSchedule("Sibling A");
    const b = await newSchedule("Sibling B");
    await addSection(a, LECTURE_A).expect(201);
    await addSection(b, LECTURE_A).expect(201);
    await addSection(b, LAB_A).expect(201);

    const res = await as(
      request(app).get(`/api/schedules?term=${TERM}&year=${YEAR}`),
    ).expect(200);
    expect(res.body.schedules.find((s: any) => s.id === a).eventCount).toBe(1);
    expect(res.body.schedules.find((s: any) => s.id === b).eventCount).toBe(2);
  });
});
