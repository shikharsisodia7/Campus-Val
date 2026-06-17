import { Router, type IRouter } from "express";
import { and, ilike, or, sql } from "drizzle-orm";
import { db, courseSectionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { lookupRmp, rmpDeepLink } from "../lib/rmp-client";

const router: IRouter = Router();

const TERM_ORDER: Record<string, number> = {
  winter: 1,
  spring: 2,
  summer: 3,
  fall: 4,
};

function termTitle(term: string, year: number) {
  return `${term.charAt(0).toUpperCase() + term.slice(1)} ${year}`;
}

function departmentOf(courseCode: string): string {
  const m = courseCode.match(/^([A-Z]+)/);
  return m ? m[1]! : "";
}

router.get("/professors", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  // Aggregate in SQL so this stays fast as course_sections grows.
  // Filter out blank/TBA/Staff instructors at the DB level.
  const filters = [
    sql`length(trim(${courseSectionsTable.instructor})) > 0`,
    sql`lower(trim(${courseSectionsTable.instructor})) <> 'tba'`,
    sql`lower(trim(${courseSectionsTable.instructor})) <> 'staff'`,
  ];
  if (q) {
    const orCond = or(
      ilike(courseSectionsTable.instructor, `%${q}%`),
      ilike(courseSectionsTable.courseCode, `%${q}%`),
    );
    if (orCond) filters.push(orCond);
  }
  const whereCond = and(...filters);

  // Total synced sections (independent of `q`) for the empty-state copy.
  const totalRow = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(courseSectionsTable);
  const totalCount = totalRow[0]?.c ?? 0;

  const aggRows = await db
    .select({
      instructor: courseSectionsTable.instructor,
      sectionsCount: sql<number>`count(*)::int`,
      courses: sql<string[]>`array_agg(distinct ${courseSectionsTable.courseCode})`,
      latestRank: sql<number>`max(
        ${courseSectionsTable.year} * 10 + case lower(${courseSectionsTable.term})
          when 'winter' then 1
          when 'spring' then 2
          when 'summer' then 3
          when 'fall' then 4
          else 0 end
      )::int`,
    })
    .from(courseSectionsTable)
    .where(whereCond)
    .groupBy(courseSectionsTable.instructor)
    .orderBy(courseSectionsTable.instructor);

  function termFromRank(rank: number): string {
    if (!rank) return "—";
    const year = Math.floor(rank / 10);
    const t = rank % 10;
    const term =
      t === 1 ? "winter" : t === 2 ? "spring" : t === 3 ? "summer" : t === 4 ? "fall" : "";
    return term ? termTitle(term, year) : "—";
  }

  const professors = aggRows.map((r) => {
    const name = r.instructor.trim();
    const courses = (r.courses ?? []).slice().sort();
    const departments = [...new Set(courses.map(departmentOf).filter(Boolean))].sort();
    return {
      name,
      departments,
      courses,
      sectionsCount: Number(r.sectionsCount ?? 0),
      latestTerm: termFromRank(Number(r.latestRank ?? 0)),
      rmpDeepLinkUrl: rmpDeepLink(name),
    };
  });

  let emptyReason: string | null = null;
  if (professors.length === 0) {
    emptyReason =
      totalCount === 0
        ? "No Workday sections have been synced yet. Paste rows from SCU Workday's 'Find Course Sections' on the Sync page to populate this directory."
        : `No instructors matched "${q}". Try a broader search.`;
  }

  res.json({
    professors,
    totalSyncedSections: totalCount,
    emptyReason,
  });
});

router.get("/professors/:name/rmp", requireAuth, async (req, res) => {
  const raw = req.params.name;
  const rawName = Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  if (!rawName || rawName.length > 200) {
    return res.status(400).json({ error: "Invalid name" });
  }
  const result = await lookupRmp(rawName);
  res.json(result);
});

export default router;
