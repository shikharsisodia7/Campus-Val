import { Router, type IRouter } from "express";
import {
  getGraduationPath,
  getAvailableMajors,
  getAvailableMinors,
  getMajorRequirements,
  type PathType,
} from "../data/graduation-paths";
import { findCourse } from "../data/courses";

const router: IRouter = Router();

function parseCompleted(q: unknown): string[] {
  if (typeof q !== "string" || q.length === 0) return [];
  return q.split(",").map((s) => s.trim()).filter(Boolean);
}

// Treat AP/IB credit equivalents the same as completed coursework so
// students don't see courses they've already cleared via test scores.
function mergeCompleted(req: { query: Record<string, unknown> }): string[] {
  return [
    ...parseCompleted(req.query.completed),
    ...parseCompleted(req.query.apIbCredits),
  ];
}

router.get("/graduation-paths/majors", (_req, res) => {
  res.json({ majors: getAvailableMajors() });
});

router.get("/graduation-paths/minors", (_req, res) => {
  res.json({ minors: getAvailableMinors() });
});

router.get("/graduation-paths/requirements", (req, res) => {
  const major = (req.query.major as string | undefined) ?? "CSE";
  const completed = mergeCompleted(req);
  const reqs = getMajorRequirements(major, completed, (code) => {
    const c = findCourse(code);
    if (!c) return undefined;
    return { code: c.code, title: c.title, units: c.units, description: c.description };
  });
  if (!reqs) return res.status(404).json({ error: `Unknown major: ${major}` });
  res.json(reqs);
});

router.get("/graduation-paths/:type", (req, res) => {
  const type = req.params.type;
  if (type !== "three_year" && type !== "four_year") {
    return res
      .status(400)
      .json({ error: "type must be 'three_year' or 'four_year'" });
  }
  const major = (req.query.major as string | undefined) ?? "CSE";
  const completed = mergeCompleted(req);
  const path = getGraduationPath(type as PathType, major, completed);
  res.json(path);
});

export default router;
