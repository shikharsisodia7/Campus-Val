import { Router, type IRouter } from "express";
import { CheckPlanBody, CheckPrereqsBody } from "@workspace/api-zod";
import { findCourse, COURSES } from "../data/courses";

const router: IRouter = Router();

function checkPrereqsFor(
  courseCode: string,
  completed: string[],
  plannedThisTerm: string[] = [],
) {
  const completedSet = new Set(
    completed.map((c) => c.toUpperCase().replace(/\s+/g, " ")),
  );
  const corequisites = new Set(
    plannedThisTerm.map((c) => c.toUpperCase().replace(/\s+/g, " ")),
  );
  const course = findCourse(courseCode);
  if (!course) {
    return {
      courseCode,
      satisfied: false,
      missing: [] as string[][],
      notes: "Course not found in catalog. Cannot validate prerequisites.",
    };
  }
  const missing: string[][] = [];
  for (const group of course.prereqGroups) {
    const satisfied = group.some((alt) =>
      completedSet.has(alt.toUpperCase().replace(/\s+/g, " ")),
    );
    if (!satisfied) missing.push(group);
  }
  // Corequisites: must be either completed or in current planned term
  const missingCoreqs: string[] = [];
  for (const co of course.corequisites) {
    const norm = co.toUpperCase().replace(/\s+/g, " ");
    if (!completedSet.has(norm) && !corequisites.has(norm)) {
      missingCoreqs.push(co);
    }
  }
  const notes =
    missing.length === 0 && missingCoreqs.length === 0
      ? "All prerequisites satisfied."
      : [
          missing.length > 0
            ? `Missing prerequisite(s): ${missing
                .map((g) => g.join(" or "))
                .join("; ")}.`
            : "",
          missingCoreqs.length > 0
            ? `Missing corequisite(s): ${missingCoreqs.join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join(" ");
  return {
    courseCode: course.code,
    satisfied: missing.length === 0 && missingCoreqs.length === 0,
    missing,
    notes,
  };
}

router.post("/planner/prereqs", (req, res) => {
  const body = CheckPrereqsBody.parse(req.body);
  res.json(
    checkPrereqsFor(
      body.courseCode,
      body.completedCourseCodes,
      body.plannedThisTermCodes,
    ),
  );
});

router.post("/planner/check", (req, res) => {
  const body = CheckPlanBody.parse(req.body);
  const issues: {
    severity: "error" | "warning" | "info";
    code: string;
    message: string;
    relatedCourse?: string | null;
    policyId?: string | null;
  }[] = [];

  const totalUnits = body.plannedCourses.reduce(
    (sum, c) => sum + Number(c.units),
    0,
  );
  const cumulativeGpa = body.cumulativeGpa ?? null;
  const canOverloadByGpa = cumulativeGpa !== null && cumulativeGpa >= 3.0;
  const canOverload = canOverloadByGpa && body.priorityRegistration;
  const unitCap = canOverload ? 25 : 19;

  let overloadReason = "";
  if (canOverload) {
    overloadReason =
      "You meet the baseline overload criteria (GPA ≥ 3.0 + priority registration). Dean approval still required to register above 19 units.";
  } else if (!canOverloadByGpa) {
    overloadReason =
      cumulativeGpa === null
        ? "GPA not provided — overload above 19 units requires cumulative GPA ≥ 3.0."
        : `Cumulative GPA of ${cumulativeGpa.toFixed(2)} is below the 3.0 threshold required for overload.`;
  } else {
    overloadReason =
      "Priority registration is required for overload above 19 units.";
  }

  if (totalUnits > unitCap) {
    issues.push({
      severity: "error",
      code: "UNIT_CAP_EXCEEDED",
      message: `Plan totals ${totalUnits} units, which exceeds your cap of ${unitCap}.`,
      policyId: canOverload ? "overload-eligibility-25" : "unit-load-cap-19",
    });
  } else if (totalUnits > 19 && canOverload) {
    issues.push({
      severity: "warning",
      code: "OVERLOAD_REQUIRES_APPROVAL",
      message: `${totalUnits} units requires explicit dean approval to register, even with overload eligibility.`,
      policyId: "overload-eligibility-25",
    });
  }

  // Per-course validation
  const codes = body.plannedCourses.map((c) => c.code);
  for (const planned of body.plannedCourses) {
    const course = findCourse(planned.code);
    if (!course) {
      issues.push({
        severity: "warning",
        code: "UNKNOWN_COURSE",
        message: `${planned.code} is not in the SCU course catalog. Verify the code with the Bulletin.`,
        relatedCourse: planned.code,
      });
      continue;
    }
    if (!course.offeredTerms.includes(body.term)) {
      issues.push({
        severity: "error",
        code: "NOT_OFFERED",
        message: `${course.code} is not typically offered in ${body.term}. Offered: ${course.offeredTerms.join(", ")}.`,
        relatedCourse: course.code,
      });
    }
    const prereqResult = checkPrereqsFor(
      course.code,
      body.completedCourseCodes,
      codes.filter((c) => c.toUpperCase() !== course.code.toUpperCase()),
    );
    if (!prereqResult.satisfied) {
      issues.push({
        severity: "error",
        code: "PREREQ_NOT_MET",
        message: `${course.code}: ${prereqResult.notes}`,
        relatedCourse: course.code,
        policyId: "prereq-grade-requirement",
      });
    }
    if (course.notes) {
      issues.push({
        severity: "info",
        code: "COURSE_NOTE",
        message: course.notes,
        relatedCourse: course.code,
      });
    }
  }

  // Detect 5-unit STEM combo trap
  const heavyStem = body.plannedCourses.filter((c) => {
    const course = findCourse(c.code);
    return (
      course &&
      Number(c.units) >= 4 &&
      (course.difficulty === "hard" || course.difficulty === "very_hard")
    );
  });
  if (heavyStem.length >= 3) {
    issues.push({
      severity: "warning",
      code: "HEAVY_LOAD_WARNING",
      message: `You have ${heavyStem.length} hard-or-harder courses (${heavyStem.map((h) => h.code).join(", ")}) in one quarter. Consider workload sustainability.`,
    });
  }

  // Core areas fulfilled
  const coreAreasFulfilled = Array.from(
    new Set(
      body.plannedCourses.flatMap((p) => {
        const course = findCourse(p.code);
        return course ? course.coreAreas : [];
      }),
    ),
  );

  res.json({
    totalUnits,
    unitCap,
    canOverload,
    overloadReason,
    issues,
    coreAreasFulfilled,
  });
});

export default router;
export { COURSES };
