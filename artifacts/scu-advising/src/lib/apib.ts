// Curated AP / IB → SCU credit equivalents. Source: SCU Office of the
// Registrar Advanced Placement & International Baccalaureate tables
// (2025-2026 catalog). Only the most common exams are listed here — the
// full table is on registrar.scu.edu. Score thresholds are conservative;
// students should always verify with the Registrar before relying on
// these for graduation planning.

export interface ExamCredit {
  id: string;             // stable id used in storage
  exam: string;           // human label
  category: "AP" | "IB";
  minScore: number;       // minimum score on the exam to receive credit
  scuEquivalents: string[]; // SCU course codes (or "elective" pseudo-codes)
  notes?: string;
}

export const EXAM_CREDITS: ExamCredit[] = [
  // ---- AP ----
  { id: "ap-calc-ab",    exam: "AP Calculus AB",            category: "AP", minScore: 4, scuEquivalents: ["MATH 11"] },
  { id: "ap-calc-bc",    exam: "AP Calculus BC",            category: "AP", minScore: 4, scuEquivalents: ["MATH 11", "MATH 12"] },
  { id: "ap-stats",      exam: "AP Statistics",             category: "AP", minScore: 4, scuEquivalents: ["MATH 8"] },
  { id: "ap-bio",        exam: "AP Biology",                category: "AP", minScore: 4, scuEquivalents: ["BIOL 1A", "BIOL 1B"] },
  { id: "ap-chem",       exam: "AP Chemistry",              category: "AP", minScore: 4, scuEquivalents: ["CHEM 11"] },
  { id: "ap-phys-1",     exam: "AP Physics 1",              category: "AP", minScore: 4, scuEquivalents: ["PHYS 11"] },
  { id: "ap-phys-2",     exam: "AP Physics 2",              category: "AP", minScore: 4, scuEquivalents: ["PHYS 12"] },
  { id: "ap-phys-cm",    exam: "AP Physics C: Mechanics",   category: "AP", minScore: 4, scuEquivalents: ["PHYS 31"] },
  { id: "ap-phys-cem",   exam: "AP Physics C: E&M",         category: "AP", minScore: 4, scuEquivalents: ["PHYS 32"] },
  { id: "ap-csa",        exam: "AP Computer Science A",     category: "AP", minScore: 4, scuEquivalents: ["CSEN 10"] },
  { id: "ap-eng-lang",   exam: "AP English Language",       category: "AP", minScore: 4, scuEquivalents: ["ENGL 1A"] },
  { id: "ap-eng-lit",    exam: "AP English Literature",     category: "AP", minScore: 4, scuEquivalents: ["ENGL 1A"] },
  { id: "ap-us-hist",    exam: "AP US History",             category: "AP", minScore: 4, scuEquivalents: ["HIST 11A"] },
  { id: "ap-world-hist", exam: "AP World History",          category: "AP", minScore: 4, scuEquivalents: ["HIST 11B"] },
  { id: "ap-euro-hist",  exam: "AP European History",       category: "AP", minScore: 4, scuEquivalents: ["HIST 11A"] },
  { id: "ap-psych",      exam: "AP Psychology",             category: "AP", minScore: 4, scuEquivalents: ["PSYC 1"] },
  { id: "ap-econ-macro", exam: "AP Macroeconomics",         category: "AP", minScore: 4, scuEquivalents: ["ECON 1"] },
  { id: "ap-econ-micro", exam: "AP Microeconomics",         category: "AP", minScore: 4, scuEquivalents: ["ECON 2"] },
  { id: "ap-spanish",    exam: "AP Spanish Language",       category: "AP", minScore: 4, scuEquivalents: ["SPAN 1", "SPAN 2", "SPAN 3"], notes: "Fulfills the 3-quarter foreign-language requirement." },
  { id: "ap-french",     exam: "AP French Language",        category: "AP", minScore: 4, scuEquivalents: ["FREN 1", "FREN 2", "FREN 3"], notes: "Fulfills the 3-quarter foreign-language requirement." },
  { id: "ap-chinese",    exam: "AP Chinese Language",       category: "AP", minScore: 4, scuEquivalents: ["CHIN 1", "CHIN 2", "CHIN 3"], notes: "Fulfills the 3-quarter foreign-language requirement." },

  // ---- IB Higher Level ----
  { id: "ib-math-aa-hl", exam: "IB Math: Analysis & Approaches HL", category: "IB", minScore: 5, scuEquivalents: ["MATH 11", "MATH 12"] },
  { id: "ib-bio-hl",     exam: "IB Biology HL",             category: "IB", minScore: 5, scuEquivalents: ["BIOL 1A"] },
  { id: "ib-chem-hl",    exam: "IB Chemistry HL",           category: "IB", minScore: 5, scuEquivalents: ["CHEM 11"] },
  { id: "ib-phys-hl",    exam: "IB Physics HL",             category: "IB", minScore: 5, scuEquivalents: ["PHYS 11"] },
  { id: "ib-eng-hl",     exam: "IB English Lit HL",         category: "IB", minScore: 5, scuEquivalents: ["ENGL 1A"] },
  { id: "ib-econ-hl",    exam: "IB Economics HL",           category: "IB", minScore: 5, scuEquivalents: ["ECON 1", "ECON 2"] },
  { id: "ib-hist-hl",    exam: "IB History HL",             category: "IB", minScore: 5, scuEquivalents: ["HIST 11A"] },
  { id: "ib-psych-hl",   exam: "IB Psychology HL",          category: "IB", minScore: 5, scuEquivalents: ["PSYC 1"] },
];

const STORAGE_KEY = "campusval.apib.v1";

export interface StoredExam {
  id: string;
  score: number;
}

export function loadStoredExams(): StoredExam[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is StoredExam =>
        x && typeof x.id === "string" && typeof x.score === "number",
    );
  } catch {
    return [];
  }
}

export function saveStoredExams(exams: StoredExam[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
}

// Returns the SCU course codes earned from the user's stored exams,
// considering the per-exam minimum-score threshold.
export function creditedCourses(stored: StoredExam[]): string[] {
  const earned = new Set<string>();
  for (const s of stored) {
    const exam = EXAM_CREDITS.find((e) => e.id === s.id);
    if (!exam) continue;
    if (s.score >= exam.minScore) {
      for (const c of exam.scuEquivalents) earned.add(c);
    }
  }
  return Array.from(earned);
}
