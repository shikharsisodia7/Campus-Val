import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
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
import { CORE_AREAS, coreAreaDefForTag, resolveCoreAreaTag } from "../data/core-areas";
import { offeredSectionsFor } from "../data/offered-sections";
import { searchCourses } from "../lib/course-search";
import {
  classifySection,
  courseScheduleStatus,
  type ComponentType,
  type CourseScheduleStatus,
} from "../lib/course-components";
import { courseTermSections, type CourseTermSections } from "../lib/term-sections";
import type { Term } from "../lib/availability";

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

function eventDto(row: ScheduleEventRow, componentType: ComponentType | null) {
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
    // Derived at read time, so multi-component scheduling needs no migration
    // and every schedule saved before this feature keeps working unchanged.
    componentType,
  };
}

/**
 * Components for a schedule's section events, classified against the sections
 * the course offers in THE SCHEDULE'S OWN term (a Fall section is never used to
 * classify a Winter one). One lookup per course.
 */
async function scheduleContext(schedule: QuarterScheduleRow, events: ScheduleEventRow[]) {
  const codes = Array.from(
    new Set(events.filter((e) => e.kind === "section" && e.courseCode).map((e) => e.courseCode!)),
  );
  const byCourse = new Map<string, CourseTermSections>(
    await Promise.all(
      codes.map(
        async (code) => [code, await courseTermSections(code, schedule.term as Term, schedule.year)] as const,
      ),
    ),
  );

  const componentOf = (e: ScheduleEventRow): ComponentType | null => {
    if (e.kind !== "section" || !e.courseCode) return null;
    const term = byCourse.get(e.courseCode);
    const listed = term?.sections.find((x) => x.sectionNumber === e.sectionNumber);
    if (listed) return listed.classification.componentType;
    // The section is no longer in the schedule data: classify its snapshot
    // against what the course offers now.
    return classifySection(
      {
        courseCode: e.courseCode,
        meetingDays: (e.meetingDays ?? []) as string[],
        startTime: e.startTime,
        endTime: e.endTime,
      },
      term?.sections ?? [],
    ).componentType;
  };

  const courseStatus: CourseScheduleStatus[] = codes.map((code) =>
    courseScheduleStatus(
      code,
      byCourse.get(code)?.sections ?? [],
      events
        .filter((e) => e.kind === "section" && e.courseCode === code)
        .map((e) => componentOf(e) ?? "unknown"),
    ),
  );
  return { componentOf, courseStatus, byCourse };
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
  const { componentOf, courseStatus } = await scheduleContext(row, events);
  return {
    id: row.id,
    name: row.name,
    term: row.term,
    year: row.year,
    events: events.map((e) => eventDto(e, componentOf(e))),
    // Per course: what is scheduled, what is still to choose, and what the
    // term's schedule has not published yet.
    courseStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Resolve + validate a real section for THIS term: from the Registrar's
 * schedule, or one an availability source lists for the term (for example lab
 * sections Workday posts while the Registrar's schedule is still tentative).
 * Meeting details are snapshotted from that source — never invented.
 */
async function resolveSection(
  courseCode: string,
  sectionNumber: string,
  term: string,
  year: number,
): Promise<
  | { ok: true; snapshot: Partial<typeof scheduleEventsTable.$inferInsert>; componentType: ComponentType }
  | { ok: false; error: string }
> {
  const course = findCourse(courseCode);
  if (!course) return { ok: false, error: `Unknown course: ${courseCode}` };
  const { sections } = await courseTermSections(course.code, term as Term, year);
  if (sections.length === 0) {
    return {
      ok: false,
      error: `${course.code} has no sections in the official ${term} ${year} schedule`,
    };
  }
  const section = sections.find((s) => s.sectionNumber === String(sectionNumber).trim());
  if (!section) {
    return {
      ok: false,
      error: `Section ${sectionNumber} of ${course.code} not found in ${term} ${year}`,
    };
  }
  if (section.meetingDays.length === 0 || !section.startTime || !section.endTime) {
    // schedule_events needs real times; a section with none cannot be placed.
    if (section.origin === "availability_source") {
      return {
        ok: false,
        error: `Section ${sectionNumber} of ${course.code} has no meeting time published yet`,
      };
    }
  }
  return {
    ok: true,
    componentType: section.classification.componentType,
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
    const resolved = await resolveSection(
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
    return res.status(201).json(eventDto(created!, resolved.componentType));
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
  res.status(201).json(eventDto(created!, null));
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
      const resolved = await resolveSection(
        courseCode,
        sectionNumber,
        row.term,
        row.year,
      );
      if (!resolved.ok)
        return res.status(400).json({ error: resolved.error });
      // A swap changes ONE component. Swapping a lecture for a lab section would
      // silently drop the lecture, so a section of a different component must be
      // ADDED instead. (When either side could not be classified there is
      // nothing to compare, and the swap is allowed.)
      if (courseCode === event.courseCode) {
        const current = (await scheduleContext(row, [event])).componentOf(event);
        if (
          current &&
          current !== "unknown" &&
          resolved.componentType !== "unknown" &&
          current !== resolved.componentType
        ) {
          return res.status(409).json({
            error: `Section ${sectionNumber} is a ${resolved.componentType} section, not a ${current}. Add it as a separate component instead of replacing your ${current}.`,
            code: "component_mismatch",
          });
        }
      }
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
      return res.json(eventDto(updated!, resolved.componentType));
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
    res.json(eventDto(updated!, null));
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

/**
 * Remove a WHOLE course from a schedule: its lecture, its lab and any other
 * component section, in one step. (Removing a single event removes only that
 * component and leaves the rest of the course in place.)
 */
router.delete(
  "/schedules/:id/courses/:courseCode",
  requireAuth,
  async (req, res) => {
    const row = await ownedSchedule(Number(req.params.id), req.userId!);
    if (!row) return res.status(404).json({ error: "Schedule not found" });
    const course = findCourse(String(req.params.courseCode));
    const courseCode = course?.code ?? String(req.params.courseCode).toUpperCase().replace(/\s+/g, " ").trim();
    const deleted = await db
      .delete(scheduleEventsTable)
      .where(
        and(
          eq(scheduleEventsTable.scheduleId, row.id),
          eq(scheduleEventsTable.kind, "section"),
          eq(scheduleEventsTable.courseCode, courseCode),
        ),
      )
      .returning({ id: scheduleEventsTable.id });
    if (deleted.length === 0)
      return res.status(404).json({ error: "That course is not on this schedule" });
    res.json({ removed: deleted.length });
  },
);

// ---------- advanced search + core taxonomy ----------

router.get("/core-areas", (_req, res) => {
  const counts = new Map<string, { total: number; stated: number }>();
  for (const c of COURSES) {
    for (const area of c.coreAreas ?? []) {
      const entry = counts.get(area) ?? { total: 0, stated: 0 };
      entry.total += 1;
      if (c.coreAreaSources?.[area] === "catalog_text") entry.stated += 1;
      counts.set(area, entry);
    }
  }
  // Canonical order (data/core-areas.ts) first — every defined area is listed
  // even at zero courses so the UI can say "no catalog tagging" instead of
  // silently omitting a requirement — then any legacy tag not in the table.
  const known = CORE_AREAS.map((a) => a.tag);
  const extra = [...counts.keys()].filter((t) => !known.includes(t)).sort();
  const coreAreas = [...known, ...extra].map((name) => {
    const def = coreAreaDefForTag(name);
    const c = counts.get(name) ?? { total: 0, stated: 0 };
    return {
      name,
      code: def?.code ?? null,
      courseCount: c.total,
      catalogStatedCount: c.stated,
      requirementIds: def?.requirementIds ?? [],
    };
  });
  // No authoritative SCU Pathway → course mapping dataset exists in
  // CampusVal yet; we say so honestly instead of inventing one.
  res.json({ coreAreas, pathwaysAvailable: false });
});

/**
 * Aliases that, typed alone into the free-text box, unambiguously mean a Core
 * area and not a department ("ctw", "cni", "aw"…). Deliberately NOT every
 * alias: "math", "arts" and "lang" are also department searches.
 */
const IMPLICIT_QUERY_ALIASES = new Set(["ctw", "c&i", "cni", "aw", "elsj", "rtc", "sts"]);

router.get("/course-search", (req, res) => {
  let q = (req.query.q as string | undefined)?.trim();
  const coreAreasRaw = (req.query.coreAreas as string | undefined) ?? "";
  // Resolve every alias ("CTW", "CNI", "C&I 3") to its canonical tag through
  // the ONE definition table. An unrecognised name is kept as-is so it
  // matches nothing (an honest empty result) instead of being dropped, which
  // would silently widen the search to the whole catalog.
  const coreAreas = coreAreasRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => resolveCoreAreaTag(s) ?? s);
  if (q && coreAreas.length === 0 && IMPLICIT_QUERY_ALIASES.has(q.toLowerCase())) {
    const tag = resolveCoreAreaTag(q);
    if (tag) {
      coreAreas.push(tag);
      q = undefined;
    }
  }
  const matchMode = req.query.matchMode === "any" ? "any" : "all";
  const limitRaw = Number(req.query.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 100
      ? limitRaw
      : 30;
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isInteger(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
  // Historical behaviour: a quarter hides courses with no sections. The
  // Filter/requirement UIs pass offeredOnly=false to get the COMPLETE catalog
  // result set with offered courses first.
  const offeredOnly = req.query.offeredOnly !== "false";

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
    return res.json({
      state: "results",
      totalMatching: 0,
      totalWithSections: null,
      offset: 0,
      hasMore: false,
      courses: [],
    });
  }
  res.json(
    searchCourses(COURSES, { q, coreAreas, matchMode, sectionCounts, offeredOnly, limit, offset }),
  );
});

export default router;
