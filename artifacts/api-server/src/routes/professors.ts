import { Router, type IRouter } from "express";
import { db, courseSectionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { OFFERED_SECTIONS } from "../data/offered-sections";

const router: IRouter = Router();

const TERM_RANK: Record<string, number> = {
  winter: 1,
  spring: 2,
  summer: 3,
  fall: 4,
};

function termTitle(term: string, year: number) {
  return `${term.charAt(0).toUpperCase() + term.slice(1)} ${year}`;
}

function departmentOf(courseCode: string): string {
  const m = courseCode.toUpperCase().match(/^([A-Z]+)/);
  return m ? m[1]! : "";
}

function isRealInstructor(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.length > 0 && n !== "tba" && n !== "staff";
}

interface Agg {
  name: string;
  courses: Set<string>;
  sections: number;
  latestRank: number;
}

router.get("/professors", requireAuth, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

  // Base directory: every instructor from the official published 2026-2027
  // Registrar schedule (Fall 2026 has real instructors; the tentative Winter /
  // Spring 2027 terms carry "TBA" and are filtered out). On top of that we
  // merge any sections the student pasted in from Workday so newly announced
  // instructors show up too.
  const byName = new Map<string, Agg>();

  function ingest(rows: {
    instructor: string;
    courseCode: string;
    term: string;
    year: number;
  }[]) {
    for (const r of rows) {
      const name = r.instructor.trim();
      if (!isRealInstructor(name)) continue;
      const key = name.toLowerCase();
      let agg = byName.get(key);
      if (!agg) {
        agg = { name, courses: new Set(), sections: 0, latestRank: 0 };
        byName.set(key, agg);
      }
      agg.courses.add(r.courseCode.toUpperCase().replace(/\s+/g, " "));
      agg.sections += 1;
      const rank = r.year * 10 + (TERM_RANK[r.term.toLowerCase()] ?? 0);
      if (rank > agg.latestRank) agg.latestRank = rank;
    }
  }

  ingest(OFFERED_SECTIONS);

  const workday = await db
    .select({
      instructor: courseSectionsTable.instructor,
      courseCode: courseSectionsTable.courseCode,
      term: courseSectionsTable.term,
      year: courseSectionsTable.year,
    })
    .from(courseSectionsTable);
  ingest(workday);
  const totalSyncedSections = workday.length;

  function termFromRank(rank: number): string {
    if (!rank) return "—";
    const year = Math.floor(rank / 10);
    const t = rank % 10;
    const term =
      t === 1 ? "winter" : t === 2 ? "spring" : t === 3 ? "summer" : t === 4 ? "fall" : "";
    return term ? termTitle(term, year) : "—";
  }

  let professors = [...byName.values()].map((a) => {
    const courses = [...a.courses].sort();
    const departments = [...new Set(courses.map(departmentOf).filter(Boolean))].sort();
    return {
      name: a.name,
      departments,
      courses,
      sectionsCount: a.sections,
      latestTerm: termFromRank(a.latestRank),
    };
  });

  const totalDirectory = professors.length;

  if (q) {
    professors = professors.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.departments.some((d) => d.toLowerCase().includes(q)) ||
        p.courses.some((c) => c.toLowerCase().includes(q)),
    );
  }

  professors.sort((a, b) => a.name.localeCompare(b.name));

  let emptyReason: string | null = null;
  if (professors.length === 0) {
    emptyReason =
      totalDirectory === 0
        ? "No instructors are available yet."
        : `No instructors matched "${req.query.q}". Try a broader search.`;
  }

  res.json({
    professors,
    totalSyncedSections,
    emptyReason,
  });
});

export default router;
