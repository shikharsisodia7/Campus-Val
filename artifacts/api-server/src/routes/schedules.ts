import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  quarterSchedulesTable,
  scheduleEventsTable,
  type QuarterScheduleRow,
  type ScheduleEventRow,
} from "@workspace/db";
import {
  CreateScheduleBody,
  UpdateScheduleBody,
  DuplicateScheduleBody,
  AddScheduleEventBody,
  UpdateScheduleEventBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { COURSES, findCourse } from "../data/courses";
import { offeredSectionsFor } from "../data/offered-sections";
import { searchCourses } from "../lib/course-search";
import { classifySection } from "../lib/course-components";

const router: IRouter = Router();

const TERMS = new Set(["fall", "winter", "spring", "summer"]);
const DAY_SET = new Set(["M", "T", "W", "R", "F", "S", "U"]);
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function toMin(t: string): number {
  const [h, m] = t.split(":");
  return parseInt(h!, 10) * 60 + parseInt(m!, 10);
}

function scheduleDto(row: QuarterScheduleRow, eventCount: number) {
  return {
    id: row.id,
    name: row.name,
    term: row.term,
    year: row.year,
    eventCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function eventDto(row: ScheduleEventRow) {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    kind: row.kind as "section" | "commitment",
    courseCode: row.courseCode ?? null,
    courseTitle: row.courseTitle ?? null,
    sectionNumber: row.sectionNumber ?? null,
    units: row.units === null ? null : Number(row.units),
    instructor: row.instructor ?? null,
    name: row.name ?? null,
    category: (row.category as never) ?? null,
    institution: row.institution ?? null,
    externalCourseLabel: row.externalCourseLabel ?? null,
    notes: row.notes ?? null,
    meetingDays: row.meetingDays ?? [],
    startTime: row.startTime,
    endTime: row.endTime,
    location: row.location ?? null,
    // Derived at read time from the meeting snapshot already stored on the
    // row, so multi-component scheduling needs no migration and every
    // schedule saved before this feature keeps working unchanged.
    componentType:
      row.kind === "section" && row.courseCode
        ? classifySection({
            courseCode: row.courseCode,
            meetingDays: (row.meetingDays ?? []) as string[],
            startTime: row.startTime,
            endTime: row.endTime,
          }).componentType
        : null,
  };
}

async function ownedSchedule(
  id: number,
  userId: string,
): Promise<QuarterScheduleRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await db
    .select()
    .from(quarterSchedulesTable)
    .where(
      and(
        eq(quarterSchedulesTable.id, id),
        eq(quarterSchedulesTable.userId, userId),
      ),
    );
  return rows[0] ?? null;
}

async function detailDto(row: QuarterScheduleRow) {
  const events = await db
    .select()
    .from(scheduleEventsTable)
    .where(eq(scheduleEventsTable.scheduleId, row.id))
    .orderBy(asc(scheduleEventsTable.id));
  return {
    id: row.id,
    name: row.name,
    term: row.term,
    year: row.year,
    events: events.map(eventDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Resolve + validate a real section from the official Registrar schedule. */
function resolveSection(
  courseCode: string,
  sectionNumber: string,
  term: string,
  year: number,
):
  | { ok: true; snapshot: Partial<typeof scheduleEventsTable.$inferInsert> }
  | { ok: false; error: string } {
  const course = findCourse(courseCode);
  if (!course) return { ok: false, error: `Unknown course: ${courseCode}` };
  const sections = offeredSectionsFor(course.code, term, year);
  if (sections.length === 0) {
    return {
      ok: false,
      error: `${course.code} has no sections in the official ${term} ${year} schedule`,
    };
  }
  const section = sections.find(
    (s) => s.sectionNumber === String(sectionNumber).trim(),
  );
  if (!section) {
    return {
      ok: false,
      error: `Section ${sectionNumber} of ${course.code} not found in ${term} ${year}`,
    };
  }
  return {
    ok: true,
    snapshot: {
      kind: "section",
      courseCode: course.code,
      courseTitle: course.title,
      sectionNumber: section.sectionNumber,
      units: String(course.units),
      instructor: section.instructor || null,
      meetingDays: section.meetingDays,
      startTime: section.startTime,
      endTime: section.endTime,
      location: section.location || null,
    },
  };
}

function validateCommitmentTimes(body: {
  meetingDays?: string[];
  startTime?: string;
  endTime?: string;
}): string | null {
  const days = body.meetingDays ?? [];
  if (days.length === 0) return "At least one meeting day is required";
  if (days.some((d) => !DAY_SET.has(d))) return "Invalid meeting day";
  if (!body.startTime || !TIME_RE.test(body.startTime))
    return "Invalid start time (expected HH:mm)";
  if (!body.endTime || !TIME_RE.test(body.endTime))
    return "Invalid end time (expected HH:mm)";
  if (toMin(body.endTime) <= toMin(body.startTime))
    return "End time must be after start time";
  return null;
}

// ---------- schedules CRUD ----------

router.get("/schedules", requireAuth, async (req, res) => {
  const conds = [eq(quarterSchedulesTable.userId, req.userId!)];
  const term = req.query.term as string | undefined;
  if (term && TERMS.has(term)) conds.push(eq(quarterSchedulesTable.term, term));
  const yearRaw = req.query.year as string | undefined;
  if (yearRaw !== undefined) {
    const y = Number(yearRaw);
    if (Number.isInteger(y)) conds.push(eq(quarterSchedulesTable.year, y));
  }
  // A correlated subquery was rendered here WITHOUT table qualification —
  // `where "schedule_id" = "id"` — so both names bound to schedule_events
  // itself and every schedule reported 0 events. That made a duplicated
  // schedule look empty in the switcher. A join qualifies the columns.
  const rows = await db
    .select({
      schedule: quarterSchedulesTable,
      eventCount: sql<number>`count(${scheduleEventsTable.id})`,
    })
    .from(quarterSchedulesTable)
    .leftJoin(
      scheduleEventsTable,
      eq(scheduleEventsTable.scheduleId, quarterSchedulesTable.id),
    )
    .where(and(...conds))
    .groupBy(quarterSchedulesTable.id)
    .orderBy(asc(quarterSchedulesTable.id));
  res.json({
    schedules: rows.map((r) => scheduleDto(r.schedule, Number(r.eventCount))),
  });
});

router.post("/schedules", requireAuth, async (req, res) => {
  const parsed = CreateScheduleBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid input" });
  const { name, term, year } = parsed.data;
  const [row] = await db
    .insert(quarterSchedulesTable)
    .values({ userId: req.userId!, name: name.trim(), term, year })
    .returning();
  res.status(201).json(await detailDto(row!));
});

router.get("/schedules/:id", requireAuth, async (req, res) => {
  const row = await ownedSchedule(Number(req.params.id), req.userId!);
  if (!row) return res.status(404).json({ error: "Schedule not found" });
  res.json(await detailDto(row));
});

router.patch("/schedules/:id", requireAuth, async (req, res) => {
  const row = await ownedSchedule(Number(req.params.id), req.userId!);
  if (!row) return res.status(404).json({ error: "Schedule not found" });
  const parsed = UpdateScheduleBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid input" });
  const [updated] = await db
    .update(quarterSchedulesTable)
    .set({ name: parsed.data.name.trim() })
    .where(eq(quarterSchedulesTable.id, row.id))
    .returning();
  res.json(await detailDto(updated!));
});

router.delete("/schedules/:id", requireAuth, async (req, res) => {
  const row = await ownedSchedule(Number(req.params.id), req.userId!);
  if (!row) return res.status(404).json({ error: "Schedule not found" });
  await db.transaction(async (tx) => {
    await tx
      .delete(scheduleEventsTable)
      .where(eq(scheduleEventsTable.scheduleId, row.id));
    await tx
      .delete(quarterSchedulesTable)
      .where(eq(quarterSchedulesTable.id, row.id));
  });
  res.status(204).end();
});

router.post("/schedules/:id/duplicate", requireAuth, async (req, res) => {
  const row = await ownedSchedule(Number(req.params.id), req.userId!);
  if (!row) return res.status(404).json({ error: "Schedule not found" });
  const parsed = DuplicateScheduleBody.safeParse(req.body ?? {});
  const name =
    (parsed.success && parsed.data.name?.trim()) || `${row.name} (copy)`;
  const copy = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(quarterSchedulesTable)
      .values({ userId: req.userId!, name, term: row.term, year: row.year })
      .returning();
    const events = await tx
      .select()
      .from(scheduleEventsTable)
      .where(eq(scheduleEventsTable.scheduleId, row.id));
    if (events.length > 0) {
      await tx.insert(scheduleEventsTable).values(
        events.map((e) => ({
          scheduleId: created!.id,
          kind: e.kind,
          courseCode: e.courseCode,
          courseTitle: e.courseTitle,
          sectionNumber: e.sectionNumber,
          units: e.units,
          instructor: e.instructor,
          name: e.name,
          category: e.category,
          institution: e.institution,
          externalCourseLabel: e.externalCourseLabel,
          notes: e.notes,
          meetingDays: e.meetingDays,
          startTime: e.startTime,
          endTime: e.endTime,
          location: e.location,
        })),
      );
    }
    return created!;
  });
  res.status(201).json(await detailDto(copy));
});

// ---------- events ----------

router.post("/schedules/:id/events", requireAuth, async (req, res) => {
  const row = await ownedSchedule(Number(req.params.id), req.userId!);
  if (!row) return res.status(404).json({ error: "Schedule not found" });
  const parsed = AddScheduleEventBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid input" });
  const body = parsed.data;

  if (body.kind === "section") {
    if (!body.courseCode || !body.sectionNumber)
      return res
        .status(400)
        .json({ error: "courseCode and sectionNumber are required" });
    const resolved = resolveSection(
      body.courseCode,
      body.sectionNumber,
      row.term,
      row.year,
    );
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    const dup = await db
      .select({ id: scheduleEventsTable.id })
      .from(scheduleEventsTable)
      .where(
        and(
          eq(scheduleEventsTable.scheduleId, row.id),
          eq(scheduleEventsTable.kind, "section"),
          eq(
            scheduleEventsTable.courseCode,
            resolved.snapshot.courseCode as string,
          ),
          eq(
            scheduleEventsTable.sectionNumber,
            resolved.snapshot.sectionNumber as string,
          ),
        ),
      );
    if (dup.length > 0)
      return res
        .status(409)
        .json({ error: "That section is already on this schedule" });
    const [created] = await db
      .insert(scheduleEventsTable)
      .values({
        scheduleId: row.id,
        ...(resolved.snapshot as object),
      } as typeof scheduleEventsTable.$inferInsert)
      .returning();
    return res.status(201).json(eventDto(created!));
  }

  // commitment
  if (!body.name?.trim())
    return res.status(400).json({ error: "Commitment name is required" });
  const timeErr = validateCommitmentTimes(body);
  if (timeErr) return res.status(400).json({ error: timeErr });
  const [created] = await db
    .insert(scheduleEventsTable)
    .values({
      scheduleId: row.id,
      kind: "commitment",
      name: body.name.trim(),
      category: body.category ?? "other",
      institution: body.institution?.trim() || null,
      externalCourseLabel: body.externalCourseLabel?.trim() || null,
      notes: body.notes?.trim() || null,
      meetingDays: body.meetingDays!,
      startTime: body.startTime!,
      endTime: body.endTime!,
      location: body.location?.trim() || null,
    })
    .returning();
  res.status(201).json(eventDto(created!));
});

router.patch(
  "/schedules/:id/events/:eventId",
  requireAuth,
  async (req, res) => {
    const row = await ownedSchedule(Number(req.params.id), req.userId!);
    if (!row) return res.status(404).json({ error: "Schedule not found" });
    const eventId = Number(req.params.eventId);
    const events = await db
      .select()
      .from(scheduleEventsTable)
      .where(
        and(
          eq(scheduleEventsTable.id, Number.isInteger(eventId) ? eventId : -1),
          eq(scheduleEventsTable.scheduleId, row.id),
        ),
      );
    const event = events[0];
    if (!event) return res.status(404).json({ error: "Event not found" });
    const parsed = UpdateScheduleEventBody.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid input" });
    const body = parsed.data;

    if (event.kind === "section") {
      // Only supported change: swap to a different real section.
      const courseCode = body.courseCode ?? event.courseCode!;
      const sectionNumber = body.sectionNumber;
      if (!sectionNumber)
        return res
          .status(400)
          .json({ error: "sectionNumber is required to change a section" });
      const resolved = resolveSection(
        courseCode,
        sectionNumber,
        row.term,
        row.year,
      );
      if (!resolved.ok)
        return res.status(400).json({ error: resolved.error });
      // Prevent swapping into a section that's already on this schedule.
      const dup = await db
        .select({ id: scheduleEventsTable.id })
        .from(scheduleEventsTable)
        .where(
          and(
            eq(scheduleEventsTable.scheduleId, row.id),
            eq(scheduleEventsTable.kind, "section"),
            eq(scheduleEventsTable.courseCode, courseCode),
            eq(scheduleEventsTable.sectionNumber, sectionNumber),
          ),
        );
      if (dup.some((d) => d.id !== event.id))
        return res
          .status(409)
          .json({ error: "That section is already on this schedule" });
      const [updated] = await db
        .update(scheduleEventsTable)
        .set(resolved.snapshot as never)
        .where(eq(scheduleEventsTable.id, event.id))
        .returning();
      return res.json(eventDto(updated!));
    }

    // commitment edit
    const merged = {
      meetingDays: body.meetingDays ?? (event.meetingDays as string[]),
      startTime: body.startTime ?? event.startTime,
      endTime: body.endTime ?? event.endTime,
    };
    const timeErr = validateCommitmentTimes(merged);
    if (timeErr) return res.status(400).json({ error: timeErr });
    if (body.name !== undefined && !body.name.trim())
      return res.status(400).json({ error: "Commitment name is required" });
    const [updated] = await db
      .update(scheduleEventsTable)
      .set({
        name: body.name?.trim() ?? event.name,
        category: body.category ?? event.category,
        institution:
          body.institution !== undefined
            ? body.institution.trim() || null
            : event.institution,
        externalCourseLabel:
          body.externalCourseLabel !== undefined
            ? body.externalCourseLabel.trim() || null
            : event.externalCourseLabel,
        notes:
          body.notes !== undefined ? body.notes.trim() || null : event.notes,
        location:
          body.location !== undefined
            ? body.location.trim() || null
            : event.location,
        ...merged,
      })
      .where(eq(scheduleEventsTable.id, event.id))
      .returning();
    res.json(eventDto(updated!));
  },
);

router.delete(
  "/schedules/:id/events/:eventId",
  requireAuth,
  async (req, res) => {
    const row = await ownedSchedule(Number(req.params.id), req.userId!);
    if (!row) return res.status(404).json({ error: "Schedule not found" });
    const eventId = Number(req.params.eventId);
    const deleted = await db
      .delete(scheduleEventsTable)
      .where(
        and(
          eq(scheduleEventsTable.id, Number.isInteger(eventId) ? eventId : -1),
          eq(scheduleEventsTable.scheduleId, row.id),
        ),
      )
      .returning({ id: scheduleEventsTable.id });
    if (deleted.length === 0)
      return res.status(404).json({ error: "Event not found" });
    res.status(204).end();
  },
);

// ---------- advanced search + core taxonomy ----------

router.get("/core-areas", (_req, res) => {
  const counts = new Map<string, number>();
  for (const c of COURSES) {
    for (const area of c.coreAreas ?? []) {
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }
  }
  const coreAreas = Array.from(counts.entries())
    .map(([name, courseCount]) => ({ name, courseCount }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // No authoritative SCU Pathway → course mapping dataset exists in
  // CampusVal yet; we say so honestly instead of inventing one.
  res.json({ coreAreas, pathwaysAvailable: false });
});

router.get("/course-search", (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const coreAreasRaw = (req.query.coreAreas as string | undefined) ?? "";
  const coreAreas = coreAreasRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const matchMode = req.query.matchMode === "any" ? "any" : "all";
  const limitRaw = Number(req.query.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100
      ? limitRaw
      : 30;

  const term = req.query.term as string | undefined;
  const yearRaw = req.query.year as string | undefined;
  const year = yearRaw !== undefined ? Number(yearRaw) : undefined;
  let sectionCounts: Map<string, number> | undefined;
  if (term && TERMS.has(term) && year !== undefined && Number.isInteger(year)) {
    sectionCounts = new Map();
    // Count official sections per course for the quarter.
    for (const c of COURSES) {
      const n = offeredSectionsFor(c.code, term, year).length;
      if (n > 0) sectionCounts.set(c.code.toUpperCase(), n);
    }
  }

  if (!q && coreAreas.length === 0) {
    return res.json({ state: "results", totalMatching: 0, courses: [] });
  }
  res.json(searchCourses(COURSES, { q, coreAreas, matchMode, sectionCounts, limit }));
});

export default router;
