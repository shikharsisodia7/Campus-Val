import type { Term } from "./courses";

export type PathType = "three_year" | "four_year";

export interface GraduationPathQuarterEntry {
  year: number;
  term: Term;
  label: string;
  courses: string[];
  plannedUnits: number;
  notes?: string;
}

export interface GraduationPathEntry {
  type: PathType;
  major: string;
  title: string;
  summary: string;
  feasibilityNote: string;
  averageUnitsPerQuarter: number;
  requiresOverload: boolean;
  quarters: GraduationPathQuarterEntry[];
  risks: string[];
}

const FOUR_YEAR_CSE: GraduationPathEntry = {
  type: "four_year",
  major: "CSE",
  title: "Computer Science & Engineering — Standard 4-Year Path",
  summary:
    "Standard 12-quarter (4-year) plan, ~14.5 units/quarter average. Comfortable workload, leaves room for an internship summer or a minor.",
  feasibilityNote:
    "Recommended default. Within standard cap (20 units freshman/soph, 22 units junior/senior). No overload needed.",
  averageUnitsPerQuarter: 14.5,
  requiresOverload: false,
  risks: [
    "If you fail/repeat CSEN 11 or 12 you'll need a summer or 5th year.",
    "Senior design (ENGR 110) is fall-only — can't slip past it.",
  ],
  quarters: [
    { year: 1, term: "fall", label: "Y1 Fall", courses: ["ENGR 1", "MATH 11", "ENGL 1A", "TESP 1"], plannedUnits: 13 },
    { year: 1, term: "winter", label: "Y1 Winter", courses: ["MATH 12", "CSEN 10", "ENGL 1B", "TESP 2"], plannedUnits: 16 },
    { year: 1, term: "spring", label: "Y1 Spring", courses: ["MATH 13", "CSEN 11", "PHYS 31", "HIST 11A"], plannedUnits: 17 },
    { year: 2, term: "fall", label: "Y2 Fall", courses: ["MATH 14", "CSEN 12", "PHYS 32", "COMM 12"], plannedUnits: 17 },
    { year: 2, term: "winter", label: "Y2 Winter", courses: ["MATH 22", "CSEN 19", "PHYS 33", "TESP 3"], plannedUnits: 17 },
    { year: 2, term: "spring", label: "Y2 Spring", courses: ["MATH 53", "CSEN 20", "ECON 1"], plannedUnits: 14 },
    { year: 3, term: "fall", label: "Y3 Fall", courses: ["CSEN 21", "ENGL 2"], plannedUnits: 8, notes: "Light load — internship search quarter." },
    { year: 3, term: "winter", label: "Y3 Winter", courses: ["PHIL 9", "COMM 12"], plannedUnits: 8 },
    { year: 3, term: "spring", label: "Y3 Spring", courses: ["HIST 11B", "PSYC 1"], plannedUnits: 9 },
    { year: 4, term: "fall", label: "Y4 Fall", courses: ["ENGR 110"], plannedUnits: 2 },
    { year: 4, term: "winter", label: "Y4 Winter", courses: [], plannedUnits: 0, notes: "Reserved for technical electives + senior design continuation." },
    { year: 4, term: "spring", label: "Y4 Spring", courses: [], plannedUnits: 0, notes: "Reserved for technical electives + senior design continuation." },
  ],
};

const THREE_YEAR_CSE: GraduationPathEntry = {
  type: "three_year",
  major: "CSE",
  title: "Computer Science & Engineering — Aggressive 3-Year Path",
  summary:
    "Compressed 9-quarter plan averaging ~19.5 units/quarter. Requires overload approval in 4+ quarters and a clean prerequisite run.",
  feasibilityNote:
    "AGGRESSIVE. Requires GPA ≥ 3.0 + priority registration + dean approval to overload past the 20/22-unit standard caps. Any failed prerequisite course pushes you to a 4-year plan. AP/transfer credit is essentially required.",
  averageUnitsPerQuarter: 19.6,
  requiresOverload: true,
  risks: [
    "Multiple quarters at 20-22 units of difficult engineering coursework.",
    "Overload approval is per-quarter — losing it once breaks the schedule.",
    "Dropping a single class in a 19+ unit quarter still puts you above standard cap, requiring re-approval.",
    "PHYS 32 + CSEN 12 + MATH 22 simultaneously is 12 units of heavy STEM.",
    "No room for failure: a single C- prereq miss costs at least one summer.",
  ],
  quarters: [
    { year: 1, term: "fall", label: "Y1 Fall", courses: ["ENGR 1", "MATH 11", "CSEN 10", "ENGL 1A", "TESP 1"], plannedUnits: 17 },
    { year: 1, term: "winter", label: "Y1 Winter", courses: ["MATH 12", "CSEN 11", "ENGL 1B", "TESP 2", "COMM 12"], plannedUnits: 20 },
    { year: 1, term: "spring", label: "Y1 Spring", courses: ["MATH 13", "CSEN 12", "PHYS 31", "HIST 11A", "PHIL 9"], plannedUnits: 21, notes: "Overload (>20) requires GPA ≥ 3.0 + dean approval." },
    { year: 2, term: "fall", label: "Y2 Fall", courses: ["MATH 14", "CSEN 19", "PHYS 32", "TESP 3", "ECON 1"], plannedUnits: 22, notes: "Overload (junior standing achievable here only if AP credit is in)." },
    { year: 2, term: "winter", label: "Y2 Winter", courses: ["MATH 22", "CSEN 20", "PHYS 33", "HIST 11B"], plannedUnits: 18 },
    { year: 2, term: "spring", label: "Y2 Spring", courses: ["MATH 53", "CSEN 21", "ENGL 2", "PSYC 1"], plannedUnits: 16 },
    { year: 3, term: "fall", label: "Y3 Fall", courses: ["ENGR 110"], plannedUnits: 2, notes: "Plus 18+ units of technical electives (not modeled)." },
    { year: 3, term: "winter", label: "Y3 Winter", courses: [], plannedUnits: 0, notes: "Heavy elective + senior design continuation." },
    { year: 3, term: "spring", label: "Y3 Spring", courses: [], plannedUnits: 0, notes: "Heavy elective + senior design continuation." },
  ],
};

export function getGraduationPath(type: PathType, major = "CSE"): GraduationPathEntry {
  // Currently only CSE is modeled in detail; default to CSE when other majors requested.
  const _ = major;
  return type === "three_year" ? THREE_YEAR_CSE : FOUR_YEAR_CSE;
}
