import type { Term } from "./courses";

export type PathType = "three_year" | "four_year";
export type College = "SOE" | "LSB" | "CAS";

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

// ---------------------------------------------------------------------------
// MAJOR RECIPES
// ---------------------------------------------------------------------------
// SCU has ~45 undergrad majors across 3 colleges. Building a hand-curated
// 12-quarter schedule for every major is impractical, so we use recipes:
// each major declares its college, math track, and lower/upper-division
// course sequences, and a generator constructs the per-quarter plan from
// the catalog. The CSE plans below are kept hand-tuned (well-known and
// already in production); others are generated.
// ---------------------------------------------------------------------------

interface MajorRecipe {
  major: string;             // department code (key)
  title: string;             // human-readable title
  college: College;
  mathTrack: "calc-stem" | "calc-business" | "calc-life" | "stats" | "any";
  // Lower-division (years 1-2) major-specific courses, in suggested order
  lowerDiv: string[];
  // Upper-division (years 3-4) major-specific courses
  upperDiv: string[];
  capstone?: string;
  notes?: string[];
  // Departments restricted to the School of Engineering for course gating;
  // also signals the SOE math/physics core
  isEngineering?: boolean;
}

const MAJOR_RECIPES: Record<string, MajorRecipe> = {
  // -------- School of Engineering --------
  ECEN: {
    major: "ECEN",
    title: "Electrical & Computer Engineering",
    college: "SOE",
    mathTrack: "calc-stem",
    isEngineering: true,
    lowerDiv: ["ECEN 19", "ECEN 20", "ECEN 21", "ECEN 50", "ECEN 100"],
    upperDiv: ["ECEN 110", "ECEN 122", "ECEN 130", "ECEN 132", "ECEN 133", "ECEN 153"],
    capstone: "ENGR 110",
    notes: ["Engineering-only course gating applies (CSEN/ECEN/MECH/CENG/BIOE/ENGR/AMTH)."],
  },
  MECH: {
    major: "MECH",
    title: "Mechanical Engineering",
    college: "SOE",
    mathTrack: "calc-stem",
    isEngineering: true,
    lowerDiv: ["ENGR 10", "MECH 10", "MECH 11", "MECH 15", "MECH 121"],
    upperDiv: ["MECH 122", "MECH 123", "MECH 124", "MECH 140", "MECH 141", "MECH 142"],
    capstone: "ENGR 110",
  },
  CENG: {
    major: "CENG",
    title: "Civil Engineering",
    college: "SOE",
    mathTrack: "calc-stem",
    isEngineering: true,
    lowerDiv: ["CENG 5", "CENG 41", "CENG 43", "CENG 44"],
    upperDiv: ["CENG 122", "CENG 123", "CENG 125", "CENG 132", "CENG 140", "CENG 141"],
    capstone: "ENGR 110",
  },
  BIOE: {
    major: "BIOE",
    title: "Bioengineering",
    college: "SOE",
    mathTrack: "calc-stem",
    isEngineering: true,
    lowerDiv: ["BIOE 10", "BIOE 21", "BIOE 22", "BIOL 1A", "CHEM 11"],
    upperDiv: ["BIOE 110", "BIOE 120", "BIOE 130", "BIOE 154", "BIOE 156"],
    capstone: "ENGR 110",
  },
  // CSE has hand-tuned plans below; keep recipe so /majors lists it
  CSE: {
    major: "CSE",
    title: "Computer Science & Engineering",
    college: "SOE",
    mathTrack: "calc-stem",
    isEngineering: true,
    lowerDiv: ["CSEN 10", "CSEN 11", "CSEN 12", "CSEN 19", "CSEN 20", "CSEN 21"],
    upperDiv: ["CSEN 79", "CSEN 122", "CSEN 140", "CSEN 146", "CSEN 161", "CSEN 174"],
    capstone: "ENGR 110",
  },

  // -------- Leavey School of Business --------
  ACTG: {
    major: "ACTG",
    title: "Accounting (B.S. Commerce)",
    college: "LSB",
    mathTrack: "calc-business",
    lowerDiv: ["BUSN 70", "OMIS 15", "ECON 1", "ECON 2", "ECON 3", "ACTG 11", "ACTG 12", "OMIS 40", "OMIS 41", "MGMT 71", "MGMT 72", "BUSN 85"],
    upperDiv: ["ACTG 130", "ACTG 131", "ACTG 132", "ACTG 134", "ACTG 135", "ACTG 138", "FNCE 121", "MGMT 160", "MKTG 181", "OMIS 108"],
    capstone: "MGMT 162",
  },
  FNCE: {
    major: "FNCE",
    title: "Finance (B.S. Commerce)",
    college: "LSB",
    mathTrack: "calc-business",
    lowerDiv: [],
    upperDiv: ["FNCE 121", "FNCE 124", "FNCE 134", "FNCE 137", "FNCE 138", "FNCE 142", "MGMT 160", "MKTG 181", "OMIS 108"],
    capstone: "MGMT 162",
  },
  MGMT: {
    major: "MGMT",
    title: "Management (B.S. Commerce)",
    college: "LSB",
    mathTrack: "calc-business",
    lowerDiv: [],
    upperDiv: ["MGMT 160", "MGMT 161", "MGMT 164", "MGMT 168", "FNCE 121", "MKTG 181", "OMIS 108"],
    capstone: "MGMT 162",
  },
  MKTG: {
    major: "MKTG",
    title: "Marketing (B.S. Commerce)",
    college: "LSB",
    mathTrack: "calc-business",
    lowerDiv: [],
    upperDiv: ["MKTG 181", "MKTG 182", "MKTG 184", "MKTG 187", "FNCE 121", "MGMT 160", "OMIS 108"],
    capstone: "MGMT 162",
  },
  OMIS: {
    major: "OMIS",
    title: "Management Information Systems (B.S. Commerce)",
    college: "LSB",
    mathTrack: "calc-business",
    lowerDiv: ["OMIS 30", "OMIS 31"],
    upperDiv: ["OMIS 105", "OMIS 108", "OMIS 109", "OMIS 111", "OMIS 113", "OMIS 114", "FNCE 121", "MGMT 160", "MKTG 181"],
    capstone: "MGMT 162",
  },
  AIS: {
    major: "AIS",
    title: "Accounting Information Systems (B.S. Commerce)",
    college: "LSB",
    mathTrack: "calc-business",
    lowerDiv: ["ACTG 11", "ACTG 12", "OMIS 30", "OMIS 31"],
    upperDiv: ["ACTG 130", "ACTG 131", "ACTG 132", "ACTG 134", "ACTG 138", "OMIS 105", "OMIS 108", "OMIS 111", "FNCE 121", "MGMT 160", "MKTG 181"],
    capstone: "MGMT 162",
    notes: ["Joint Accounting + MIS major — combines ACTG financial/managerial sequence with OMIS systems & analytics core."],
  },
  BANL: {
    major: "BANL",
    title: "Business Analytics (B.S. Commerce)",
    college: "LSB",
    mathTrack: "calc-business",
    lowerDiv: [],
    upperDiv: ["OMIS 105", "OMIS 106", "OMIS 107", "OMIS 108", "OMIS 109", "FNCE 121", "MGMT 160", "MKTG 181"],
    capstone: "MGMT 162",
  },
  ECON: {
    major: "ECON",
    title: "Economics (B.S. Commerce)",
    college: "LSB",
    mathTrack: "calc-business",
    lowerDiv: ["ECON 41", "ECON 42"],
    upperDiv: ["ECON 113", "ECON 115", "ECON 117", "ECON 118", "FNCE 121", "MGMT 160", "MKTG 181", "OMIS 108"],
    capstone: "MGMT 162",
  },

  // -------- College of Arts & Sciences: STEM --------
  BIOL: {
    major: "BIOL",
    title: "Biology",
    college: "CAS",
    mathTrack: "calc-life",
    lowerDiv: ["BIOL 1A", "BIOL 1B", "BIOL 1C", "CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "PHYS 11", "PHYS 12"],
    upperDiv: ["BIOL 172", "BIOL 174", "BIOL 178", "BIOL 180", "BIOL 184", "BIOL 188"],
  },
  CHEM: {
    major: "CHEM",
    title: "Chemistry",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33", "CHEM 50", "PHYS 31", "PHYS 32"],
    upperDiv: ["CHEM 111", "CHEM 112", "CHEM 113", "CHEM 124", "CHEM 132"],
  },
  PHYS: {
    major: "PHYS",
    title: "Physics",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["PHYS 31", "PHYS 32", "PHYS 33", "PHYS 70", "MATH 22"],
    upperDiv: ["PHYS 111", "PHYS 112", "PHYS 113", "PHYS 121", "PHYS 122", "PHYS 131"],
  },
  MATH: {
    major: "MATH",
    title: "Mathematics",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["MATH 11", "MATH 12", "MATH 13", "MATH 14", "MATH 22", "MATH 53"],
    upperDiv: ["MATH 100", "MATH 101", "MATH 111", "MATH 122", "MATH 153"],
  },
  AMTH: {
    major: "AMTH",
    title: "Applied Mathematics",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["MATH 11", "MATH 12", "MATH 13", "MATH 14", "MATH 22", "MATH 53"],
    upperDiv: ["MATH 122", "MATH 141", "MATH 144", "MATH 155", "MATH 166"],
  },
  CSCI: {
    major: "CSCI",
    title: "Computer Science (B.S. Arts & Sciences)",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["CSCI 10", "CSCI 60", "CSCI 61", "CSCI 62", "MATH 11", "MATH 12", "MATH 13"],
    upperDiv: ["CSCI 161", "CSCI 163", "CSCI 169", "CSCI 183"],
  },
  PSYC: {
    major: "PSYC",
    title: "Psychology",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["PSYC 1", "PSYC 51", "PSYC 51L"],
    upperDiv: ["PSYC 100", "PSYC 110", "PSYC 120", "PSYC 132", "PSYC 145", "PSYC 178"],
  },
  NEUR: {
    major: "NEUR",
    title: "Neuroscience",
    college: "CAS",
    mathTrack: "calc-life",
    lowerDiv: ["BIOL 1A", "BIOL 1B", "BIOL 1C", "CHEM 11", "CHEM 12", "PSYC 1", "PSYC 51"],
    upperDiv: ["NEUR 100", "BIOL 174", "PSYC 145", "PSYC 178"],
  },
  PHSC: {
    major: "PHSC",
    title: "Public Health Science",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["PHSC 1", "BIOL 1A", "BIOL 1B", "CHEM 11", "CHEM 12", "PSYC 1"],
    upperDiv: ["PHSC 101", "PHSC 102", "PHSC 110", "PHSC 120", "PHSC 130"],
  },
  ENVS: {
    major: "ENVS",
    title: "Environmental Studies",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["ENVS 21", "ENVS 22", "ENVS 23", "BIOL 1A", "CHEM 11"],
    upperDiv: ["ENVS 110", "ENVS 121", "ENVS 137", "ENVS 145", "ENVS 156"],
  },

  // -------- CAS: Social Sciences & Humanities --------
  COMM: {
    major: "COMM",
    title: "Communication",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["COMM 12", "COMM 20", "COMM 30"],
    upperDiv: ["COMM 100", "COMM 105", "COMM 110", "COMM 130", "COMM 132", "COMM 140"],
  },
  ENGL: {
    major: "ENGL",
    title: "English",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["ENGL 70", "ENGL 71"],
    upperDiv: ["ENGL 101", "ENGL 113", "ENGL 119", "ENGL 137", "ENGL 174", "ENGL 191"],
  },
  HIST: {
    major: "HIST",
    title: "History",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["HIST 11A", "HIST 11B", "HIST 12A", "HIST 51", "HIST 60"],
    upperDiv: ["HIST 100W", "HIST 117", "HIST 119", "HIST 122", "HIST 127", "HIST 199"],
  },
  POLI: {
    major: "POLI",
    title: "Political Science",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["POLI 1", "POLI 2", "POLI 3", "POLI 51"],
    upperDiv: ["POLI 110", "POLI 120", "POLI 138", "POLI 150", "POLI 199"],
  },
  ECON_CAS: {
    major: "ECON_CAS",
    title: "Economics (B.A. Arts & Sciences)",
    college: "CAS",
    mathTrack: "calc-business",
    lowerDiv: ["ECON 1", "ECON 2", "ECON 3", "ECON 41", "ECON 42"],
    upperDiv: ["ECON 113", "ECON 115", "ECON 117", "ECON 118", "ECON 137"],
  },
  SOCI: {
    major: "SOCI",
    title: "Sociology",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["SOCI 1", "SOCI 33", "SOCI 49", "SOCI 50"],
    upperDiv: ["SOCI 110", "SOCI 138", "SOCI 154", "SOCI 174", "SOCI 199"],
  },
  ANTH: {
    major: "ANTH",
    title: "Anthropology",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["ANTH 3", "ANTH 6", "ANTH 49", "ANTH 50"],
    upperDiv: ["ANTH 110", "ANTH 137", "ANTH 145", "ANTH 161", "ANTH 199"],
  },
  PHIL: {
    major: "PHIL",
    title: "Philosophy",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["PHIL 14", "PHIL 15", "PHIL 16", "PHIL 17", "PHIL 19"],
    upperDiv: ["PHIL 109", "PHIL 119", "PHIL 137", "PHIL 145", "PHIL 199"],
  },
  RSOC: {
    major: "RSOC",
    title: "Religious Studies",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["RSOC 4", "RSOC 7", "RSOC 9", "RSOC 14", "RSOC 19"],
    upperDiv: ["RSOC 110", "RSOC 130", "RSOC 145", "RSOC 161", "RSOC 199"],
  },
  ETHN: {
    major: "ETHN",
    title: "Ethnic Studies",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["ETHN 1", "ETHN 2", "ETHN 50"],
    upperDiv: ["ETHN 110", "ETHN 137", "ETHN 145", "ETHN 175", "ETHN 199"],
  },
  WGST: {
    major: "WGST",
    title: "Women's & Gender Studies",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["WGST 50", "WGST 51", "WGST 60"],
    upperDiv: ["WGST 110", "WGST 137", "WGST 145", "WGST 175", "WGST 199"],
  },
  CHST: {
    major: "CHST",
    title: "Child Studies",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["CHST 50", "CHST 51", "CHST 60", "PSYC 1", "PSYC 51"],
    upperDiv: ["CHST 110", "CHST 137", "CHST 145", "CHST 199"],
  },
  CLAS: {
    major: "CLAS",
    title: "Classics",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["CLAS 1", "CLAS 2", "CLAS 3", "CLAS 11", "CLAS 12"],
    upperDiv: ["CLAS 110", "CLAS 137", "CLAS 145", "CLAS 175", "CLAS 199"],
  },

  // -------- CAS: Arts --------
  ARTH: {
    major: "ARTH",
    title: "Art History",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["ARTH 11", "ARTH 12", "ARTH 21", "ARTH 22"],
    upperDiv: ["ARTH 110", "ARTH 137", "ARTH 145", "ARTH 175", "ARTH 199"],
  },
  ARTS: {
    major: "ARTS",
    title: "Studio Art",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["ARTS 30", "ARTS 31", "ARTS 50", "ARTS 75"],
    upperDiv: ["ARTS 110", "ARTS 137", "ARTS 145", "ARTS 175", "ARTS 196"],
  },
  MUSC: {
    major: "MUSC",
    title: "Music",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["MUSC 11", "MUSC 12", "MUSC 13", "MUSC 50"],
    upperDiv: ["MUSC 110", "MUSC 137", "MUSC 145", "MUSC 175", "MUSC 199"],
  },
  THTR: {
    major: "THTR",
    title: "Theatre",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["THTR 8", "THTR 30", "THTR 50", "THTR 60"],
    upperDiv: ["THTR 110", "THTR 137", "THTR 145", "THTR 175", "THTR 199"],
  },
  DANC: {
    major: "DANC",
    title: "Dance",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["DANC 4", "DANC 8", "DANC 50", "DANC 60"],
    upperDiv: ["DANC 110", "DANC 137", "DANC 145", "DANC 175", "DANC 199"],
  },

  // -------- CAS: Languages --------
  SPAN: {
    major: "SPAN",
    title: "Spanish Studies",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["SPAN 1", "SPAN 2", "SPAN 3", "SPAN 21A", "SPAN 21B"],
    upperDiv: ["SPAN 102", "SPAN 103", "SPAN 110", "SPAN 137", "SPAN 199"],
  },
  FREN: {
    major: "FREN",
    title: "French & Francophone Studies",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["FREN 1", "FREN 2", "FREN 3", "FREN 21A", "FREN 21B"],
    upperDiv: ["FREN 110", "FREN 137", "FREN 145", "FREN 175", "FREN 199"],
  },
  ITAL: {
    major: "ITAL",
    title: "Italian Studies",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["ITAL 1", "ITAL 2", "ITAL 3", "ITAL 21A", "ITAL 21B"],
    upperDiv: ["ITAL 110", "ITAL 137", "ITAL 175", "ITAL 199"],
  },
  CHIN: {
    major: "CHIN",
    title: "Chinese Studies",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["CHIN 1", "CHIN 2", "CHIN 3", "CHIN 21A", "CHIN 21B"],
    upperDiv: ["CHIN 105", "CHIN 125", "CHIN 127", "CHIN 199"],
  },
  JAPN: {
    major: "JAPN",
    title: "Japanese Studies",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["JAPN 1", "JAPN 2", "JAPN 3", "JAPN 21A", "JAPN 21B"],
    upperDiv: ["JAPN 110", "JAPN 137", "JAPN 175", "JAPN 199"],
  },
};

// ---------------------------------------------------------------------------
// CORE CURRICULUM SLOTS
// ---------------------------------------------------------------------------
// Generic course-code placeholders for SCU's University Core Curriculum.
// These appear in plans where the student picks from an approved list, so
// the planner just shows the slot name (e.g. "Core: Diversity") rather than
// a specific course code. Slots are spread across 12 quarters by the
// generator so students always have a Core item available.

type CoreSlot = string;
const CORE_CTW1: CoreSlot = "ENGL 1A";  // Critical Thinking & Writing 1
const CORE_CTW2: CoreSlot = "ENGL 1B";  // Critical Thinking & Writing 2
const CORE_CI1: CoreSlot = "HIST 11A";  // Cultures & Ideas 1
const CORE_CI2: CoreSlot = "HIST 11B";  // Cultures & Ideas 2
const CORE_CI3: CoreSlot = "Core: C&I 3";
const CORE_RTC1: CoreSlot = "RSOC 7";   // Religion, Theology & Culture 1
const CORE_RTC2: CoreSlot = "Core: RTC 2";
const CORE_RTC3: CoreSlot = "Core: RTC 3";
const CORE_ETHICS: CoreSlot = "PHIL 9"; // Ethics
const CORE_DIV: CoreSlot = "Core: Diversity";
const CORE_ARTS: CoreSlot = "Core: Arts";
const CORE_SS: CoreSlot = "Core: Social Science";
const CORE_NS: CoreSlot = "Core: Natural Science (lab)";
const CORE_STS: CoreSlot = "Core: Sci, Tech & Society";
const CORE_ELSJ: CoreSlot = "Core: ELSJ";
const CORE_ADVWR: CoreSlot = "ENGL 2";  // Advanced Writing
const CORE_PATH: CoreSlot = "Core: Pathway";
const CORE_CIV: CoreSlot = "Core: Civic Engagement";

// LSB curriculum substitutions
const LSB_ETHICS: CoreSlot = "MGMT 6";          // satisfies Ethics
const LSB_CIVIC: CoreSlot = "MGMT 162";          // satisfies Civic Engagement (capstone)
const LSB_STS: CoreSlot = "OMIS 34";              // satisfies STS
const LSB_SS: CoreSlot = "ECON 1";                // satisfies Social Science
const LSB_ADVWR: CoreSlot = "BUSN 179";          // Advanced Writing

// SOE curriculum: typically uses general Core slots + ENGR 1 series.

// Foreign-language sequence for CAS (3 quarters at intro level)
const LANG_1: CoreSlot = "Core: Foreign Lang 1";
const LANG_2: CoreSlot = "Core: Foreign Lang 2";
const LANG_3: CoreSlot = "Core: Foreign Lang 3";

// ---------------------------------------------------------------------------
// PLAN GENERATOR
// ---------------------------------------------------------------------------

function mathSequenceFor(track: MajorRecipe["mathTrack"]): string[] {
  switch (track) {
    case "calc-stem":
      return ["MATH 11", "MATH 12", "MATH 13", "MATH 14"];
    case "calc-business":
      return ["MATH 30", "MATH 31"];
    case "calc-life":
      return ["MATH 35", "MATH 36"];
    case "stats":
      return ["MATH 8"];
    case "any":
    default:
      return [];
  }
}

// Estimate units: most courses are 4-5 units; assume 4u as the default.
// Engineering math/physics/CSEN use 4u; ENGR 1 = 1u; capstone (ENGR 110) = 2u.
function estimateUnits(c: string): number {
  if (c === "ENGR 1" || c === "ENGR 2" || c === "ENGR 10") return 1;
  if (c === "ENGR 110") return 2;
  if (c === "BUSN 70" || c === "BUSN 170" || c === "BUSN 179" || c === "MGMT 162") return 5;
  if (c === "MATH 11" || c === "MATH 12" || c === "MATH 13" || c === "MATH 14" || c === "MATH 22" || c === "MATH 53") return 4;
  if (
    c.startsWith("ECON ") ||
    c.startsWith("MGMT ") ||
    c.startsWith("MKTG ") ||
    c.startsWith("FNCE ") ||
    c.startsWith("OMIS ") ||
    c.startsWith("ACTG ")
  ) return 5;
  return 4;
}

function makeQuarter(
  year: number,
  term: Term,
  courses: string[],
  notes?: string,
): GraduationPathQuarterEntry {
  const termTitle = term[0].toUpperCase() + term.slice(1);
  const plannedUnits = courses.reduce((acc, c) => acc + estimateUnits(c), 0);
  return {
    year,
    term,
    label: `Y${year} ${termTitle}`,
    courses,
    plannedUnits,
    ...(notes ? { notes } : {}),
  };
}

function generateFourYear(recipe: MajorRecipe): GraduationPathEntry {
  const { college, mathTrack, lowerDiv, upperDiv, capstone, isEngineering } = recipe;
  const math = mathSequenceFor(mathTrack);

  // Build per-college Year-1 & Year-2 templates.
  const quarters: GraduationPathQuarterEntry[] = [];

  if (college === "SOE" || isEngineering) {
    // SOE: heavy math + physics + ENGR 1 + early major. Core slots are NEVER
    // overwritten by lower-div courses; if the major's lower-div list is
    // longer than the major slots provided here, the overflow is appended to
    // year 3 quarters as additional electives.
    const ld = [...lowerDiv]; const nextLd = () => ld.shift();
    quarters.push(makeQuarter(1, "fall",   ["ENGR 1", math[0] || "MATH 11", CORE_CTW1, CORE_CI1]));
    quarters.push(makeQuarter(1, "winter", [math[1] || "MATH 12", "PHYS 31", CORE_CTW2, CORE_CI2, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(1, "spring", [math[2] || "MATH 13", "PHYS 32", CORE_CI3, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(2, "fall",   [math[3] || "MATH 14", "PHYS 33", CORE_RTC1, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(2, "winter", ["MATH 22", CORE_RTC2, CORE_DIV, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(2, "spring", ["MATH 53", CORE_ETHICS, CORE_SS, CORE_ARTS, nextLd()].filter(Boolean) as string[]));
    const ud = [...upperDiv]; const nu = () => ud.shift();
    const overflow = () => nextLd();
    quarters.push(makeQuarter(3, "fall",   [nu(), nu(), CORE_ADVWR, overflow()].filter(Boolean) as string[], "Internship search quarter."));
    quarters.push(makeQuarter(3, "winter", [nu(), nu(), CORE_RTC3, CORE_ELSJ, overflow()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(3, "spring", [nu(), nu(), CORE_PATH, CORE_CIV, overflow()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(4, "fall",   [capstone || "ENGR 110", nu(), CORE_PATH].filter(Boolean) as string[]));
    quarters.push(makeQuarter(4, "winter", [nu(), CORE_PATH].filter(Boolean) as string[], "Senior design continuation + technical electives."));
    quarters.push(makeQuarter(4, "spring", [nu(), CORE_PATH].filter(Boolean) as string[], "Senior design continuation + technical electives."));
  } else if (college === "LSB") {
    // LSB Common Curriculum dictates a fixed lower-div sequence.
    quarters.push(makeQuarter(1, "fall",   ["BUSN 70", "ECON 1", CORE_CTW1, math[0] || "MATH 30"]));
    quarters.push(makeQuarter(1, "winter", ["OMIS 15", "ECON 2", CORE_CTW2, math[1] || "MATH 31"]));
    quarters.push(makeQuarter(1, "spring", ["MGMT 71", "ECON 3", CORE_CI1, CORE_RTC1]));
    quarters.push(makeQuarter(2, "fall",   ["ACTG 11", "MGMT 72", CORE_CI2, CORE_RTC2]));
    quarters.push(makeQuarter(2, "winter", ["ACTG 12", "OMIS 40", CORE_CI3, LSB_STS]));
    quarters.push(makeQuarter(2, "spring", ["OMIS 41", "BUSN 85", LSB_ETHICS, CORE_DIV]));
    // Year 3-4: upper-div Common Core + major upper-div + remaining Core
    const ud = [...upperDiv]; const nu = () => ud.shift();
    quarters.push(makeQuarter(3, "fall",   [nu() || "FNCE 121", nu() || "MGMT 160", CORE_RTC3, CORE_ARTS]));
    quarters.push(makeQuarter(3, "winter", [nu() || "MKTG 181", nu() || "OMIS 108", LSB_ADVWR, CORE_NS]));
    quarters.push(makeQuarter(3, "spring", [nu(), nu(), CORE_ELSJ, CORE_PATH].filter(Boolean) as string[]));
    quarters.push(makeQuarter(4, "fall",   [nu(), nu(), CORE_PATH].filter(Boolean) as string[]));
    quarters.push(makeQuarter(4, "winter", [nu(), nu(), CORE_PATH].filter(Boolean) as string[]));
    quarters.push(makeQuarter(4, "spring", [capstone || "MGMT 162", nu(), CORE_PATH].filter(Boolean) as string[], "Senior capstone."));
  } else {
    // CAS — language sequence + math + lab science + major. Core slots are
    // never overwritten; lower-div majors slot in alongside the core.
    const ld = [...lowerDiv]; const nextLd = () => ld.shift();
    const mathQ = math[0] || "MATH 8";
    quarters.push(makeQuarter(1, "fall",   [CORE_CTW1, LANG_1, mathQ, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(1, "winter", [CORE_CTW2, LANG_2, math[1] || CORE_NS, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(1, "spring", [CORE_CI1, LANG_3, CORE_ARTS, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(2, "fall",   [CORE_CI2, CORE_RTC1, CORE_DIV, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(2, "winter", [CORE_CI3, CORE_RTC2, CORE_ETHICS, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(2, "spring", [CORE_RTC3, CORE_SS, CORE_STS, nextLd()].filter(Boolean) as string[]));
    const ud = [...upperDiv]; const nu = () => ud.shift();
    const overflow = () => nextLd();
    quarters.push(makeQuarter(3, "fall",   [nu(), nu(), CORE_ADVWR, CORE_ELSJ, overflow()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(3, "winter", [nu(), nu(), CORE_CIV, CORE_PATH, overflow()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(3, "spring", [nu(), nu(), CORE_PATH, overflow()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(4, "fall",   [nu(), nu(), CORE_PATH].filter(Boolean) as string[]));
    quarters.push(makeQuarter(4, "winter", [nu(), CORE_PATH].filter(Boolean) as string[]));
    quarters.push(makeQuarter(4, "spring", [capstone || nu() || "Major Capstone / Thesis", CORE_PATH].filter(Boolean) as string[], "Senior thesis or capstone seminar."));
  }

  // Dedupe across the entire plan, preserving the first occurrence. The
  // "Core: Pathway" placeholder is intentionally repeated (4-course Pathway
  // sequence) so it is exempt from cross-quarter dedupe.
  const seenAll = new Set<string>();
  for (const q of quarters) {
    q.courses = q.courses.filter((c) => {
      if (c === "Core: Pathway") return true;
      if (seenAll.has(c)) return false;
      seenAll.add(c);
      return true;
    });
    q.plannedUnits = q.courses.reduce((acc, c) => acc + estimateUnits(c), 0);
  }

  const totalUnits = quarters.reduce((s, q) => s + q.plannedUnits, 0);
  const avg = totalUnits / quarters.length;

  const collegeNote =
    college === "SOE"
      ? "Engineering majors carry a heavy math + physics core in years 1-2 and a senior design (ENGR 110) capstone."
      : college === "LSB"
        ? "Business majors share the LSB Common Curriculum (BUSN 70, ECON 1-3, MGMT 71/72, ACTG 11/12, OMIS 40/41, BUSN 85) before specializing."
        : "Arts & Sciences majors take a 3-quarter foreign language sequence and choose specific Core options each quarter.";

  return {
    type: "four_year",
    major: recipe.major,
    title: `${recipe.title} — Standard 4-Year Path`,
    summary: `Standard 12-quarter (4-year) plan, ~${avg.toFixed(1)} units/quarter average. Combines SCU's University Core Curriculum with the ${recipe.title} major requirements.`,
    feasibilityNote:
      `Recommended default. Within standard cap (20 units freshman/soph, 22 units junior/senior). ${collegeNote} Core slots labeled "Core: ..." indicate areas where you choose from a list of approved courses; consult the bulletin and your advisor for the latest approved list.`,
    averageUnitsPerQuarter: Math.round(avg * 10) / 10,
    requiresOverload: avg > 18,
    quarters,
    risks: [
      "This plan is generated from a recipe — confirm the exact major requirements with your faculty advisor and the SCU 2025-26 bulletin.",
      college === "SOE"
        ? "Engineering courses are often offered only one quarter per year — a single failed prerequisite can push graduation by a year."
        : college === "LSB"
          ? "BUSN 70 must be completed in your first year. ACTG 11 is locked to second-year fall/winter."
          : "Foreign language requirement (3 quarters of intro sequence) cannot be skipped without an AP/IB score of 4+ or a department proficiency exam.",
      "Pathway requires 16 units (~4 courses) on a single theme — pick early to maximize Core overlap.",
    ],
  };
}

function generateThreeYear(recipe: MajorRecipe): GraduationPathEntry {
  const four = generateFourYear(recipe);
  // Compress: take all real courses from the 4-year plan and pack into 9 quarters.
  // Drop "Core: Pathway" placeholder duplicates and assume AP/transfer credit covers
  // 1-2 quarters of Core on entry.
  const allCourses = four.quarters.flatMap((q) => q.courses)
    .filter((c) => c !== "Core: Pathway"); // Pathway can finish in summer or post-AP
  const perQuarter = Math.ceil(allCourses.length / 9);
  const quarters: GraduationPathQuarterEntry[] = [];
  let i = 0;
  for (let y = 1; y <= 3; y++) {
    for (const t of ["fall", "winter", "spring"] as const) {
      const slice = allCourses.slice(i, i + perQuarter);
      i += perQuarter;
      quarters.push(makeQuarter(y, t, slice, slice.length > 4 ? "Overload — requires GPA ≥ 3.0 and dean approval." : undefined));
    }
  }
  const totalUnits = quarters.reduce((s, q) => s + q.plannedUnits, 0);
  const avg = totalUnits / quarters.length;
  return {
    type: "three_year",
    major: recipe.major,
    title: `${recipe.title} — Aggressive 3-Year Path`,
    summary: `Compressed 9-quarter plan averaging ~${avg.toFixed(1)} units/quarter. Requires significant AP/transfer credit on entry and overload approval most quarters.`,
    feasibilityNote:
      "AGGRESSIVE. Requires GPA ≥ 3.0 + priority registration + dean approval to overload past the standard 20/22 unit caps. AP/transfer credit is essentially required to make this feasible.",
    averageUnitsPerQuarter: Math.round(avg * 10) / 10,
    requiresOverload: true,
    quarters,
    risks: [
      "Multiple quarters at 20+ units of demanding coursework.",
      "Overload approval is per-quarter — losing it once breaks the schedule.",
      "Dropping a single class still leaves you over the standard cap.",
      "No room for failure: a single C- prereq miss costs at least one summer.",
      recipe.college === "SOE"
        ? "Senior design (ENGR 110) is fall-only — can't slip past it."
        : recipe.college === "LSB"
          ? "BUSN 70 + ECON 1 + ACTG 11 can't all be moved earlier than first/second year."
          : "Foreign language sequence is 3 sequential quarters — no way to compress without proficiency.",
    ],
  };
}

// ---------------------------------------------------------------------------
// Hand-tuned CSE plans (kept from the original — they're well-documented and
// already in production, so we don't regenerate them).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAvailableMajors(): {
  code: string;
  title: string;
  college: College;
}[] {
  return Object.values(MAJOR_RECIPES).map((r) => ({
    code: r.major,
    title: r.title,
    college: r.college,
  }));
}

export function getGraduationPath(
  type: PathType,
  major = "CSE",
  completedCourseCodes: string[] = [],
): GraduationPathEntry {
  // Normalize legacy COEN code to current CSEN/CSE.
  const normalizedMajor = major === "COEN" ? "CSE" : major;
  // Hand-tuned CSE plans take precedence (well-documented, in production).
  let base: GraduationPathEntry;
  if (normalizedMajor === "CSE") {
    base = type === "three_year" ? THREE_YEAR_CSE : FOUR_YEAR_CSE;
  } else {
    const recipe = MAJOR_RECIPES[normalizedMajor];
    if (!recipe) {
      base = type === "three_year" ? THREE_YEAR_CSE : FOUR_YEAR_CSE;
    } else {
      base = type === "three_year"
        ? generateThreeYear(recipe)
        : generateFourYear(recipe);
    }
  }

  // Strip already-completed courses from the per-quarter plan so the
  // student sees only what they still need. Core slot placeholders
  // (e.g. "Core: Arts") are never auto-stripped — students mark Core
  // satisfaction explicitly.
  if (completedCourseCodes.length === 0) return base;
  const completed = new Set(
    completedCourseCodes.map((c) => c.trim().toUpperCase().replace(/\s+/g, " ")),
  );
  const isCorePlaceholder = (c: string) =>
    c.startsWith("Core:") || c === "Core: Pathway";
  const quarters = base.quarters.map((q) => {
    const remaining = q.courses.filter(
      (c) => isCorePlaceholder(c) || !completed.has(c.toUpperCase().replace(/\s+/g, " ")),
    );
    const removed = q.courses.length - remaining.length;
    const plannedUnits = remaining.reduce((acc, c) => acc + estimateUnits(c), 0);
    const noteParts: string[] = [];
    if (q.notes) noteParts.push(q.notes);
    if (removed > 0)
      noteParts.push(
        `${removed} course${removed === 1 ? "" : "s"} hidden — already completed.`,
      );
    return {
      ...q,
      courses: remaining,
      plannedUnits,
      ...(noteParts.length ? { notes: noteParts.join(" ") } : {}),
    };
  });
  const totalUnits = quarters.reduce((s, q) => s + q.plannedUnits, 0);
  const avg = quarters.length ? totalUnits / quarters.length : 0;
  return {
    ...base,
    quarters,
    averageUnitsPerQuarter: Math.round(avg * 10) / 10,
    summary: `${base.summary} Adjusted for ${completed.size} course${completed.size === 1 ? "" : "s"} you've already completed.`,
  };
}

// ---------------------------------------------------------------------------
// Major Requirements (full course list with titles + descriptions)
// ---------------------------------------------------------------------------

export interface MajorRequirementCourse {
  code: string;
  title: string;
  units: number;
  description: string;
  completed: boolean;
  category: "lower-division" | "upper-division" | "capstone";
}

export interface MajorRequirements {
  major: string;
  title: string;
  college: College;
  mathTrack: string;
  notes: string[];
  totalListed: number;
  completedCount: number;
  groups: {
    label: string;
    courses: MajorRequirementCourse[];
  }[];
}

export function getMajorRequirements(
  major: string,
  completedCourseCodes: string[],
  catalogLookup: (code: string) => { code: string; title: string; units: number; description: string } | undefined,
): MajorRequirements | null {
  const normalizedMajor = major === "COEN" ? "CSE" : major;
  const recipe = MAJOR_RECIPES[normalizedMajor];
  if (!recipe) return null;
  const completed = new Set(
    completedCourseCodes.map((c) => c.trim().toUpperCase().replace(/\s+/g, " ")),
  );
  const isDone = (code: string) =>
    completed.has(code.toUpperCase().replace(/\s+/g, " "));
  const buildEntry = (
    code: string,
    category: MajorRequirementCourse["category"],
  ): MajorRequirementCourse => {
    const found = catalogLookup(code);
    return {
      code,
      title: found?.title ?? code,
      units: found?.units ?? 4,
      description:
        found?.description ??
        "Course details not in current catalog snapshot — verify in the SCU 2025-26 Bulletin.",
      completed: isDone(code),
      category,
    };
  };
  const math = mathSequenceFor(recipe.mathTrack);
  const groups: MajorRequirements["groups"] = [];
  if (math.length > 0) {
    groups.push({
      label: "Math sequence",
      courses: math.map((c) => buildEntry(c, "lower-division")),
    });
  }
  if (recipe.lowerDiv.length > 0) {
    groups.push({
      label: "Lower-division major requirements",
      courses: recipe.lowerDiv.map((c) => buildEntry(c, "lower-division")),
    });
  }
  if (recipe.upperDiv.length > 0) {
    groups.push({
      label: "Upper-division major requirements",
      courses: recipe.upperDiv.map((c) => buildEntry(c, "upper-division")),
    });
  }
  if (recipe.capstone) {
    groups.push({
      label: "Capstone",
      courses: [buildEntry(recipe.capstone, "capstone")],
    });
  }
  const all = groups.flatMap((g) => g.courses);
  return {
    major: recipe.major,
    title: recipe.title,
    college: recipe.college,
    mathTrack: recipe.mathTrack,
    notes: recipe.notes ?? [],
    totalListed: all.length,
    completedCount: all.filter((c) => c.completed).length,
    groups,
  };
}
