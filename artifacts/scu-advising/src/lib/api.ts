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
  { value: "continuing", label: "Continuing SCU undergraduate" },
  { value: "graduate", label: "Graduate student" },
  { value: "postgrad", label: "Post-graduate / non-degree-seeking" },
] as const;

export type StudentType = (typeof STUDENT_TYPE_OPTIONS)[number]["value"];

// Map a college human-name to the 3-letter code used by graduation-paths.
export const COLLEGE_CODE: Record<(typeof COLLEGE_OPTIONS)[number], "SOE" | "LSB" | "CAS"> = {
  "School of Engineering": "SOE",
  "Leavey School of Business": "LSB",
  "College of Arts and Sciences": "CAS",
  "School of Education and Counseling Psychology": "CAS",
};

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

export type SCUTerm = "fall" | "winter" | "spring" | "summer";

// Approximate SCU quarter calendar windows (close enough for "what term is it
// right now"). Winter Jan-mid Mar; Spring late Mar-mid Jun; Summer mid Jun-mid
// Sept; Fall mid Sept-Dec. We use day-of-year boundaries so the result flips
// over on roughly the right calendar day.
export function getCurrentSCUTerm(now: Date = new Date()): {
  term: SCUTerm;
  year: number;
} {
  const m = now.getMonth() + 1; // 1-12
  const d = now.getDate();
  const y = now.getFullYear();
  // Winter: Jan 1 – Mar 20
  if (m < 3 || (m === 3 && d <= 20)) return { term: "winter", year: y };
  // Spring: Mar 21 – Jun 15
  if (m < 6 || (m === 6 && d <= 15)) return { term: "spring", year: y };
  // Summer: Jun 16 – Sep 15
  if (m < 9 || (m === 9 && d <= 15)) return { term: "summer", year: y };
  // Fall: Sep 16 – Dec 31
  return { term: "fall", year: y };
}

export function nextSCUTerm(t: SCUTerm, year: number): { term: SCUTerm; year: number } {
  switch (t) {
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

export function termAndYearLabel(t: string, y: number): string {
  return `${termLabel(t)} ${y}`;
}
