import { Router, type IRouter } from "express";
import { COURSES, findCourse } from "../data/courses";

const router: IRouter = Router();

router.get("/courses", (req, res) => {
  const search = (req.query.search as string | undefined)?.toLowerCase().trim();
  const department = (req.query.department as string | undefined)
    ?.toLowerCase()
    .trim();
  const coreParam = req.query.core as string | undefined;
  const coreOnly = coreParam === "true";

  let result = COURSES.slice();
  if (search) {
    result = result.filter(
      (c) =>
        c.code.toLowerCase().includes(search) ||
        c.title.toLowerCase().includes(search) ||
        c.description.toLowerCase().includes(search),
    );
  }
  if (department) {
    result = result.filter((c) => c.department.toLowerCase() === department);
  }
  if (coreOnly) {
    result = result.filter((c) => c.coreAreas.length > 0);
  }
  res.json(
    result.map((c) => ({
      code: c.code,
      title: c.title,
      department: c.department,
      units: c.units,
      description: c.description,
      coreAreas: c.coreAreas,
      offeredTerms: c.offeredTerms,
      difficulty: c.difficulty ?? null,
    })),
  );
});

router.get("/courses/:code", (req, res) => {
  const course = findCourse(req.params.code);
  if (!course) return res.status(404).json({ error: "Course not found" });
  res.json({
    code: course.code,
    title: course.title,
    department: course.department,
    units: course.units,
    description: course.description,
    coreAreas: course.coreAreas,
    offeredTerms: course.offeredTerms,
    difficulty: course.difficulty ?? null,
    prereqLogic: course.prereqLogic,
    prereqGroups: course.prereqGroups,
    corequisites: course.corequisites,
    notes: course.notes ?? null,
  });
});

export default router;
