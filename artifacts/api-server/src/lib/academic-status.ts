import {
  approvedCapFor,
  standardCapFor,
  standingLabel,
  type ClassStanding,
} from "./standing";

/**
 * Pure academic-status rules. A missing GPA (null) is NEVER treated as 0 —
 * "no SCU GPA yet" and "GPA of 0.00" are entirely different academic states.
 *
 * Policy sources:
 * - Overload: GPA ≥ 3.0 + priority registration + dean approval
 *   (SCU Undergraduate Bulletin, Ch. 8 — Academic & Administrative Policies).
 * - Academic probation: cumulative GPA below 2.0
 *   (SCU Undergraduate Bulletin, Ch. 8).
 */

export type GpaDisplayState =
  | { kind: "unknown"; label: "No SCU GPA yet" }
  | { kind: "known"; value: number };

export function gpaDisplayState(gpa: number | null): GpaDisplayState {
  if (gpa === null) return { kind: "unknown", label: "No SCU GPA yet" };
  return { kind: "known", value: gpa };
}

export type WarningLevel = "info" | "warning" | "action_required" | "unknown";

export interface AcademicNotice {
  level: WarningLevel;
  message: string;
  /** Policy source id/label so the UI can attribute the rule. */
  source: string;
}

/**
 * Probation notice. Only a CONFIRMED GPA below 2.0 produces a warning; a
 * missing GPA produces an informational notice, never a probation alarm.
 */
export function probationNotice(gpa: number | null): AcademicNotice | null {
  if (gpa === null) return null;
  if (gpa < 2.0) {
    return {
      level: "warning",
      message:
        "Cumulative GPA is below 2.0 — academic probation rules apply. See the Probation policy.",
      source: "SCU Undergraduate Bulletin, Ch. 8 (Academic Standing)",
    };
  }
  return null;
}

export interface OverloadResult {
  canOverload: boolean;
  reason: string;
  unitCap: number;
}

export function overloadEligibility(
  gpa: number | null,
  priorityRegistration: boolean,
  standing: ClassStanding,
): OverloadResult {
  const standardCap = standardCapFor(standing);
  const approvedCap = approvedCapFor(standing);
  const label = standingLabel(standing).toLowerCase();

  const canOverloadByGpa = gpa !== null && gpa >= 3.0;
  const canOverload = canOverloadByGpa && priorityRegistration;

  let reason: string;
  if (canOverload) {
    reason = `Eligible: GPA ≥ 3.0 + priority registration. As a ${label}, you can request up to ${approvedCap} units (standard cap is ${standardCap}). Dean approval still required to register above ${standardCap} units.`;
  } else if (gpa === null) {
    // Unknown GPA is NOT a failed threshold — it's simply not evaluable yet.
    reason =
      "No SCU GPA yet — overload eligibility can be evaluated after your first graded quarter (requires GPA ≥ 3.0 and priority registration).";
  } else if (!canOverloadByGpa) {
    reason = `Cumulative GPA of ${gpa.toFixed(2)} is below the 3.0 overload threshold.`;
  } else {
    reason = `Priority registration is required to overload above the ${standardCap}-unit ${label} cap.`;
  }

  return {
    canOverload,
    reason,
    unitCap: canOverload ? approvedCap : standardCap,
  };
}
