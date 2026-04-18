export const API_BASE = "/api";

export function getApiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : "/" + path}`;
}

export const COLLEGE_OPTIONS = [
  "College of Arts and Sciences",
  "School of Engineering",
  "Leavey School of Business",
  "School of Education and Counseling Psychology",
] as const;

export const TERM_OPTIONS = ["fall", "winter", "spring", "summer"] as const;

export const STUDENT_TYPE_OPTIONS = [
  { value: "first_year", label: "First-year (entering as freshman)" },
  { value: "transfer", label: "Transfer student" },
  { value: "continuing", label: "Continuing SCU student" },
] as const;

export const GRADE_OPTIONS = [
  "A_PLUS", "A", "A_MINUS",
  "B_PLUS", "B", "B_MINUS",
  "C_PLUS", "C", "C_MINUS",
  "D_PLUS", "D", "D_MINUS",
  "F", "P", "NP", "IP", "W",
] as const;

export function gradeLabel(g: string): string {
  return g.replace("_PLUS", "+").replace("_MINUS", "-");
}

export function termLabel(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
