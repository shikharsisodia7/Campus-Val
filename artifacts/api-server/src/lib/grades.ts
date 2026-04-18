export type GradeKey =
  | "A_PLUS" | "A" | "A_MINUS"
  | "B_PLUS" | "B" | "B_MINUS"
  | "C_PLUS" | "C" | "C_MINUS"
  | "D_PLUS" | "D" | "D_MINUS"
  | "F" | "P" | "NP" | "IP" | "W";

export const GRADE_POINTS: Record<GradeKey, number | null> = {
  A_PLUS: 4.0, A: 4.0, A_MINUS: 3.7,
  B_PLUS: 3.3, B: 3.0, B_MINUS: 2.7,
  C_PLUS: 2.3, C: 2.0, C_MINUS: 1.7,
  D_PLUS: 1.3, D: 1.0, D_MINUS: 0.7,
  F: 0.0,
  P: null, NP: null, IP: null, W: null,
};

export function isPassingForPrereq(grade: GradeKey): boolean {
  const pts = GRADE_POINTS[grade];
  if (pts === null) return grade === "P";
  return pts >= 1.7;
}
