import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, studentProfilesTable } from "@workspace/db";
import {
  classifyStanding,
  standardCapFor,
  approvedCapFor,
  standingLabel,
} from "../lib/standing";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const REQUIRED_TO_GRADUATE = 175;

type SCUTerm = "fall" | "winter" | "spring" | "summer";

// Date-aware "what term is it right now". Mirrors getCurrentSCUTerm() in the
// frontend so the server reports a live term instead of relying on a stored
// value that becomes stale the moment the calendar flips.
function getCurrentSCUTerm(now: Date = new Date()): { term: SCUTerm; year: number } {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const y = now.getFullYear();
  if (m < 3 || (m === 3 && d <= 20)) return { term: "winter", year: y };
  if (m < 6 || (m === 6 && d <= 15)) return { term: "spring", year: y };
  if (m < 9 || (m === 9 && d <= 15)) return { term: "summer", year: y };
  return { term: "fall", year: y };
}

function nextTerm(
  term: SCUTerm,
  year: number,
): { term: SCUTerm; year: number } {
  switch (term) {
    case "fall":
      return { term: "winter", year: year + 1 };
    case "winter":
      return { term: "spring", year };
    case "spring":
      return { term: "summer", year };
    case "summer":
      return { term: "fall", year };
  }
}

function rowToDto(row: typeof studentProfilesTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    studentType: row.studentType,
    college: row.college,
    major: row.major,
    secondMajor: row.secondMajor ?? null,
    minor: row.minor ?? null,
    startTerm: row.startTerm,
    startYear: row.startYear,
    expectedGradTerm: row.expectedGradTerm,
    expectedGradYear: row.expectedGradYear,
    unitsCompletedAtSCU: Number(row.unitsCompletedAtScu),
    unitsTransferredIn: Number(row.unitsTransferredIn),
    cumulativeGpa: row.cumulativeGpa === null ? null : Number(row.cumulativeGpa),
    majorGpa: row.majorGpa === null ? null : Number(row.majorGpa),
    completedCourseCodes: row.completedCourseCodes ?? [],
    priorityRegistration: row.priorityRegistration,
    currentTerm: row.currentTerm,
    currentYear: row.currentYear,
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, req.userId!))
    .limit(1);
  const profile = rows.length === 0 ? null : rowToDto(rows[0]!);

  const today = getCurrentSCUTerm();

  if (!profile) {
    const term = today.term;
    return res.json({
      profile: null,
      todayTerm: today.term,
      todayYear: today.year,
      classification: "Unknown",
      totalUnitsAllSources: 0,
      unitsToGraduation: REQUIRED_TO_GRADUATE,
      progressPercent: 0,
      canOverloadNextTerm: false,
      overloadReason: "Complete onboarding to see overload eligibility.",
      unitCapNextTerm: 20,
      registrationWindowNote:
        "Registration windows open by class standing. Priority groups go first.",
      nextTerm: term,
      nextTermYear: today.year,
      upcomingDeadlines: [],
      warnings: ["No student profile yet. Complete onboarding to personalize CampusVal."],
    });
  }

  const totalUnits = profile.unitsCompletedAtSCU + profile.unitsTransferredIn;
  const standing = classifyStanding(totalUnits);
  const classification = standingLabel(standing);
  const standardCap = standardCapFor(standing);
  const approvedCap = approvedCapFor(standing);
  const unitsToGraduation = Math.max(0, REQUIRED_TO_GRADUATE - totalUnits);
  const progressPercent = Math.min(
    100,
    Math.round((totalUnits / REQUIRED_TO_GRADUATE) * 100),
  );

  const gpa = profile.cumulativeGpa ?? null;
  const canOverloadByGpa = gpa !== null && gpa >= 3.0;
  const canOverload = canOverloadByGpa && profile.priorityRegistration;

  let overloadReason = "";
  if (canOverload) {
    overloadReason = `Eligible: GPA ≥ 3.0 + priority registration. As a ${classification.toLowerCase()}, you can request up to ${approvedCap} units (standard cap is ${standardCap}). Dean approval still required to register above ${standardCap} units.`;
  } else if (gpa === null) {
    overloadReason =
      "Add your cumulative GPA to your profile to evaluate overload eligibility.";
  } else if (!canOverloadByGpa) {
    overloadReason = `Cumulative GPA of ${gpa.toFixed(2)} is below the 3.0 overload threshold.`;
  } else {
    overloadReason = `Priority registration is required to overload above the ${standardCap}-unit ${classification.toLowerCase()} cap.`;
  }

  // Always derive "next term" from today's calendar, not from the stale
  // currentTerm a student set during onboarding months ago. This guarantees
  // the dashboard reflects reality (e.g. in May 2026 it should say
  // "Spring 2026 → next: Summer 2026", not whatever was first stored).
  const next = nextTerm(today.term, today.year);
  const warnings: string[] = [];
  if (totalUnits >= 87.5 - 5 && profile.unitsTransferredIn > 0) {
    warnings.push(
      "You're close to or at the 87.5 quarter-unit transfer cap. Any additional outside coursework may not count.",
    );
  }
  if (gpa !== null && gpa < 2.0) {
    warnings.push(
      "Cumulative GPA is below 2.0 — academic probation rules apply. See the Probation policy.",
    );
  }
  if (
    standing === "senior" &&
    REQUIRED_TO_GRADUATE - totalUnits <= 45 &&
    profile.unitsCompletedAtSCU < 60
  ) {
    warnings.push(
      "As a senior, 35 of your final 45 units must be taken in residence at SCU. Plan accordingly.",
    );
  }

  const registrationWindowNote =
    profile.priorityRegistration
      ? `Priority registration: you register in the first wave for ${next.term} ${next.year}.`
      : `Standard registration: your window opens by class standing (${classification}) for ${next.term} ${next.year}.`;

  res.json({
    profile,
    todayTerm: today.term,
    todayYear: today.year,
    classification,
    totalUnitsAllSources: totalUnits,
    unitsToGraduation,
    progressPercent,
    canOverloadNextTerm: canOverload,
    overloadReason,
    unitCapNextTerm: canOverload ? approvedCap : standardCap,
    registrationWindowNote,
    nextTerm: next.term,
    nextTermYear: next.year,
    upcomingDeadlines: [
      {
        title: "Registration opens",
        date: `${next.term} ${next.year}`,
        description: registrationWindowNote,
      },
      {
        title: "Withdrawal deadline (with W)",
        date: "End of week 7",
        description:
          "Last day to withdraw from a course and receive a W instead of a letter grade.",
      },
    ],
    warnings,
  });
});

export default router;
