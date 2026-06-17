import ccData from "./community-colleges.json";

export interface ArticulationRecord {
  institution: string;
  sourceCourseCode: string;
  sourceCourseTitle: string;
  sourceUnits: number;
  sourceUnitSystem: "semester" | "quarter";
  scuEquivalent: string;
  scuQuarterUnits: number;
  notes?: string;
  verifiedDate: string;
}

export interface CommunityCollege {
  name: string;
  city: string;
  region: string;
  assistUrl: string;
}

export const COMMUNITY_COLLEGES: CommunityCollege[] = ccData as CommunityCollege[];

export const ARTICULATION_SOURCE_NOTE =
  "ASSIST.org is the official statewide source of CCC→SCU course-by-course articulation. SCU also maintains an internal equivalency table (gated Google Sheet, not public). The records below are a small hand-verified slice (2024-2025); for any other course or institution, follow the ASSIST link to look up the live mapping.";

/**
 * Hand-verified articulation records for the highest-traffic SCU feeder
 * community colleges. SCU's authoritative table is a gated internal Google
 * Sheet; ASSIST.org is the official public source but its API is not open.
 *
 * For any institution not in this list (and there are 110+ more in California),
 * the response will return zero matches and direct the student to ASSIST.org
 * via the deep-link in COMMUNITY_COLLEGES.
 *
 * Note: SCU renamed COEN → CSEN (Computer Science Engineering) — these notes
 * use the current CSEN codes from the 2025-2026 catalog.
 */
