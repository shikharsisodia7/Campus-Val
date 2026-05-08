import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, courseSectionsTable } from "@workspace/db";
import { SyncWorkdaySectionsBody } from "@workspace/api-zod";
import { parseWorkdaySections } from "../lib/workday-parser";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/sections/sync", requireAuth, async (req, res) => {
  const parseResult = SyncWorkdaySectionsBody.safeParse(req.body);
  if (!parseResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid body", details: parseResult.error.message });
  }
  const { rawText, term, year, replaceTerm } = parseResult.data;
  const result = parseWorkdaySections(rawText);

  // Safety: never delete an existing term-worth of sections if the paste
  // produced zero parsed rows — that would silently wipe valid data.
  if (replaceTerm && result.parsed.length === 0) {
    return res.status(400).json({
      error:
        "Parsed 0 sections from your paste — refusing to wipe existing rows for this term. Check the format and try again.",
      parsedCount: 0,
      insertedCount: 0,
      deletedCount: 0,
      term,
      year,
      sampleSections: [],
      errors: result.errors,
    });
  }

  // Run delete + upsert in a single transaction so a partial failure
  // can't leave the term in a half-empty state.
  let deletedCount = 0;
  let insertedCount = 0;
  await db.transaction(async (tx) => {
    if (replaceTerm) {
      const deleted = await tx
        .delete(courseSectionsTable)
        .where(
          and(
            eq(courseSectionsTable.term, term),
            eq(courseSectionsTable.year, year),
          ),
        )
        .returning({ id: courseSectionsTable.id });
      deletedCount = deleted.length;
    }

    if (result.parsed.length > 0) {
      const rows = result.parsed.map((s) => ({
      courseCode: s.courseCode,
      sectionNumber: s.sectionNumber,
      term,
      year,
      instructor: s.instructor,
      meetingDays: s.meetingDays,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location,
      seatsTotal: s.seatsTotal,
      seatsOpen: s.seatsOpen,
      waitlist: s.waitlist,
        sourceLine: s.sourceLine,
      }));
      const inserted = await tx
        .insert(courseSectionsTable)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            courseSectionsTable.courseCode,
            courseSectionsTable.sectionNumber,
            courseSectionsTable.term,
            courseSectionsTable.year,
          ],
          set: {
            instructor: sql`excluded.instructor`,
            meetingDays: sql`excluded.meeting_days`,
            startTime: sql`excluded.start_time`,
            endTime: sql`excluded.end_time`,
            location: sql`excluded.location`,
            seatsTotal: sql`excluded.seats_total`,
            seatsOpen: sql`excluded.seats_open`,
            waitlist: sql`excluded.waitlist`,
            syncedAt: sql`now()`,
            sourceLine: sql`excluded.source_line`,
          },
        })
        .returning({ id: courseSectionsTable.id });
      insertedCount = inserted.length;
    }
  });

  const sample = result.parsed.slice(0, 5).map((s) => ({
    id: `${s.courseCode}-${s.sectionNumber}-${term}-${year}`,
    courseCode: s.courseCode,
    sectionNumber: s.sectionNumber,
    term,
    year,
    instructor: s.instructor,
    meetingDays: s.meetingDays,
    startTime: s.startTime,
    endTime: s.endTime,
    location: s.location,
    seatsTotal: s.seatsTotal,
    seatsOpen: s.seatsOpen,
    waitlist: s.waitlist,
    rating: null,
  }));

  res.json({
    parsedCount: result.parsed.length,
    insertedCount,
    deletedCount,
    term,
    year,
    sampleSections: sample,
    errors: result.errors,
  });
});

router.get("/sections/sync/status", async (_req, res) => {
  const rows = await db
    .select({
      term: courseSectionsTable.term,
      year: courseSectionsTable.year,
      count: sql<number>`count(*)::int`,
      lastSyncedAt: sql<Date>`max(${courseSectionsTable.syncedAt})`,
    })
    .from(courseSectionsTable)
    .groupBy(courseSectionsTable.term, courseSectionsTable.year)
    .orderBy(desc(courseSectionsTable.year), courseSectionsTable.term);

  const total = rows.reduce((acc, r) => acc + r.count, 0);
  const toIso = (v: unknown): string =>
    v instanceof Date ? v.toISOString() : new Date(v as string).toISOString();
  let lastSyncedAt: string | null = null;
  for (const r of rows) {
    const iso = toIso(r.lastSyncedAt);
    if (!lastSyncedAt || iso > lastSyncedAt) lastSyncedAt = iso;
  }

  res.json({
    totalSections: total,
    lastSyncedAt,
    byTerm: rows.map((r) => ({
      term: r.term,
      year: r.year,
      count: r.count,
      lastSyncedAt: toIso(r.lastSyncedAt),
    })),
  });
});

export default router;
