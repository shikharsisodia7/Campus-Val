import { Router, type IRouter } from "express";
import { CalculateGpaBody, SimulateGpaBody } from "@workspace/api-zod";
import { GRADE_POINTS, type GradeKey } from "../lib/grades";

const router: IRouter = Router();

function calc(
  courses: { units: number; grade: string }[],
): { gpa: number; totalUnits: number; gradedUnits: number; totalGradePoints: number } {
  let totalUnits = 0;
  let gradedUnits = 0;
  let totalGradePoints = 0;
  for (const c of courses) {
    const units = Number(c.units);
    totalUnits += units;
    const pts = GRADE_POINTS[c.grade as GradeKey];
    if (pts === null || pts === undefined) continue;
    gradedUnits += units;
    totalGradePoints += units * pts;
  }
  const gpa = gradedUnits > 0 ? totalGradePoints / gradedUnits : 0;
  return {
    gpa: Math.round(gpa * 1000) / 1000,
    totalUnits,
    gradedUnits,
    totalGradePoints: Math.round(totalGradePoints * 1000) / 1000,
  };
}

router.post("/gpa/calculate", (req, res) => {
  const body = CalculateGpaBody.parse(req.body);
  res.json(calc(body.courses));
});

router.post("/gpa/simulate", (req, res) => {
  const body = SimulateGpaBody.parse(req.body);
  const projected = calc(body.projected);

  const newTotalGradePoints =
    body.currentGpa * body.currentGradedUnits + projected.totalGradePoints;
  const newGradedUnits = body.currentGradedUnits + projected.gradedUnits;
  const simulatedGpa =
    newGradedUnits > 0 ? newTotalGradePoints / newGradedUnits : body.currentGpa;
  const rounded = Math.round(simulatedGpa * 1000) / 1000;
  const change = Math.round((rounded - body.currentGpa) * 1000) / 1000;
  const canOverload = rounded >= 3.0;
  const note = canOverload
    ? `Projected GPA ${rounded.toFixed(3)} ≥ 3.0 → you'd meet the GPA component of overload eligibility (still need priority registration + dean approval).`
    : `Projected GPA ${rounded.toFixed(3)} is below 3.0 — overload above 19 units would not be approved next term.`;
  res.json({
    currentGpa: body.currentGpa,
    simulatedGpa: rounded,
    gpaChange: change,
    canOverloadNextTerm: canOverload,
    overloadEligibilityNote: note,
  });
});

export default router;