const ARTICULATION_RECORDS: ArticulationRecord[] = [
  // De Anza College
  { institution: "De Anza College", sourceCourseCode: "MATH 1A", sourceCourseTitle: "Calculus", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 11", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "De Anza College", sourceCourseCode: "MATH 1B", sourceCourseTitle: "Calculus", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 12", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "De Anza College", sourceCourseCode: "MATH 1C", sourceCourseTitle: "Calculus", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 13", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "De Anza College", sourceCourseCode: "MATH 1D", sourceCourseTitle: "Calculus", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 14", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "De Anza College", sourceCourseCode: "PHYS 4A", sourceCourseTitle: "Physics for Scientists & Engineers: Mechanics", sourceUnits: 6, sourceUnitSystem: "quarter", scuEquivalent: "PHYS 31", scuQuarterUnits: 5, verifiedDate: "2024-2025" },
  { institution: "De Anza College", sourceCourseCode: "PHYS 4B", sourceCourseTitle: "Physics for Scientists & Engineers: E&M", sourceUnits: 6, sourceUnitSystem: "quarter", scuEquivalent: "PHYS 32", scuQuarterUnits: 5, verifiedDate: "2024-2025" },
  { institution: "De Anza College", sourceCourseCode: "CIS 22A", sourceCourseTitle: "Beginning Programming Methodologies in C++", sourceUnits: 4.5, sourceUnitSystem: "quarter", scuEquivalent: "CSCI 10", scuQuarterUnits: 4, notes: "Substitutes for CSCI 10. Does NOT substitute for CSEN 10/11.", verifiedDate: "2024-2025" },
  { institution: "De Anza College", sourceCourseCode: "ENGL 1A", sourceCourseTitle: "Composition and Reading", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "ENGL 1A", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "De Anza College", sourceCourseCode: "ECON 1", sourceCourseTitle: "Principles of Macroeconomics", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "ECON 2", scuQuarterUnits: 5, notes: "Note: De Anza ECON 1 = SCU ECON 2 (Macro). De Anza ECON 2 = SCU ECON 1 (Micro). Easy to swap by mistake.", verifiedDate: "2024-2025" },

  // Foothill College
  { institution: "Foothill College", sourceCourseCode: "MATH 1A", sourceCourseTitle: "Calculus", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 11", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "Foothill College", sourceCourseCode: "MATH 1B", sourceCourseTitle: "Calculus", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 12", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "Foothill College", sourceCourseCode: "MATH 1C", sourceCourseTitle: "Calculus", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 13", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "Foothill College", sourceCourseCode: "C S 1A", sourceCourseTitle: "Object-Oriented Programming Methodologies in Java", sourceUnits: 4.5, sourceUnitSystem: "quarter", scuEquivalent: "CSCI 10", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "Foothill College", sourceCourseCode: "PHYS 4A", sourceCourseTitle: "General Physics: Mechanics", sourceUnits: 6, sourceUnitSystem: "quarter", scuEquivalent: "PHYS 31", scuQuarterUnits: 5, verifiedDate: "2024-2025" },
  { institution: "Foothill College", sourceCourseCode: "ENGL 1A", sourceCourseTitle: "Composition and Reading", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "ENGL 1A", scuQuarterUnits: 4, verifiedDate: "2024-2025" },

  // West Valley College
  { institution: "West Valley College", sourceCourseCode: "MATH 3A", sourceCourseTitle: "Analytic Geometry & Calculus I", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 11", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "West Valley College", sourceCourseCode: "MATH 3B", sourceCourseTitle: "Analytic Geometry & Calculus II", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 12", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "West Valley College", sourceCourseCode: "CIS 50", sourceCourseTitle: "Programming Concepts and Methodology I", sourceUnits: 4, sourceUnitSystem: "quarter", scuEquivalent: "CSCI 10", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "West Valley College", sourceCourseCode: "PHIL 5", sourceCourseTitle: "Critical Thinking", sourceUnits: 4, sourceUnitSystem: "quarter", scuEquivalent: "PHIL 9", scuQuarterUnits: 4, verifiedDate: "2024-2025" },

  // Mission College
  { institution: "Mission College", sourceCourseCode: "MAT 3A", sourceCourseTitle: "Analytic Geometry & Calculus I", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 11", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "Mission College", sourceCourseCode: "MAT 3B", sourceCourseTitle: "Calculus II", sourceUnits: 5, sourceUnitSystem: "quarter", scuEquivalent: "MATH 12", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "Mission College", sourceCourseCode: "CIS 084A", sourceCourseTitle: "Object-Oriented Programming in C++", sourceUnits: 4, sourceUnitSystem: "quarter", scuEquivalent: "CSCI 60", scuQuarterUnits: 4, notes: "May fulfill CSCI 60 with prior approval; not equivalent to CSEN 11.", verifiedDate: "2024-2025" },

  // Santa Monica College (semester system - shows the 1.5x conversion)
  { institution: "Santa Monica College", sourceCourseCode: "MATH 7", sourceCourseTitle: "Calculus 1", sourceUnits: 5, sourceUnitSystem: "semester", scuEquivalent: "MATH 11", scuQuarterUnits: 4, notes: "5 semester units * 1.5 = 7.5 quarter units, but capped at SCU course unit value (4).", verifiedDate: "2024-2025" },
  { institution: "Santa Monica College", sourceCourseCode: "MATH 8", sourceCourseTitle: "Calculus 2", sourceUnits: 5, sourceUnitSystem: "semester", scuEquivalent: "MATH 12", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "Santa Monica College", sourceCourseCode: "ENGL 1", sourceCourseTitle: "Reading and Composition I", sourceUnits: 3, sourceUnitSystem: "semester", scuEquivalent: "ENGL 1A", scuQuarterUnits: 4, verifiedDate: "2024-2025" },
  { institution: "Santa Monica College", sourceCourseCode: "CS 55", sourceCourseTitle: "Discrete Structures", sourceUnits: 3, sourceUnitSystem: "semester", scuEquivalent: "CSEN 19", scuQuarterUnits: 4, notes: "Engineering majors: requires advance dean approval for CSEN 19 substitution.", verifiedDate: "2024-2025" },
];

/**
 * All California Community Colleges + their ASSIST deep-link.
 * Used to populate the institution dropdown so students can browse to the
 * official articulation page even when we don't have a cached record.
 */
export function listInstitutions(): string[] {
  // Union: all CA CCs + any institution with hand-verified records (in case
  // we ever add a non-CCC institution to the verified list).
  const fromCCs = COMMUNITY_COLLEGES.map((cc) => cc.name);
  const fromRecords = ARTICULATION_RECORDS.map((r) => r.institution);
  return Array.from(new Set([...fromCCs, ...fromRecords])).sort();
}

export function findCommunityCollege(name: string): CommunityCollege | undefined {
  const norm = name.toLowerCase().trim();
  return COMMUNITY_COLLEGES.find((cc) => cc.name.toLowerCase() === norm);
}

export function searchArticulation(opts: {
  institution?: string;
  courseCode?: string;
  scuTarget?: string;
}): ArticulationRecord[] {
  const inst = opts.institution?.toLowerCase().trim();
  const code = opts.courseCode?.toLowerCase().trim().replace(/\s+/g, " ");
  const target = opts.scuTarget?.toLowerCase().trim().replace(/\s+/g, " ");
  return ARTICULATION_RECORDS.filter((r) => {
    if (inst && r.institution.toLowerCase() !== inst) return false;
    if (code && !r.sourceCourseCode.toLowerCase().replace(/\s+/g, " ").includes(code)) return false;
    if (target && r.scuEquivalent.toLowerCase().replace(/\s+/g, " ") !== target) return false;
    return true;
  });
}
