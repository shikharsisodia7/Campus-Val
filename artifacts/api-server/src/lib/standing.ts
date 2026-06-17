export type ClassStanding = "freshman" | "sophomore" | "junior" | "senior";

export function classifyStanding(totalUnits: number): ClassStanding {
  if (totalUnits < 44) return "freshman";
  if (totalUnits < 87) return "sophomore";
  if (totalUnits < 131) return "junior";
  return "senior";
}

export function standingLabel(s: ClassStanding): string {
  switch (s) {
    case "freshman":
      return "First Year";
    case "sophomore":
      return "Sophomore";
    case "junior":
      return "Junior";
    case "senior":
      return "Senior";
  }
}

/**
 * SCU undergraduate quarterly unit caps (Fall/Winter/Spring).
 * Standard cap: max units a student can register for without dean approval.
 * Approved cap: hard ceiling that the dean can authorize, requires GPA >= 3.0.
 *
 * Per SCU Bulletin: First-year/Sophomore standard 20 (approved 22),
 * Junior/Senior standard 22 (approved 24).
 */
export function standardCapFor(standing: ClassStanding): number {
  return standing === "freshman" || standing === "sophomore" ? 20 : 22;
}

export function approvedCapFor(standing: ClassStanding): number {
  return standing === "freshman" || standing === "sophomore" ? 22 : 24;
}
