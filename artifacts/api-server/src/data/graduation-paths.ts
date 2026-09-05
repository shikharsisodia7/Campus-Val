import type { Term } from "./courses";

export type PathType = "three_year" | "four_year";
export type College = "SOE" | "LSB" | "CAS";

/**
 * How much trust a four-year sequence deserves:
 * - "prescribed": reconciled course-by-course against an official SCU
 *   four-year plan and eligible for the "Load Engineering Four-Year Plan"
 *   preload action.
 * - "recommended": an official SCU source exists (linked in `provenance`)
 *   but CampusVal's generated sequence hasn't been reconciled against it
 *   line-by-line yet — shown for reference, never preloadable.
 * - "example": no major-specific official source; a generic recipe
 *   template, shown as an illustration only.
 * Only ever set on four-year plans — the aggressive three-year compression
 * is always illustrative and never eligible for preload.
 */
export type SequenceTrust = "prescribed" | "recommended" | "example";

export interface GraduationPathProvenance {
  sourceUrl?: string;
  sourceLabel?: string;
  catalogYear?: string;
  lastVerified?: string; // ISO date CampusVal last checked this against the source
  verificationNote: string;
}

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
  sequenceTrust: SequenceTrust;
  provenance: GraduationPathProvenance;
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
  // When true, the 3-quarter foreign-language sequence is NOT required.
  // Defaults to true for SOE/LSB and B.S. CAS majors (calc-stem/calc-life).
  noLanguage?: boolean;
  // Official SCU concentrations/tracks/emphases within this major that
  // affect requirements (Part 9.4). Metadata only — deliberately no
  // per-concentration course list, since that would need the same
  // Bulletin-page-by-page verification discipline as a full major, done
  // here only for the major's own lowerDiv/upperDiv. Point students at the
  // sourceUrl for the exact concentration requirements. See
  // docs/SCU_PROGRAM_CATALOG.md.
  concentrations?: MajorConcentration[];
}

interface MajorConcentration {
  title: string;
  sourceUrl: string;
  notes?: string;
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
    concentrations: [
      { title: "Biomolecular track", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/bioengineering.html" },
      { title: "Medical-device track", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/bioengineering.html" },
      { title: "Pre-med track", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/bioengineering.html" },
    ],
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
    concentrations: [
      { title: "Concentration in Data Analysis for Economics", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/economics.html" },
      { title: "Mathematical Economics Concentration", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/economics.html" },
    ],
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
    // Was CHEM 111/112/113/124/132 — CHEM 113 and CHEM 124 do not exist in
    // the current SCU Bulletin (confirmed against the live Chemistry and
    // Biochemistry bulletin page); replaced with the B.S. Chemistry core
    // ("CHEM 102, 111, 141, 151, 152, 154" plus electives).
    upperDiv: ["CHEM 102", "CHEM 111", "CHEM 141", "CHEM 151", "CHEM 152", "CHEM 154"],
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
    concentrations: [
      { title: "Applied Mathematics Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
      { title: "Data Science Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
      { title: "Financial Mathematics Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
      { title: "Mathematical Economics Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
      { title: "Mathematics Education Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
    ],
  },
  // Applied Mathematics is not a standalone SCU undergraduate major — the
  // Department of Applied Mathematics offers only graduate degrees; at the
  // undergraduate level it's an emphasis within the Mathematics major (see
  // the "Applied Mathematics Emphasis" concentration on MATH above).
  // Verified against the SCU Undergraduate Bulletin (Ch. 5, School of
  // Engineering, Applied Mathematics) and Graduate Engineering Bulletin
  // Ch. 7. Do not re-add an "AMTH" major entry without a bulletin citation
  // showing SCU created a standalone undergraduate major.
  CSCI: {
    major: "CSCI",
    title: "Computer Science (B.S. Arts & Sciences)",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["CSCI 10", "CSCI 60", "CSCI 61", "CSCI 62", "MATH 11", "MATH 12", "MATH 13"],
    upperDiv: ["CSCI 161", "CSCI 163", "CSCI 169", "CSCI 183"],
    concentrations: [
      { title: "Algorithms and Complexity Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
      { title: "Data Science Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
      { title: "Security Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
      { title: "Software Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html" },
    ],
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
    concentrations: [
      { title: "Health Science Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/public-health-sciences.html" },
      { title: "Health and Society Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/public-health-sciences.html" },
    ],
  },
  ENVS: {
    major: "ENVS",
    title: "Environmental Studies",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["ENVS 21", "ENVS 22", "ENVS 23", "BIOL 1A", "CHEM 11"],
    upperDiv: ["ENVS 110", "ENVS 121", "ENVS 137", "ENVS 145", "ENVS 156"],
  },
  // Added 2026-09-04: bulletin-confirmed majors not previously in the
  // catalog (see docs/SCU_PROGRAM_CATALOG.md for the full audit). No
  // official four-year-plan source was located for any of these, so they
  // default to sequenceTrust "example" via sequenceTrustFor() below, same
  // as every other major without an entry in SOE_RECOMMENDED_PROVENANCE.
  BCHM: {
    major: "BCHM",
    title: "Biochemistry",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33", "BIOL 1A", "BIOL 1B", "PHYS 31", "PHYS 32"],
    upperDiv: ["CHEM 111", "CHEM 112", "CHEM 133", "CHEM 132", "CHEM 150", "CHEM 152"],
  },
  BCHM_ACS: {
    major: "BCHM_ACS",
    title: "Biochemistry, ACS Certified",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33", "BIOL 1A", "BIOL 1B", "PHYS 31", "PHYS 32"],
    upperDiv: ["CHEM 111", "CHEM 112", "CHEM 133", "CHEM 132", "CHEM 150", "CHEM 152", "CHEM 154", "CHEM 155"],
    notes: ["ACS-certified variant of Biochemistry — additional lab/elective depth beyond the standard BS."],
  },
  CHEM_BA: {
    major: "CHEM_BA",
    title: "Chemistry (B.A.)",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33"],
    upperDiv: ["CHEM 111", "CHEM 112", "CHEM 130"],
    notes: ["B.A. track — lighter lab/elective load than the Chemistry B.S. (CHEM major code)."],
  },
  ENSC: {
    major: "ENSC",
    title: "Environmental Science",
    college: "CAS",
    mathTrack: "calc-life",
    lowerDiv: ["ENVS 21", "ENVS 22", "ENVS 23", "BIOL 1A", "BIOL 1B", "CHEM 11", "CHEM 12"],
    upperDiv: ["ENVS 116", "ENVS 117", "ENVS 120", "ENVS 141", "ENVS 143"],
    notes: ["Distinct science-track major from Environmental Studies (ENVS) — more lab science, less policy/social science."],
  },
  WDE: {
    major: "WDE",
    title: "Web Design and Engineering",
    college: "SOE",
    mathTrack: "calc-stem",
    isEngineering: true,
    lowerDiv: ["CSEN 10", "CSEN 11", "CSEN 12", "CSEN 20"],
    upperDiv: ["CSEN 122", "CSEN 140", "CSEN 146", "CSEN 161", "CSEN 174"],
    capstone: "ENGR 110",
  },
  EE: {
    major: "EE",
    title: "Electrical Engineering",
    college: "SOE",
    mathTrack: "calc-stem",
    isEngineering: true,
    lowerDiv: ["ECEN 20", "ECEN 21", "ECEN 50", "ECEN 100"],
    upperDiv: ["ECEN 116", "ECEN 117", "ECEN 130", "ECEN 131", "ECEN 141", "ECEN 151"],
    capstone: "ENGR 110",
    notes: ["Distinct major from Electrical & Computer Engineering (ECEN) — power/analog/RF-focused, less computer-systems coursework."],
  },
  GENR: {
    major: "GENR",
    title: "General Engineering",
    college: "SOE",
    mathTrack: "calc-stem",
    isEngineering: true,
    lowerDiv: ["ENGR 1", "ENGR 2", "ENGR 19", "ENGR 35", "ENGR 40"],
    upperDiv: ["ENGR 161", "ENGR 163", "ENGR 170", "ENGR 180"],
    capstone: "ENGR 110",
  },
  ENGPHYS: {
    major: "ENGPHYS",
    title: "Engineering Physics",
    college: "CAS",
    mathTrack: "calc-stem",
    lowerDiv: ["PHYS 31", "PHYS 32", "PHYS 33", "PHYS 70", "MATH 53"],
    upperDiv: ["PHYS 111", "PHYS 112", "PHYS 113", "PHYS 121", "PHYS 141"],
    notes: ["Physics and Engineering Physics is a College of Arts and Sciences department, not School of Engineering, despite the name."],
  },

  // -------- CAS: Social Sciences & Humanities --------
  COMM: {
    major: "COMM",
    title: "Communication",
    college: "CAS",
    mathTrack: "stats",
    lowerDiv: ["COMM 12", "COMM 20", "COMM 30"],
    upperDiv: ["COMM 100", "COMM 105", "COMM 110", "COMM 130", "COMM 132", "COMM 140"],
    concentrations: [
      { title: "Global Media, Culture, and Technology", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/communication.html" },
      { title: "Organizational, Professional & Business Communication", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/communication.html" },
      { title: "Communication, Diversity, and Culture", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/communication.html" },
      { title: "Digital Filmmaking", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/communication.html" },
      { title: "Journalism", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/communication.html" },
      { title: "Strategic Communication", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/communication.html" },
    ],
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
    concentrations: [
      { title: "Pre-Law Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/political-science.html" },
      { title: "Public Sector Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/political-science.html" },
      { title: "International Relations Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/political-science.html" },
    ],
  },
  ECON_CAS: {
    major: "ECON_CAS",
    title: "Economics (B.A. Arts & Sciences)",
    college: "CAS",
    mathTrack: "calc-business",
    lowerDiv: ["ECON 1", "ECON 2", "ECON 3", "ECON 41", "ECON 42"],
    upperDiv: ["ECON 113", "ECON 115", "ECON 117", "ECON 118", "ECON 137"],
    concentrations: [
      { title: "Concentration in Data Analysis for Economics", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/economics.html" },
      { title: "Mathematical Economics Concentration", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/economics.html" },
    ],
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
    concentrations: [
      { title: "Applied Anthropology", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/anthropology.html" },
      { title: "Archaeology", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/anthropology.html" },
      { title: "Biological Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/anthropology.html" },
    ],
  },
  PHIL: {
    major: "PHIL",
    title: "Philosophy",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["PHIL 14", "PHIL 15", "PHIL 16", "PHIL 17", "PHIL 19"],
    upperDiv: ["PHIL 109", "PHIL 119", "PHIL 137", "PHIL 145", "PHIL 199"],
    concentrations: [
      { title: "Pre-Law and Justice", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/philosophy.html" },
      { title: "Ethics and Values", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/philosophy.html" },
      { title: "Science and Analysis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/philosophy.html" },
      { title: "History of Philosophy", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/philosophy.html" },
      { title: "International & Comparative Philosophy", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/philosophy.html" },
    ],
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
    concentrations: [
      { title: "Cultural Politics of Representation", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/gender-and-sexuality-studies.html" },
      { title: "Power, Rights, and Society", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/gender-and-sexuality-studies.html" },
      { title: "Sexualities, Body Politics, and Social Structures", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/gender-and-sexuality-studies.html" },
    ],
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
    concentrations: [
      { title: "Classical Languages and Literatures Track", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/classics-and-ancient-studies.html" },
      { title: "Classical Studies Track", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/classics-and-ancient-studies.html" },
      { title: "Ancient Studies Track", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/classics-and-ancient-studies.html" },
    ],
  },

  // -------- CAS: Arts --------
  ARTH: {
    major: "ARTH",
    title: "Art History",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["ARTH 11", "ARTH 12", "ARTH 21", "ARTH 22"],
    upperDiv: ["ARTH 110", "ARTH 137", "ARTH 145", "ARTH 175", "ARTH 199"],
    concentrations: [
      { title: "Arts Management Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/art-and-art-history.html" },
    ],
  },
  ARTS: {
    major: "ARTS",
    title: "Studio Art",
    college: "CAS",
    mathTrack: "any",
    lowerDiv: ["ARTS 30", "ARTS 31", "ARTS 50", "ARTS 75"],
    upperDiv: ["ARTS 110", "ARTS 137", "ARTS 145", "ARTS 175", "ARTS 196"],
    concentrations: [
      { title: "Graphic Design Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/art-and-art-history.html" },
      { title: "Animation and Illustration Emphasis", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/art-and-art-history.html" },
    ],
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
    concentrations: [
      { title: "Emphasis in Theatre", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/theatre-and-dance.html" },
      { title: "Emphasis in Dance", sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/theatre-and-dance.html" },
    ],
  },
  // Dance is not a standalone SCU undergraduate major — the bulletin shows
  // one Theatre Arts major (THTR) with a Dance emphasis inside it (see the
  // "Emphasis in Dance" concentration on THTR above). A standalone Dance
  // *minor* (DANC-MIN) does exist separately and is already represented.

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
  // Chinese Studies and Japanese Studies are not standalone SCU
  // undergraduate majors — the bulletin currently offers these only as
  // minors ("Chinese and Sinophone Studies" = CHIN-MIN, "Japanese Studies"
  // = JAPN-MIN), both represented in the minor catalog below.
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
  if (c === "ENGR 1" || c === "ENGR 1L" || c === "ENGR 2" || c === "ENGR 10") return 1;
  if (c === "ENGR 110" || c === "CSEN 194" || c === "CSEN 195" || c === "CSEN 196") return 2;
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

// Official SCU School of Engineering four-year plan sources found for the
// other SOE majors (found 2026-08-16). These are real, currently-published
// documents — but unlike CSE above, CampusVal's generated quarters for
// these majors have NOT been reconciled course-by-course against them, so
// they stay "recommended" (reference link only), not "prescribed"
// (preloadable). Reconciling each is future work.
const SOE_RECOMMENDED_PROVENANCE: Record<string, GraduationPathProvenance> = {
  ECEN: {
    sourceUrl: "https://www.scu.edu/media/school-of-engineering/pdfs/current-student-resources/undergraduate/2023-24-Four-Year-Plan-ECEN.pdf",
    sourceLabel: "SCU School of Engineering — Electrical & Computer Engineering 4-Year Plan",
    catalogYear: "2023-24",
    lastVerified: "2026-08-16",
    verificationNote:
      "Official plan found and linked, but CampusVal's generated quarters below have not yet been reconciled against it course-by-course. Not eligible for preload until verified.",
  },
  MECH: {
    sourceUrl: "https://www.scu.edu/media/school-of-engineering/pdfs/current-student-resources/undergraduate/2023-24-Four-Year-Plan-MECH.pdf",
    sourceLabel: "SCU School of Engineering — Mechanical Engineering 4-Year Plan",
    catalogYear: "2023-24",
    lastVerified: "2026-08-16",
    verificationNote:
      "Official plan found and linked, but CampusVal's generated quarters below have not yet been reconciled against it course-by-course. Not eligible for preload until verified.",
  },
  CENG: {
    sourceUrl: "https://www.scu.edu/media/school-of-engineering/pdfs/civil-engineering/CESE_4yearPlan_MATH11_2026.pdf",
    sourceLabel: "SCU School of Engineering — Civil, Environmental & Sustainable Engineering 4-Year Planning Guide (MATH 11 track)",
    catalogYear: "2026",
    lastVerified: "2026-08-16",
    verificationNote:
      "Official plan found and linked (a MATH 9 track also exists), but CampusVal's generated quarters below have not yet been reconciled against it course-by-course. Not eligible for preload until verified.",
  },
  BIOE: {
    sourceUrl: "https://www.scu.edu/media/school-of-engineering/pdfs/bioengineering/BIOE-4-Year-Plan_Biomolecular-track_2027-1.pdf",
    sourceLabel: "SCU School of Engineering — Bioengineering 4-Year Plan (Biomolecular track)",
    catalogYear: "2027",
    lastVerified: "2026-08-16",
    verificationNote:
      "Official plan found and linked (Medical Device and Pre-Med tracks also exist), but CampusVal's generated quarters below have not yet been reconciled against it course-by-course. Not eligible for preload until verified.",
  },
};

const GENERIC_NO_SOURCE_PROVENANCE: GraduationPathProvenance = {
  verificationNote:
    "Generated from a generic degree-structure template (Core Curriculum placement + major course lists), not sourced from a major-specific official SCU four-year plan. Treat as an illustration only — build your real plan in the Degree Plan workspace and confirm sequencing with your advisor.",
};

function sequenceTrustFor(recipe: MajorRecipe): {
  sequenceTrust: SequenceTrust;
  provenance: GraduationPathProvenance;
} {
  const soeProvenance = SOE_RECOMMENDED_PROVENANCE[recipe.major];
  if (soeProvenance) return { sequenceTrust: "recommended", provenance: soeProvenance };
  return { sequenceTrust: "example", provenance: GENERIC_NO_SOURCE_PROVENANCE };
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
    // B.S. degrees in CAS (calc-stem / calc-life) and any recipe with
    // noLanguage:true substitute Natural Science / Social Science / STS in
    // place of the 3-quarter foreign-language intro sequence.
    const skipLang = recipe.noLanguage || mathTrack === "calc-stem" || mathTrack === "calc-life";
    const lang1 = skipLang ? CORE_NS : LANG_1;
    const lang2 = skipLang ? CORE_SS : LANG_2;
    const lang3 = skipLang ? CORE_STS : LANG_3;
    quarters.push(makeQuarter(1, "fall",   [CORE_CTW1, lang1, mathQ, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(1, "winter", [CORE_CTW2, lang2, math[1] || CORE_NS, nextLd()].filter(Boolean) as string[]));
    quarters.push(makeQuarter(1, "spring", [CORE_CI1, lang3, CORE_ARTS, nextLd()].filter(Boolean) as string[]));
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

  const { sequenceTrust, provenance } = sequenceTrustFor(recipe);

  return {
    type: "four_year",
    major: recipe.major,
    title: `${recipe.title} — Standard 4-Year Path`,
    summary: `Standard 12-quarter (4-year) plan, ~${avg.toFixed(1)} units/quarter average. Combines SCU's University Core Curriculum with the ${recipe.title} major requirements.`,
    feasibilityNote:
      `Recommended default. Within standard cap (20 units freshman/soph, 22 units junior/senior). ${collegeNote} Core slots labeled "Core: ..." indicate areas where you choose from a list of approved courses; consult the bulletin and your advisor for the latest approved list.`,
    averageUnitsPerQuarter: Math.round(avg * 10) / 10,
    requiresOverload: avg > 18,
    sequenceTrust,
    provenance,
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
    // The aggressive 3-year compression is always illustrative — never
    // eligible for the prescribed-preload action, regardless of major.
    sequenceTrust: "example",
    provenance: EXAMPLE_ONLY_PROVENANCE,
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

const CSE_PROVENANCE: GraduationPathProvenance = {
  sourceUrl: "https://www.scu.edu/media/school-of-engineering/pdfs/CSECoursePlan-Standard.pdf",
  sourceLabel: "SCU School of Engineering — Sample 4-Year Course Plan for Computer Science & Engineering",
  catalogYear: "2023-24",
  lastVerified: "2026-08-16",
  verificationNote:
    "Reconciled course-by-course against the official PDF (last modified 1/16/2024). Two rows list an any-order elective choice across a multi-quarter span (Year 2's CSEN 20/ECEN 21/CSEN 79, and Year 3's CSEN 146/177/179) — this plan places each as noted below; confirm the exact term with your advisor.",
};

const FOUR_YEAR_CSE: GraduationPathEntry = {
  type: "four_year",
  major: "CSE",
  title: "Computer Science & Engineering — Standard 4-Year Path",
  summary:
    "Standard 12-quarter (4-year) plan following SCU's published sample sequence for Computer Science & Engineering.",
  feasibilityNote:
    "Matches SCU's published sample sequence. Confirm University Core area choices and elective ordering with your advisor before registering.",
  averageUnitsPerQuarter: 15.7,
  requiresOverload: false,
  sequenceTrust: "prescribed",
  provenance: CSE_PROVENANCE,
  risks: [
    "This plan follows SCU's published sample sequence, but \"University Core\" and elective slots require you to pick an approved course each time — verify current options in the SCU Bulletin.",
    "Senior Design (CSEN 194/195/196) runs across all three quarters of senior year — falling behind on any one course delays graduation.",
    "CSEN 20 / ECEN 21 / CSEN 79 and CSEN 146 / CSEN 177 / CSEN 179 are each an any-order set per SCU's plan; this schedule picks one placement, but your actual term may differ.",
  ],
  quarters: [
    { year: 1, term: "fall", label: "Y1 Fall", courses: ["Core: Critical Thinking & Writing 1", "MATH 11", "CHEM 11", "CSEN 10", "ENGR 1"], plannedUnits: 17 },
    { year: 1, term: "winter", label: "Y1 Winter", courses: ["Core: Critical Thinking & Writing 2", "MATH 12", "PHYS 31", "CSEN 11", "ENGR 1L"], plannedUnits: 17 },
    { year: 1, term: "spring", label: "Y1 Spring", courses: ["CSEN 19", "MATH 13", "PHYS 32", "CSEN 12"], plannedUnits: 16 },
    { year: 2, term: "fall", label: "Y2 Fall", courses: ["Core: Cultures & Ideas 1", "MATH 14", "PHYS 33"], plannedUnits: 12 },
    { year: 2, term: "winter", label: "Y2 Winter", courses: ["Core: Cultures & Ideas 2", "AMTH 106", "AMTH 108"], plannedUnits: 12 },
    {
      year: 2,
      term: "spring",
      label: "Y2 Spring",
      courses: ["Core: University Core (RTC 1 recommended, e.g. ENGR 16)", "MATH 53", "ECEN 50", "CSEN 20 or ECEN 21 or CSEN 79"],
      plannedUnits: 16,
      notes: "CSEN 20 / ECEN 21 / CSEN 79 can be taken any quarter in Year 2, not necessarily Spring — SCU's plan lists it as a merged, any-order requirement.",
    },
    {
      year: 3,
      term: "fall",
      label: "Y3 Fall",
      courses: ["Core: University Core (Ethics recommended, e.g. ENGR 19)", "CSEN 171", "Computer Engineering Elective", "CSEN 146"],
      plannedUnits: 16,
      notes: "CSEN 146 / CSEN 177 / CSEN 179 can be taken in any order across Year 3 — this plan places CSEN 146 in Fall.",
    },
    { year: 3, term: "winter", label: "Y3 Winter", courses: ["Core: University Core", "ECEN 153", "Computer Engineering Elective", "CSEN 177"], plannedUnits: 16 },
    { year: 3, term: "spring", label: "Y3 Spring", courses: ["Core: University Core", "ENGL 181", "Computer Engineering Elective", "CSEN 179"], plannedUnits: 16 },
    { year: 4, term: "fall", label: "Y4 Fall", courses: ["Core: University Core", "Educational Enrichment Elective", "CSEN 174", "CSEN 194"], plannedUnits: 14 },
    { year: 4, term: "winter", label: "Y4 Winter", courses: ["Core: University Core", "Educational Enrichment Elective", "CSEN 175", "CSEN 195"], plannedUnits: 14 },
    { year: 4, term: "spring", label: "Y4 Spring", courses: ["Educational Enrichment Elective", "Educational Enrichment Elective", "CSEN 122", "CSEN 196"], plannedUnits: 14 },
  ],
};

const EXAMPLE_ONLY_PROVENANCE: GraduationPathProvenance = {
  verificationNote:
    "Illustrative compression only — never eligible for preload. Not sourced from an official SCU document.",
};

const THREE_YEAR_CSE: GraduationPathEntry = {
  type: "three_year",
  major: "CSE",
  sequenceTrust: "example",
  provenance: EXAMPLE_ONLY_PROVENANCE,
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

/**
 * Majors with a real (non-"example") four-year plan: either preloadable
 * ("prescribed", reconciled course-by-course) or reference-only
 * ("recommended", an official SCU plan exists but isn't reconciled yet).
 * Never includes "example" (generated-template) majors — those aren't a
 * published departmental plan and must not be offered as one.
 */
export function getFourYearIndex(): {
  code: string;
  title: string;
  sequenceTrust: SequenceTrust;
}[] {
  return getAvailableMajors()
    .map((m) => {
      const path = getGraduationPath("four_year", m.code);
      return { code: m.code, title: m.title, sequenceTrust: path.sequenceTrust };
    })
    .filter((m) => m.sequenceTrust !== "example");
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
      // No curated plan exists for this major — never substitute another
      // major's schedule (that would show students a fabricated plan).
      // Return an explicit "not available" entry instead.
      return {
        type,
        major: normalizedMajor,
        title: `${normalizedMajor} — quarter-by-quarter plan not available yet`,
        summary:
          "A curated quarter-by-quarter plan hasn't been built for this major. See the Requirements view for the full official course list, and work with your advisor to sequence it.",
        feasibilityNote:
          "No quarter-by-quarter schedule is available for this major. Use the major requirements list plus your completed coursework to plan with your advisor.",
        averageUnitsPerQuarter: 0,
        requiresOverload: false,
        sequenceTrust: "example",
        provenance: {
          verificationNote: "No plan — nothing to preload for this major yet.",
        },
        quarters: [],
        risks: [],
      };
    }
    base = type === "three_year"
      ? generateThreeYear(recipe)
      : generateFourYear(recipe);
  }

  // We keep ALL courses visible in the plan and let the frontend mark
  // already-completed ones with a different style. Stripping them out
  // hides the structure of the major and confuses students about what
  // each quarter is supposed to look like. The summary call-out lets
  // the user know how many we matched.
  if (completedCourseCodes.length === 0) return base;
  const completed = new Set(
    completedCourseCodes.map((c) => c.trim().toUpperCase().replace(/\s+/g, " ")),
  );
  const matched = base.quarters.flatMap((q) => q.courses).filter((c) =>
    completed.has(c.toUpperCase().replace(/\s+/g, " ")),
  ).length;
  return {
    ...base,
    summary: `${base.summary} ${matched} course${matched === 1 ? "" : "s"} on this plan are already marked completed in your profile (shown struck-through).`,
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
  category: "lower-division" | "upper-division" | "capstone" | "business-core" | "university-core";
}

// ---------------------------------------------------------------------------
// LSB Common Curriculum (a.k.a. "Business Core") — required of every Leavey
// School of Business undergraduate, regardless of major. Source: SCU 2025-26
// Bulletin, Leavey School of Business, "Common Curriculum".
// ---------------------------------------------------------------------------
export const BUSINESS_CORE_CODES: readonly string[] = [
  "BUSN 70", "OMIS 15",
  "ECON 1", "ECON 2", "ECON 3",
  "ACTG 11", "ACTG 12",
  "OMIS 40", "OMIS 41",
  "MGMT 71", "MGMT 72",
  "BUSN 85",
];

// SCU University Core Curriculum requirement areas. These are not specific
// course codes — students pick any approved course from the area's list in
// the bulletin. We surface them as informational requirement entries so
// students see what they still owe outside their major.
const UNIVERSITY_CORE_AREAS: { label: string; description: string }[] = [
  { label: "Critical Thinking & Writing 1", description: "ENGL 1A or honors equivalent." },
  { label: "Critical Thinking & Writing 2", description: "ENGL 1B or honors equivalent." },
  { label: "Cultures & Ideas 1", description: "Typically HIST 11A or an approved C&I 1 course." },
  { label: "Cultures & Ideas 2", description: "Typically HIST 11B or an approved C&I 2 course." },
  { label: "Cultures & Ideas 3", description: "Pick any approved C&I 3 course." },
  { label: "Religion, Theology & Culture 1", description: "Approved RTC 1 (e.g. RSOC 7)." },
  { label: "Religion, Theology & Culture 2", description: "Approved RTC 2 course." },
  { label: "Religion, Theology & Culture 3", description: "Approved RTC 3 course." },
  { label: "Ethics", description: "Typically PHIL 9. Business majors fulfill via MGMT 6." },
  { label: "Diversity", description: "Pick any approved Diversity course." },
  { label: "Arts", description: "Pick any approved Arts course." },
  { label: "Social Science", description: "Pick any approved Social Science course (Business: ECON 1 fulfills)." },
  { label: "Natural Science (lab)", description: "1 lab science course (often satisfied by your major)." },
  { label: "Science, Technology & Society", description: "Pick an approved STS (Business: OMIS 34 fulfills)." },
  { label: "Civic Engagement", description: "Approved CE course (Business: MGMT 162 capstone fulfills)." },
  { label: "ELSJ", description: "Experiential Learning for Social Justice — community-based course." },
  { label: "Advanced Writing", description: "Typically ENGL 2 (Business: BUSN 179)." },
  { label: "Pathway", description: "4 themed courses tied together by a Pathway theme." },
  { label: "Foreign Language (3 quarters)", description: "B.A. only — 3-quarter intro sequence (waivable with AP/IB 4+ or proficiency exam)." },
];

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
  /** Official SCU concentrations/tracks/emphases within this major, if any (Part 9.4). */
  concentrations: MajorConcentration[];
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

  const missingFromCatalog: string[] = [];
  const buildEntry = (
    code: string,
    category: MajorRequirementCourse["category"],
  ): MajorRequirementCourse | null => {
    const found = catalogLookup(code);
    if (!found) {
      // Filter the placeholder courses out of the displayed list and surface
      // them in a single "not in catalog snapshot" note instead.
      missingFromCatalog.push(code);
      return null;
    }
    return {
      code,
      title: found.title,
      units: found.units,
      description: found.description,
      completed: isDone(code),
      category,
    };
  };
  const buildGroup = (
    label: string,
    codes: readonly string[],
    category: MajorRequirementCourse["category"],
  ) => {
    const courses = codes
      .map((c) => buildEntry(c, category))
      .filter((c): c is MajorRequirementCourse => c !== null);
    if (courses.length > 0) groups.push({ label, courses });
  };

  const math = mathSequenceFor(recipe.mathTrack);
  const groups: MajorRequirements["groups"] = [];
  if (math.length > 0) buildGroup("Math sequence", math, "lower-division");

  // For LSB majors, surface the Common Curriculum (Business Core) as its
  // own group separate from the major-specific lower division.
  if (recipe.college === "LSB") {
    buildGroup("Business Core (LSB Common Curriculum)", BUSINESS_CORE_CODES, "business-core");
    const businessCoreSet = new Set<string>(BUSINESS_CORE_CODES);
    const majorSpecificLD = recipe.lowerDiv.filter((c) => !businessCoreSet.has(c));
    buildGroup("Major lower-division requirements", majorSpecificLD, "lower-division");
  } else if (recipe.lowerDiv.length > 0) {
    buildGroup("Major lower-division requirements", recipe.lowerDiv, "lower-division");
  }

  if (recipe.upperDiv.length > 0) {
    buildGroup("Major upper-division requirements", recipe.upperDiv, "upper-division");
  }
  if (recipe.capstone) {
    buildGroup("Capstone", [recipe.capstone], "capstone");
  }

  // University Core (informational areas — not real course codes).
  const skipLang =
    recipe.noLanguage ||
    recipe.college === "SOE" ||
    recipe.college === "LSB" ||
    recipe.mathTrack === "calc-stem" ||
    recipe.mathTrack === "calc-life";
  const coreAreas = UNIVERSITY_CORE_AREAS.filter(
    (a) => !(skipLang && a.label.startsWith("Foreign Language")),
  );
  groups.push({
    label: "University Core (areas — pick approved courses)",
    courses: coreAreas.map((a) => ({
      code: a.label,
      title: a.label,
      units: 4,
      description: a.description,
      completed: false,
      category: "university-core" as const,
    })),
  });

  const notes: string[] = [...(recipe.notes ?? [])];
  if (missingFromCatalog.length > 0) {
    notes.push(
      `${missingFromCatalog.length} required course${missingFromCatalog.length === 1 ? "" : "s"} not in our current catalog snapshot — verify in the SCU 2025-26 Bulletin: ${missingFromCatalog.join(", ")}.`,
    );
  }
  if (skipLang) {
    notes.push(
      "This program is treated as a B.S. / professional degree and does not require the 3-quarter foreign-language intro sequence.",
    );
  }

  const realCourseGroups = groups.filter((g) => g.label !== "University Core (areas — pick approved courses)");
  const all = realCourseGroups.flatMap((g) => g.courses);
  return {
    major: recipe.major,
    title: recipe.title,
    college: recipe.college,
    mathTrack: recipe.mathTrack,
    notes,
    totalListed: all.length,
    completedCount: all.filter((c) => c.completed).length,
    groups,
    concentrations: recipe.concentrations ?? [],
  };
}

// ---------------------------------------------------------------------------
// Minors
// ---------------------------------------------------------------------------
//
// Curated list of SCU undergraduate minors. Pulled from the SCU 2025-26
// Bulletin minor offerings across CAS, SOE, and LSB. Codes are short,
// human-readable identifiers — not formal SCU department codes — so they're
// safe to display as-is. The minors list is intentionally separate from
// majors because many minors (e.g. Italian, Sustainability, Catholic
// Studies) have no corresponding major.

export interface MinorOption {
  code: string;
  title: string;
  college: College;
}

const MINORS: MinorOption[] = [
  // College of Arts & Sciences
  { code: "ANTH-MIN", title: "Anthropology", college: "CAS" },
  { code: "ARTH-MIN", title: "Art History", college: "CAS" },
  { code: "ARTS-MIN", title: "Studio Art", college: "CAS" },
  { code: "ASCI-MIN", title: "Asian Studies", college: "CAS" },
  { code: "BIOL-MIN", title: "Biology", college: "CAS" },
  { code: "CTHL-MIN", title: "Catholic Studies", college: "CAS" },
  { code: "CHEM-MIN", title: "Chemistry", college: "CAS" },
  { code: "CHIN-MIN", title: "Chinese and Sinophone Studies", college: "CAS" },
  { code: "CLAS-MIN", title: "Classics and Ancient Studies", college: "CAS" },
  { code: "CWRT-MIN", title: "Creative Writing", college: "CAS" },
  { code: "DANC-MIN", title: "Dance", college: "CAS" },
  { code: "ECON-MIN-CAS", title: "Economics (CAS)", college: "CAS" },
  { code: "ENGL-MIN", title: "English", college: "CAS" },
  { code: "ENVS-MIN", title: "Environmental Studies", college: "CAS" },
  { code: "ETHN-MIN", title: "Ethnic Studies", college: "CAS" },
  { code: "FREN-MIN", title: "French & Francophone Studies", college: "CAS" },
  { code: "HIST-MIN", title: "History", college: "CAS" },
  { code: "INTL-MIN", title: "International Studies", college: "CAS" },
  { code: "ITAL-MIN", title: "Italian Studies", college: "CAS" },
  { code: "JAPN-MIN", title: "Japanese Studies", college: "CAS" },
  { code: "LAS-MIN", title: "Latin American Studies", college: "CAS" },
  { code: "MATH-MIN", title: "Mathematics", college: "CAS" },
  { code: "MDVL-MIN", title: "Premodern Studies", college: "CAS" },
  { code: "MUSC-MIN", title: "Music", college: "CAS" },
  { code: "PHIL-MIN", title: "Philosophy", college: "CAS" },
  { code: "PHYS-MIN", title: "Physics", college: "CAS" },
  { code: "POLI-MIN", title: "Political Science", college: "CAS" },
  { code: "PUBH-MIN", title: "Public Health", college: "CAS" },
  { code: "RSOC-MIN", title: "Religious Studies", college: "CAS" },
  { code: "SOCI-MIN", title: "Sociology", college: "CAS" },
  { code: "SPAN-MIN", title: "Spanish Studies", college: "CAS" },
  { code: "SUST-MIN", title: "Sustainability", college: "CAS" },
  { code: "THTR-MIN", title: "Theatre", college: "CAS" },
  { code: "URBN-MIN", title: "Urban Education", college: "CAS" },
  { code: "WGST-MIN", title: "Women's & Gender Studies", college: "CAS" },
  { code: "ARAB-MIN", title: "Arabic, Islamic & Middle Eastern Studies", college: "CAS" },

  // Added 2026-09-04: bulletin-confirmed minors not previously in the
  // catalog (see docs/SCU_PROGRAM_CATALOG.md).
  { code: "JOUR-MIN", title: "Journalism", college: "CAS" },
  { code: "DFLM-MIN", title: "Digital Filmmaking", college: "CAS" },
  { code: "OBPC-MIN", title: "Organizational, Business, and Professional Communication", college: "CAS" },
  { code: "PWRT-MIN", title: "Professional Writing", college: "CAS" },
  { code: "GEOA-MIN", title: "Geospatial Analysis", college: "CAS" },
  { code: "AFAM-MIN", title: "African American Studies", college: "CAS" },
  { code: "ASAM-MIN", title: "Asian American Studies", college: "CAS" },
  { code: "LATX-MIN", title: "Latina/o/x Studies", college: "CAS" },
  { code: "ANIM-MIN", title: "Animation and Illustration", college: "CAS" },
  { code: "ARTM-MIN", title: "Arts Management", college: "CAS" },
  { code: "GRDS-MIN", title: "Graphic Design", college: "CAS" },
  { code: "TDTC-MIN", title: "Theatre Design and Technology", college: "CAS" },
  { code: "GERO-MIN", title: "Gerontology", college: "CAS" },
  { code: "MHUM-MIN", title: "Medical and Health Humanities", college: "CAS" },
  { code: "BTEC-MIN", title: "Biotechnology", college: "CAS" },
  { code: "MUTH-MIN", title: "Musical Theatre", college: "CAS" },

  // School of Engineering
  { code: "AERO-MIN", title: "Aerospace Engineering", college: "SOE" },
  { code: "BIOE-MIN", title: "Bioengineering", college: "SOE" },
  { code: "CSEN-MIN", title: "Computer Engineering", college: "SOE" },
  { code: "CSCI-MIN-SOE", title: "Computer Science and Engineering", college: "SOE" },
  { code: "ECEN-MIN", title: "Electrical & Computer Engineering", college: "SOE" },
  { code: "MECH-MIN", title: "Mechanical Engineering", college: "SOE" },
  { code: "GENG-MIN", title: "General Engineering", college: "SOE" },
  { code: "RAI-MIN", title: "Responsible Artificial Intelligence", college: "SOE" },
  { code: "HCID-MIN", title: "Healthcare Innovation and Design", college: "SOE" },
  { code: "CNST-MIN", title: "Construction Management", college: "SOE" },

  // Leavey School of Business
  { code: "ANLY-MIN", title: "Business Analytics", college: "LSB" },
  { code: "ECON-MIN-LSB", title: "Economics (LSB)", college: "LSB" },
  { code: "ENTR-MIN", title: "Entrepreneurship", college: "LSB" },
  { code: "MIS-MIN", title: "Management Information Systems", college: "LSB" },
  { code: "MKTG-MIN", title: "Marketing", college: "LSB" },
  { code: "RLES-MIN", title: "Real Estate", college: "LSB" },
  { code: "RTLM-MIN", title: "Retail Studies", college: "LSB" },
  { code: "INTB-MIN", title: "International Business", college: "LSB" },
  { code: "SFS-MIN", title: "Sustainable Food Systems", college: "LSB" },
];

export function getAvailableMinors(): MinorOption[] {
  return MINORS.slice().sort((a, b) =>
    a.college.localeCompare(b.college) || a.title.localeCompare(b.title),
  );
}

// ---------------------------------------------------------------------------
// Verified 2026-27 minor recipes
// ---------------------------------------------------------------------------

export interface MinorRequirementGroup {
  label: string;
  /** A group with one required course per entry, or a verified choice set. */
  courses: string[];
  minimumCourses?: number;
  minimumUnits?: number;
  needsVerification?: boolean;
  notes?: string[];
}

export interface MinorRecipe {
  code: string;
  title: string;
  sourceUrl: string;
  sourceLabel: string;
  catalogYear: string;
  lastVerified: string;
  notes: string[];
  groups: MinorRequirementGroup[];
}

const BULLETIN_2026_27 = "2026-27 Undergraduate Bulletin";
const VERIFIED_MINOR_DATE = "2026-08-11";
const VERIFIED_MINOR_DATE_2 = "2026-09-04";
const CAS_BULLETIN_BASE = "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/";
const SOE_BULLETIN_BASE = "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/";
const LSB_BULLETIN_BASE = "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/";

/**
 * Course lists appear only when the Bulletin names the course explicitly.
 * Approved-list, overlap, lab, and residency rules remain honest manual
 * verification requirements instead of being guessed from department prose.
 */
const MINOR_RECIPES: Record<string, MinorRecipe> = {
  "ANTH-MIN": {
    code: "ANTH-MIN", title: "Anthropology",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/anthropology.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Anthropology",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Complete ANTH 1 or ANTH 2, ANTH 3, one additional lower-division anthropology course, ANTH 110, and two approved upper-division anthropology courses."],
    groups: [
      { label: "Introduction to Anthropology", courses: ["ANTH 1", "ANTH 2"], minimumCourses: 1 },
      { label: "Anthropology foundations", courses: ["ANTH 3", "ANTH 110"] },
      { label: "Additional lower-division anthropology course", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Approved upper-division anthropology courses", courses: [], minimumCourses: 2, needsVerification: true },
    ],
  },
  "ASCI-MIN": {
    code: "ASCI-MIN", title: "Asian Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/asian-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Asian Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Two lower-division and four upper-division approved culture courses are required. No more than two upper-division courses may overlap the major and no more than three may be from one department. Language third-quarter/proficiency must be verified."],
    groups: [
      { label: "Approved lower-division Asian Studies culture courses", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Approved upper-division Asian Studies culture courses", courses: [], minimumCourses: 4, needsVerification: true },
      { label: "Asian language third-quarter or proficiency", courses: [], minimumCourses: 1, needsVerification: true },
    ],
  },
  "BIOL-MIN": {
    code: "BIOL-MIN", title: "Biology",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/biology.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Biology",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Three upper-division BIOL courses are required; two must include laboratories."],
    groups: [
      { label: "Biology lower division", courses: ["BIOL 1A", "BIOL 1B", "BIOL 1C"] },
      { label: "Chemistry supporting courses", courses: ["CHEM 11", "CHEM 12", "CHEM 31"] },
      { label: "Upper-division biology courses", courses: [], minimumCourses: 3, needsVerification: true, notes: ["Verify that at least two selected courses include laboratories."] },
    ],
  },
  "CHEM-MIN": {
    code: "CHEM-MIN", title: "Chemistry",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/chemistry-and-biochemistry.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Chemistry and Biochemistry",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Complete CHEM 11 and 12 or CHEM 14; CHEM 31, 32, and 33; and 20 CHEM units numbered 50 or above. CHEM 115 and 182 do not count."],
    groups: [
      { label: "General chemistry", courses: ["CHEM 11", "CHEM 12", "CHEM 14"], minimumCourses: 2, needsVerification: true, notes: ["Verify the Bulletin's CHEM 11/12 versus CHEM 14 sequence rule."] },
      { label: "Organic chemistry", courses: ["CHEM 31", "CHEM 32", "CHEM 33"] },
      { label: "Upper-division chemistry", courses: [], minimumUnits: 20, needsVerification: true, notes: ["CHEM 115 and CHEM 182 are excluded."] },
    ],
  },
  "CWRT-MIN": {
    code: "CWRT-MIN", title: "Creative Writing",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/english.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — English",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Complete ENGL 71 or 72, two ENGL 91 courses, three selected electives, and ENGL 171 or 172."],
    groups: [
      { label: "Introductory creative writing", courses: ["ENGL 71", "ENGL 72"], minimumCourses: 1 },
      { label: "Creative writing workshops", courses: ["ENGL 91"], minimumCourses: 2 },
      { label: "Selected creative writing electives", courses: [], minimumCourses: 3, needsVerification: true },
      { label: "Advanced creative writing", courses: ["ENGL 171", "ENGL 172"], minimumCourses: 1 },
    ],
  },
  "ECON-MIN-CAS": {
    code: "ECON-MIN-CAS", title: "Economics (CAS)",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/economics.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Economics",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Complete ECON 1, 2, 3, 113, and 115; two additional upper-division ECON courses; and an approved calculus sequence."],
    groups: [
      { label: "Economics foundations", courses: ["ECON 1", "ECON 2", "ECON 3", "ECON 113", "ECON 115"] },
      { label: "Additional upper-division economics", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Calculus sequence", courses: ["MATH 30", "MATH 31", "MATH 11", "MATH 12", "MATH 13"], minimumCourses: 2, needsVerification: true },
    ],
  },
  "ENGL-MIN": {
    code: "ENGL-MIN", title: "English",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/english.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — English",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Complete ENGL 14 or 15, ENGL 16, and five English electives, four of which must be upper division."],
    groups: [
      { label: "English foundations: ENGL 14 or 15", courses: ["ENGL 14", "ENGL 15"], minimumCourses: 1 },
      { label: "Required: ENGL 16", courses: ["ENGL 16"] },
      { label: "English electives", courses: [], minimumCourses: 5, needsVerification: true, notes: ["Verify that four selected electives are upper division."] },
    ],
  },
  "HIST-MIN": {
    code: "HIST-MIN", title: "History",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/history.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — History",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Seven HIST courses are required; at least four must be upper division."],
    groups: [{ label: "History courses", courses: [], minimumCourses: 7, needsVerification: true, notes: ["Verify that at least four selected courses are upper division."] }],
  },
  "MATH-MIN": {
    code: "MATH-MIN", title: "Mathematics",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/mathematics-and-computer-science.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Mathematics and Computer Science",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Complete MATH 11, 12, 13, 14, and either 52 or 53, plus three approved five-unit upper-division MATH courses. MATH 100, 192, and 195 do not count."],
    groups: [
      { label: "Mathematics foundations", courses: ["MATH 11", "MATH 12", "MATH 13", "MATH 14"] },
      { label: "Linear algebra or differential equations", courses: ["MATH 52", "MATH 53"], minimumCourses: 1 },
      { label: "Approved upper-division mathematics", courses: [], minimumCourses: 3, needsVerification: true, notes: ["Select five-unit courses; MATH 100, 192, and 195 are excluded."] },
    ],
  },
  "PHIL-MIN": {
    code: "PHIL-MIN", title: "Philosophy",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/philosophy.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Philosophy",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Complete PHIL 14 or 15; PHIL 17 or 18; four PHIL courses numbered 108–199; and PHIL 199 for five units."],
    groups: [
      { label: "Philosophy foundation: PHIL 14 or 15", courses: ["PHIL 14", "PHIL 15"], minimumCourses: 1 },
      { label: "Philosophy foundation: PHIL 17 or 18", courses: ["PHIL 17", "PHIL 18"], minimumCourses: 1 },
      { label: "Upper-division philosophy", courses: [], minimumCourses: 4, needsVerification: true },
      { label: "Philosophy seminar", courses: ["PHIL 199"], minimumCourses: 1, needsVerification: true, notes: ["Verify five-unit enrollment."] },
    ],
  },
  "SOCI-MIN": {
    code: "SOCI-MIN", title: "Sociology",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/sociology.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Sociology",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Complete SOCI 1, 35, and 119, then either one specified lower-division course plus three upper-division electives, or four upper-division electives."],
    groups: [
      { label: "Sociology foundations", courses: ["SOCI 1", "SOCI 35", "SOCI 119"] },
      { label: "Sociology electives", courses: [], minimumCourses: 4, needsVerification: true, notes: ["Verify the Bulletin's alternative lower/upper-division pathway."] },
    ],
  },
  "CSCI-MIN-SOE": {
    code: "CSCI-MIN-SOE", title: "Computer Science and Engineering",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/computer-science-and-engineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Computer Science and Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["At least two courses must be beyond the student's primary-major/free-elective requirements."],
    groups: [
      { label: "Programming foundations: CSEN 11 or CSCI 60", courses: ["CSEN 11", "CSCI 60"], minimumCourses: 1 },
      { label: "Programming foundations: CSEN 12 or CSCI 61", courses: ["CSEN 12", "CSCI 61"], minimumCourses: 1 },
      { label: "Computer science foundations", courses: ["CSEN 20"] },
      { label: "Computer engineering foundations", courses: ["ECEN 21", "CSEN 21"], minimumCourses: 1 },
      {
        label: "Approved technical selections",
        courses: ["CSEN 79", "CSEN 120", "CSEN 122", "CSEN 123", "CSEN 127", "CSEN 129", "CSEN 140", "CSEN 143", "CSEN 145", "CSEN 146", "CSEN 148", "CSEN 150", "CSEN 152", "CSEN 160", "CSEN 161", "CSEN 162", "CSEN 163", "CSEN 164", "CSEN 165", "CSEN 166", "CSEN 168", "CSEN 171", "CSEN 174", "CSEN 175", "CSEN 177", "CSEN 178", "CSEN 180", "ECEN 115", "ECEN 133"],
        minimumCourses: 4,
      },
    ],
  },
  "ANLY-MIN": {
    code: "ANLY-MIN", title: "Business Analytics",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/information-systems-and-analytics.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Information Systems and Analytics",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Available to business students. OMIS 30 is a prerequisite."],
    groups: [
      { label: "Business analytics courses", courses: ["OMIS 105", "OMIS 109", "OMIS 114", "OMIS 115"] },
      {
        label: "Approved business analytics elective",
        courses: ["ACTG 134", "ACTG 155", "OMIS 112", "OMIS 113", "OMIS 118", "OMIS 163", "OMIS 164", "ECON 173", "ECON 174", "FNCE 146", "MKTG 182", "MKTG 192"],
        minimumCourses: 1,
      },
    ],
  },
  "MIS-MIN": {
    code: "MIS-MIN", title: "Management Information Systems",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/information-systems-and-analytics.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Information Systems and Analytics",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "Non-business students have additional required math, statistics/data-analysis, and business-fundamentals coursework beyond what's modeled below.",
      "Courses cannot be counted toward multiple business-department programs simultaneously.",
    ],
    groups: [
      { label: "Information systems foundations", courses: ["OMIS 30", "OMIS 105"] },
      {
        label: "Approved OMIS electives",
        courses: ["OMIS 106", "OMIS 107", "OMIS 111", "OMIS 112", "OMIS 113", "OMIS 114", "OMIS 116", "OMIS 117", "OMIS 118", "OMIS 120", "OMIS 121", "OMIS 135", "OMIS 137", "OMIS 150"],
        minimumCourses: 3,
      },
      {
        label: "Non-business students only: mathematics",
        courses: ["MATH 11", "MATH 30"],
        minimumCourses: 1,
        needsVerification: true,
        notes: ["Only required of non-business students."],
      },
      {
        label: "Non-business students only: statistics/data analysis",
        courses: ["OMIS 40", "MATH 8", "MATH 122", "PSYC 40", "COMM 110"],
        minimumCourses: 1,
        needsVerification: true,
        notes: ["Only required of non-business students."],
      },
      {
        label: "Non-business students only: business fundamentals",
        courses: ["BUSN 70", "MGMT 160", "MKTG 181", "FNCE 121", "OMIS 108", "OMIS 108E"],
        minimumCourses: 3,
        needsVerification: true,
        notes: ["Only required of non-business students."],
      },
    ],
  },
  "MKTG-MIN": {
    code: "MKTG-MIN", title: "Marketing",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/marketing.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Marketing",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "Complete MKTG 181 (prerequisite: at least 60 units) and four approved MKTG electives.",
      "Open to both business and non-business students with junior standing; admission is by application, registering in winter quarter.",
      "An elective double-counted toward another minor (e.g. MKTG 165 also used for the Retail Studies minor) may not also satisfy this minor.",
    ],
    groups: [
      { label: "Marketing foundation", courses: ["MKTG 181"] },
      {
        label: "Approved marketing electives",
        courses: ["MKTG 165", "MKTG 173", "MKTG 174", "MKTG 175", "MKTG 177", "MKTG 178", "MKTG 185", "MKTG 186", "MKTG 187", "MKTG 188", "MKTG 189", "MKTG 190", "MKTG 191", "MKTG 192", "MKTG 193", "MKTG 194"],
        minimumCourses: 4,
      },
    ],
  },

  // ---- Remaining CAS minors (manual-verification; official rules surfaced) ----

  "ARAB-MIN": {
    code: "ARAB-MIN", title: "Arabic, Islamic & Middle Eastern Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/interdisciplinary-minors-and-other-programs-of-study.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — CAS Interdisciplinary Minors",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "9 courses total: 6 culture courses (2 lower + 4 upper-division, from at least 3 different departments, max 3 from any one department, max 2 from a student's own major) plus 3 quarters of Arabic language (test-out available).",
      "One culture course may be substituted with an independent-study/reading project approved by the AIMES Faculty Advisory Council.",
    ],
    groups: [
      { label: "Culture courses (3+ departments)", courses: [], minimumCourses: 6, needsVerification: true },
      { label: "Arabic language (3 quarters)", courses: [], minimumCourses: 3, needsVerification: true },
    ],
  },
  "ARTH-MIN": {
    code: "ARTH-MIN", title: "Art History",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/art-and-art-history.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Art & Art History",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Verify required and elective Art History course selections on the official bulletin page."],
    groups: [{ label: "Approved Art History courses", courses: [], minimumCourses: 6, needsVerification: true }],
  },
  "CTHL-MIN": {
    code: "CTHL-MIN", title: "Catholic Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/interdisciplinary-minors-and-other-programs-of-study.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — CAS Interdisciplinary Minors",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "Components: 2 Catholic theology courses (Religious Studies), 1 Cultures & Ideas Series course, 1 course on Catholicism in world history, 1 course on Catholicism in the arts/literature, 1 specialized philosophy or upper-division theology course, and 2 approved electives on Catholic societies/cultures.",
    ],
    groups: [
      { label: "Approved Catholic Studies courses", courses: [], minimumCourses: 8, needsVerification: true },
      { label: "Colloquium: ASCI 150 (Catholic 101, 2 units)", courses: ["ASCI 150"], minimumCourses: 1, needsVerification: true },
    ],
  },
  "CLAS-MIN": {
    code: "CLAS-MIN", title: "Classics and Ancient Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/classics-and-ancient-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Classics and Ancient Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "The Bulletin actually offers THREE alternative tracks for this minor: Classical Languages and Literatures (Latin/Greek-focused; SCU does not currently offer Latin/Greek courses in CampusVal's catalog), Classical Studies (a language course or one upper-division Latin/Greek course plus 4 classics courses), and Ancient Studies (CLAS 5/60/61 plus 4 non-language classics courses). CampusVal only models the Ancient Studies track below — a student pursuing one of the other two tracks should consult the Bulletin directly.",
    ],
    groups: [
      { label: "Ancient Studies foundation", courses: ["CLAS 5", "CLAS 60", "CLAS 61"], minimumCourses: 1 },
      {
        label: "Non-language classics courses (Ancient Studies track)",
        courses: ["ARTH 104", "ARTH 106", "ARTH 110", "ARTH 152", "PHIL 14", "PHIL 141", "POLI 111"],
        minimumCourses: 4,
        needsVerification: true,
        notes: ["The Bulletin also allows any CLAS-prefix course and other ancient-world courses approved by the department chair, beyond this cross-listed set."],
      },
    ],
  },
  "DANC-MIN": {
    code: "DANC-MIN", title: "Dance",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/theatre-and-dance.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Theatre and Dance",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: ["One of the ballet/jazz courses must be Level III/IV (DANC 42 or 45)."],
    groups: [
      { label: "Required: THTR 10", courses: ["THTR 10"] },
      { label: "Ballet or jazz (one Level III/IV)", courses: ["DANC 42", "DANC 45"], minimumCourses: 1 },
      { label: "Required: DANC 48 and DANC 49", courses: ["DANC 48", "DANC 49"] },
      { label: "Required: DANC 143 and DANC 146", courses: ["DANC 143", "DANC 146"] },
      { label: "Choreography/repertory elective", courses: ["DANC 140", "DANC 142", "DANC 148"], minimumCourses: 1 },
      { label: "Upper-division Theatre and Dance elective (5 units)", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Required: THTR 39 or 139", courses: ["THTR 39", "THTR 139"], minimumCourses: 1 },
    ],
  },
  "ENVS-MIN": {
    code: "ENVS-MIN", title: "Environmental Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/environmental-studies-and-sciences.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Environmental Studies and Sciences",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Core: ENVS 21, 22, 23, 188. One each from methods, social/political/legal, ethical/spiritual, inside elective categories. Two further electives."],
    groups: [
      { label: "Environmental Studies core", courses: ["ENVS 21", "ENVS 22", "ENVS 23", "ENVS 188"] },
      { label: "Methods course", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Social/Political/Legal perspective", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Ethical/Spiritual perspective", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Environmental Studies electives", courses: [], minimumCourses: 3, needsVerification: true },
    ],
  },
  "ETHN-MIN": {
    code: "ETHN-MIN", title: "Ethnic Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/ethnic-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Ethnic Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Distinct Asian American, Black/African American, and Latina/o/x minors also exist as their own separate minors."],
    groups: [
      { label: "Required: ETHN 5", courses: ["ETHN 5"] },
      { label: "Ethnic Studies foundations", courses: ["ETHN 10", "ETHN 20", "ETHN 30", "ETHN 40", "ETHN 80"], minimumCourses: 2 },
      { label: "Upper-division Ethnic Studies courses", courses: [], minimumCourses: 4, needsVerification: true },
    ],
  },
  "FREN-MIN": {
    code: "FREN-MIN", title: "French & Francophone Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/modern-languages-and-literatures.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Modern Languages and Literatures",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Requires FREN 100/101 or approved substitutions, at least one literature course, and additional upper-division French units totaling ≥19. At least 10 must be completed at SCU or taught by SCU faculty. Verify exact approved substitutions."],
    groups: [
      { label: "Advanced French language", courses: ["FREN 100", "FREN 101"], minimumCourses: 1, needsVerification: true },
      { label: "French literature course", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Additional upper-division French units", courses: [], minimumUnits: 9, needsVerification: true },
    ],
  },
  "INTL-MIN": {
    code: "INTL-MIN", title: "International Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/interdisciplinary-minors-and-other-programs-of-study.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — CAS Interdisciplinary Minors",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "Structure: 2 social-science foundation courses, 2 upper-division modern-language courses in a language matching the chosen emphasis, 3 emphasis courses (Global Thematic or Area Studies), and a 20-contact-hour abroad/internship/community-based-learning capstone.",
    ],
    groups: [
      { label: "Social science foundations", courses: ["ANTH 3", "ANTH 50", "COMM 107A", "ECON 3", "POLI 2", "POLI 25", "SOCI 133", "SOCI 134"], minimumCourses: 2, needsVerification: true, notes: ["At least one must be from the Bulletin's starred subset — not fully distinguished here."] },
      { label: "Upper-division modern language (emphasis-matched)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Emphasis courses (Global Thematic or Area Studies)", courses: [], minimumCourses: 3, needsVerification: true },
      { label: "Abroad/internship/community-based-learning capstone (20+ contact hours)", courses: [], minimumCourses: 1, needsVerification: true },
    ],
  },
  "ITAL-MIN": {
    code: "ITAL-MIN", title: "Italian Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/modern-languages-and-literatures.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Modern Languages and Literatures",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Requires ITAL 100/101 or approved substitutions. Total upper-division Italian units ≥19; at least 10 at SCU or taught by SCU faculty."],
    groups: [
      { label: "Advanced Italian language", courses: ["ITAL 100", "ITAL 101"], minimumCourses: 1, needsVerification: true },
      { label: "Upper-division Italian Studies electives", courses: [], minimumUnits: 9, needsVerification: true },
    ],
  },
  "CHIN-MIN": {
    code: "CHIN-MIN", title: "Chinese and Sinophone Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/modern-languages-and-literatures.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Modern Languages and Literatures",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "At least 19 quarter units total; at least 10 of those units must be taken at SCU or taught by SCU faculty.",
      "Track A (placement at CHIN 23 or below) vs Track B (placement at CHIN 100 or above) is a placement-based procedural split, not a curricular concentration — represented as two alternative group sets below; a student follows only the track matching their placement.",
    ],
    groups: [
      { label: "Track A — intermediate course (e.g. CHIN 23 or approved substitution)", courses: ["CHIN 23"], minimumCourses: 1 },
      { label: "Track A — at least two courses", courses: ["CHIN 100", "CHIN 101", "CHIN 102", "CHIN 103", "CHIN 105", "CHIN 106", "CHIN 107", "CHIN 127"], minimumCourses: 2 },
      { label: "Track A — one course (or approved substitution)", courses: ["CHIN 125", "CHIN 126", "CHIN 128"], minimumCourses: 1 },
      { label: "Track B (placement CHIN 100+) — at least three courses", courses: ["CHIN 100", "CHIN 101", "CHIN 102", "CHIN 103", "CHIN 105", "CHIN 106", "CHIN 107", "CHIN 127"], minimumCourses: 3 },
      { label: "Track B — one course (or approved substitution)", courses: ["CHIN 125", "CHIN 126", "CHIN 128"], minimumCourses: 1 },
      { label: "Remaining electives to reach 19 total quarter units (upper-division for Track B)", courses: [], minimumUnits: 19, needsVerification: true },
    ],
  },
  "JAPN-MIN": {
    code: "JAPN-MIN", title: "Japanese Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/modern-languages-and-literatures.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Modern Languages and Literatures",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Remaining electives to total at least 19 upper-division units; at least 10 of those units must be taken at SCU or taught by SCU faculty."],
    groups: [
      { label: "Advanced Japanese language", courses: ["JAPN 100", "JAPN 101", "JAPN 102"], minimumCourses: 1, needsVerification: true, notes: ["Or department-approved substitutions."] },
      { label: "Upper-division Japanese Studies electives", courses: [], minimumUnits: 9, needsVerification: true },
    ],
  },
  "LAS-MIN": {
    code: "LAS-MIN", title: "Latin American Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/interdisciplinary-minors-and-other-programs-of-study.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — CAS Interdisciplinary Minors",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Verify current Latin American Studies minor requirements on the official bulletin page."],
    groups: [{ label: "Approved Latin American Studies courses", courses: [], minimumCourses: 6, needsVerification: true }],
  },
  "MDVL-MIN": {
    code: "MDVL-MIN", title: "Premodern Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/premodern-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Premodern Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["7 courses from at least 3 departments; max 3 lower-division; one upper-division interdisciplinary research paper. Second language recommended."],
    groups: [
      { label: "Premodern Studies courses (3+ departments)", courses: [], minimumCourses: 7, needsVerification: true },
      { label: "Upper-division interdisciplinary research paper", courses: [], minimumCourses: 1, needsVerification: true },
    ],
  },
  "MUSC-MIN": {
    code: "MUSC-MIN", title: "Music",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/music.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Music",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Also requires 2 units of applied instruction, one quarter of MUSC 16/116 (Music at Noon), and 6 units in an approved departmental ensemble — none of which CampusVal models as course-code requirements.",
      "The Bulletin describes a separate Musical Theatre minor (offered jointly with Theatre and Dance) — see MUTH-MIN — and does NOT describe a distinct 'Music Performance' minor.",
    ],
    groups: [
      { label: "Music Theory (two courses)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Musicianship (two courses)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Introduction to Listening series", courses: ["MUSC 7", "MUSC 8", "MUSC 9", "MUSC 10"], minimumCourses: 2 },
      { label: "Electronic Music (at least one)", courses: ["MUSC 9", "MUSC 157", "MUSC 115", "MUSC 119"], minimumCourses: 1 },
      {
        label: "Ethnomusicology/Music History elective",
        courses: ["MUSC 114", "MUSC 119", "MUSC 128", "MUSC 130", "MUSC 131", "MUSC 132", "MUSC 133", "MUSC 134", "MUSC 135", "MUSC 136", "MUSC 139", "MUSC 189", "MUSC 190", "MUSC 192", "MUSC 194"],
        minimumCourses: 1,
      },
      { label: "MUSC 3, 3A, or any upper-division elective", courses: ["MUSC 3", "MUSC 3A"], minimumCourses: 1, needsVerification: true },
    ],
  },
  "PHYS-MIN": {
    code: "PHYS-MIN", title: "Physics",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/physics-and-engineering-physics.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Physics and Engineering Physics",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [],
    groups: [
      { label: "Physics core", courses: ["PHYS 31", "PHYS 32", "PHYS 33", "PHYS 34", "PHYS 192"] },
      {
        label: "Additional approved physics courses (numbered 70–162)",
        courses: ["PHYS 70", "PHYS 103", "PHYS 104", "PHYS 111", "PHYS 112", "PHYS 113", "PHYS 116", "PHYS 120", "PHYS 121", "PHYS 122", "PHYS 123", "PHYS 141", "PHYS 151", "PHYS 161", "PHYS 162"],
        minimumCourses: 4,
      },
    ],
  },
  "POLI-MIN": {
    code: "POLI-MIN", title: "Political Science",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/political-science.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Political Science",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["3 lower-division from the list below; 3 upper-division 5-unit POLI lectures (open pool — any upper-division POLI lecture qualifies); 1 additional POLI lecture ≥4 units (also open pool)."],
    groups: [
      {
        label: "Lower-division Political Science courses",
        courses: ["POLI 1", "POLI 2", "POLI 25", "POLI 30", "POLI 40", "POLI 45", "POLI 55", "POLI 99"],
        minimumCourses: 3,
        notes: ["ECON 1 or 2 cannot be substituted for POLI 40."],
      },
      { label: "Upper-division Political Science lectures (5 units each)", courses: [], minimumCourses: 3, needsVerification: true },
      { label: "Additional upper- or lower-division POLI lecture (≥4 units)", courses: [], minimumCourses: 1, needsVerification: true },
    ],
  },
  "PUBH-MIN": {
    code: "PUBH-MIN", title: "Public Health",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/public-health-sciences.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Public Health Sciences",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [],
    groups: [
      { label: "Public Health foundations", courses: ["PHSC 1", "PHSC 2", "PHSC 3"], minimumCourses: 1 },
      { label: "Additional Public Health courses", courses: [], minimumCourses: 2, needsVerification: true },
      {
        label: "Statistics course",
        courses: ["PHSC 50", "ANTH 112", "BIOL 160", "ENVS 110", "COMM 110", "MATH 8", "OMIS 40", "PSYC 40", "SOCI 120"],
        minimumCourses: 1,
      },
      { label: "Natural science", courses: ["BIOL 1A", "BIOL 2", "BIOL 11"], minimumCourses: 1 },
      {
        label: "Upper-division electives (at least two departments)",
        courses: [],
        minimumCourses: 3,
        needsVerification: true,
      },
    ],
  },
  "RSOC-MIN": {
    code: "RSOC-MIN", title: "Religious Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/religious-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Religious Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["1 RSOC/SCTR/TESP course numbered 1-19; 2 courses numbered 20-99; 4 approved courses numbered 100-199 including a seminar; all three subject prefixes must be represented."],
    groups: [
      { label: "Introductory Religious Studies course (1-19)", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Intermediate Religious Studies courses (20-99)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Upper-division Religious Studies including seminar (100-199)", courses: [], minimumCourses: 4, needsVerification: true, notes: ["All three prefixes RSOC, SCTR, and TESP must be represented."] },
    ],
  },
  "SPAN-MIN": {
    code: "SPAN-MIN", title: "Spanish Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/modern-languages-and-literatures.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Modern Languages and Literatures",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [],
    groups: [
      { label: "Advanced Spanish language: SPAN 100 or 101", courses: ["SPAN 100", "SPAN 101"], minimumCourses: 1, needsVerification: true },
      { label: "Advanced Spanish language: SPAN 102 or 103", courses: ["SPAN 102", "SPAN 103"], minimumCourses: 1 },
      { label: "Literature and cultural studies course (above SPAN 110)", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Additional upper-division Spanish elective", courses: [], minimumCourses: 1, needsVerification: true },
    ],
  },
  "ARTS-MIN": {
    code: "ARTS-MIN", title: "Studio Art",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/art-and-art-history.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Art & Art History",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "No more than 3 transfer-credit or study-abroad courses may count toward this minor; none may count for the required ARTH course.",
      "Cannot be declared alongside the Graphic Design minor, Animation and Illustration minor, or Studio Art major.",
    ],
    groups: [
      { label: "Two-dimensional course", courses: ["ARTS 30", "ARTS 32", "ARTS 35", "ARTS 36", "ARTS 37", "ARTS 43", "ARTS 45", "ARTS 46", "ARTS 48", "ARTS 50", "ARTS 57", "ARTS 70", "ARTS 72"], minimumCourses: 1, needsVerification: true, notes: ["An approved upper-division equivalent may also count."] },
      { label: "Three-dimensional course", courses: ["ARTS 33", "ARTS 63", "ARTS 64"], minimumCourses: 1, needsVerification: true, notes: ["An approved upper-division equivalent may also count."] },
      { label: "Additional studio ARTS courses", courses: [], minimumCourses: 4, needsVerification: true, notes: ["Upper-division preferred; ARTS 194 excluded."] },
      { label: "Art History course (taken at SCU)", courses: [], minimumCourses: 1, needsVerification: true, notes: ["ARTH 11A, 12A, and 194 excluded."] },
    ],
  },
  "SUST-MIN": {
    code: "SUST-MIN", title: "Sustainability",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/interdisciplinary-minors-and-other-programs-of-study.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — CAS Interdisciplinary Minors",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "8 courses total: ENVS 95 plus 2 courses (6+ units) from each of three approved dimension lists (Environmental, Societal, Economic) plus one Action Learning project/community-based/immersion course. No more than 3 courses may come from a student's major.",
    ],
    groups: [
      { label: "Required: ENVS 95 (Sustainability 101)", courses: ["ENVS 95"] },
      { label: "Environmental dimension (2 courses, 6+ units)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Societal dimension (2 courses, 6+ units)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Economic dimension (2 courses, 6+ units)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Action Learning project/community-based/immersion course", courses: [], minimumCourses: 1, needsVerification: true },
    ],
  },
  "THTR-MIN": {
    code: "THTR-MIN", title: "Theatre",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/theatre-and-dance.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Theatre and Dance",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [],
    groups: [
      { label: "Required: THTR 10, and THTR 8 or 24, and THTR 30", courses: ["THTR 10", "THTR 8", "THTR 24", "THTR 30"], minimumCourses: 3 },
      { label: "THTR 41 or 42", courses: ["THTR 41", "THTR 42"], minimumCourses: 1 },
      { label: "Upper-division Theatre and Dance electives (5 units each)", courses: [], minimumCourses: 4, needsVerification: true },
      { label: "Required: THTR 39 or 139", courses: ["THTR 39", "THTR 139"], minimumCourses: 1 },
    ],
  },
  "URBN-MIN": {
    code: "URBN-MIN", title: "Urban Education",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/urban-education.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Urban Education",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [],
    groups: [
      { label: "Required: POLI 1, or HIST 96A or 96B", courses: ["POLI 1", "HIST 96A", "HIST 96B"], minimumCourses: 1 },
      { label: "Required core", courses: ["PSYC 2", "CHST 106", "CHST 138", "PSYC 134"] },
      {
        label: "Electives",
        courses: ["CHST 104", "ENGL 104", "ENGL 105", "ETHN 151", "ETHN 157", "ETHN 161", "ETHN 167", "HIST 182B", "HIST 184", "HIST 186", "PSYC 185", "PSYC 185EL", "PSYC 172", "SOCI 153", "SOCI 157", "SOCI 175", "PHSC 131", "ENVS 131"],
        minimumCourses: 2,
      },
    ],
  },
  "WGST-MIN": {
    code: "WGST-MIN", title: "Women's & Gender Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/gender-and-sexuality-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Gender and Sexuality Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "The live Bulletin currently labels this program's page 'Gender and Sexuality Studies', but CampusVal's course catalog and the corresponding major both consistently use the 'Women's & Gender Studies' (WGST) name and course prefix — kept as the title here pending clarification of whether this is a name-in-transition or two distinct pages. CampusVal previously modeled this minor twice (as WGST-MIN and LGBT-MIN); this single entry replaces both.",
    ],
    groups: [
      {
        label: "Principles course or sequence",
        courses: ["WGST 1A", "WGST 11A", "WGST 50", "WGST 51", "WGST 52", "WGST 59"],
        minimumCourses: 1,
        needsVerification: true,
        notes: ["Some options are two-course sequences (e.g. WGST 1A+2A, WGST 11A+12A) that CampusVal does not fully enumerate here."],
      },
      { label: "Junior-year methods course", courses: ["WGST 101", "WGST 102"], minimumCourses: 1 },
      { label: "Capstone: WGST 105 or 190 (senior year)", courses: ["WGST 105", "WGST 190"], minimumCourses: 1 },
      { label: "Electives", courses: [], minimumCourses: 3, needsVerification: true },
    ],
  },

  // ---- Leavey School of Business ----
  "ECON-MIN-LSB": {
    code: "ECON-MIN-LSB", title: "Economics (LSB)",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/economics.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Economics",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["The Economics minor is offered through CAS. Business students should consult the Economics department for applicable requirements."],
    groups: [
      { label: "Economics foundations", courses: ["ECON 1", "ECON 2", "ECON 3", "ECON 113", "ECON 115"] },
      { label: "Additional upper-division economics", courses: [], minimumCourses: 2, needsVerification: true },
    ],
  },
  "ENTR-MIN": {
    code: "ENTR-MIN", title: "Entrepreneurship",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/undergraduate-degrees.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Leavey School of Business",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "Also requires a non-course co-curricular activity (e.g. IdeaLab, BVA Cafe Events, a Ciocca Center field trip, or Demo Day) that CampusVal does not track.",
    ],
    groups: [
      { label: "Entrepreneurship core", courses: ["MGMT 164", "MGMT 165", "MGMT 198E"] },
      {
        label: "Approved entrepreneurship electives",
        courses: ["BUSN 197", "ECON 129", "ECON 185", "ENVS 145", "ENVS 148", "FNCE 141", "FNCE 143", "FNCE 150", "FNCE 170", "MECH 144", "MGMT 110", "MGMT 167", "MGMT 172", "HRNS 120A", "MGMT 177", "ENGR 161", "MKTG 175", "MKTG 177", "MKTG 182", "MKTG 187", "PHSC 157", "SOCI 130", "SOCI 150", "SOCI 172", "PHSC 172"],
        minimumCourses: 2,
      },
    ],
  },
  "RLES-MIN": {
    code: "RLES-MIN", title: "Real Estate",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/finance.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Finance",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["FNCE 118 required; FNCE 127 or 129 required; 3 primary-list electives for business students, 4 for non-business (reducible to 3 with stated foundations). Max 1 secondary-list elective."],
    groups: [
      { label: "Real Estate foundation", courses: ["FNCE 118"] },
      { label: "Real Estate finance", courses: ["FNCE 127", "FNCE 129"], minimumCourses: 1 },
      {
        label: "Real Estate electives (primary list)",
        courses: ["FNCE 127", "FNCE 129", "FNCE 128", "FNCE 131", "ECON 156", "ENVS 116", "ENVS 128", "CENG 118", "CENG 119"],
        minimumCourses: 3,
        needsVerification: true,
        notes: ["Non-business students require 4 (may reduce to 3 with stated foundations); at most one course may instead come from the secondary list (CENG 128, FNCE 143, OMIS 114, OMIS 115, OMIS 116, OMIS 118, MKTG 189). Verify eligibility."],
      },
    ],
  },
  "RTLM-MIN": {
    code: "RTLM-MIN", title: "Retail Studies",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/retail-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Retail Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "Admission requires a minimum 3.3 GPA and approval from the Executive Director.",
      "Capstone: MKTG 168 (Senior Seminar 1, fall) and MKTG 169 (Senior Seminar 2, winter), plus a BUSN 198R internship.",
    ],
    groups: [
      { label: "Business foundations (ACTG 11 or 11A)", courses: ["BUSN 70", "ACTG 11", "ACTG 11A", "ECON 1", "MKTG 181"], minimumCourses: 4 },
      { label: "Communication skill", courses: ["COMM 20", "COMM 2", "BUSN 179"], minimumCourses: 1 },
      { label: "Computer concepts", courses: ["OMIS 15"] },
      { label: "Data analysis skill", courses: ["OMIS 40", "PSYC 40", "MATH 8", "MATH 123", "AMTH 108", "COMM 110", "COMM 100"], minimumCourses: 1 },
      { label: "Technology/information systems skill", courses: ["COMM 12", "COMM 50", "OMIS 34", "ACTG 134", "SOCI 49", "SOCI 149"], minimumCourses: 1 },
      { label: "Organization and management", courses: ["MGMT 160"] },
      { label: "Retail-specific and capstone", courses: ["MKTG 165", "BUSN 198R", "MKTG 168", "MKTG 169"] },
    ],
  },

  // ---- School of Engineering ----
  "AERO-MIN": {
    code: "AERO-MIN", title: "Aerospace Engineering",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/mechanical-engineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Mechanical Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "Advanced students may substitute qualifying graduate-level aerospace courses (e.g. MECH 205/206, 371/372, 431) for the undergraduate aerospace electives with department approval — not modeled below.",
    ],
    groups: [
      {
        label: "Fundamental courses (choose two)",
        courses: ["MECH 140", "MECH 140R", "CENG 43", "MECH 121", "MECH 121R", "MECH 122", "MECH 122L"],
        minimumCourses: 2,
        needsVerification: true,
        notes: ["Each option is itself a paired lecture+lab/recitation (e.g. MECH 140 and MECH 140R together); verify the exact pairing in the Bulletin."],
      },
      { label: "Required: MECH 145 (Introduction to Aerospace Engineering)", courses: ["MECH 145"] },
      {
        label: "Aerospace electives (choose two, totaling 8 units)",
        courses: ["MECH 132", "MECH 153", "MECH 155", "MECH 158"],
        minimumCourses: 2,
      },
    ],
  },
  "BIOE-MIN": {
    code: "BIOE-MIN", title: "Bioengineering",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/undergraduate-degrees.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — School of Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: [
      "Designed for CAS science majors, pre-med students, and engineering majors.",
      "Engineering-major students may substitute BIOE 21/22 for the BIOL 1A/1B/1C natural-science requirement below — not modeled as an equal alternative here since it is a 2-course vs. 3-course substitution.",
    ],
    groups: [
      { label: "Bioethics", courses: ["BIOE 180", "BIOL 171", "ENGR 19", "PHIL 27", "PHIL 117", "TESP 157"], minimumCourses: 1 },
      { label: "Natural science: biology", courses: ["BIOL 1A", "BIOL 1B", "BIOL 1C"] },
      { label: "Natural science: chemistry", courses: ["CHEM 11", "CHEM 12", "CHEM 31"] },
      {
        label: "Natural science: physics (PHYS 31/32/33 or PHYS 11/12/13)",
        courses: ["PHYS 31", "PHYS 32", "PHYS 33", "PHYS 11", "PHYS 12", "PHYS 13"],
        minimumCourses: 3,
        needsVerification: true,
        notes: ["Must be one complete 3-course track, not a mix of both."],
      },
      { label: "Mathematics", courses: ["MATH 11", "MATH 12", "MATH 13", "MATH 14"] },
      { label: "Engineering: BIOE 24 or 25", courses: ["BIOE 24", "BIOE 25"], minimumCourses: 1 },
      { label: "Engineering: BIOE 23, ECEN 50, or PHYS 70", courses: ["BIOE 23", "ECEN 50", "PHYS 70"], minimumCourses: 1 },
      { label: "Engineering: BIOE 45 or CSEN 44", courses: ["BIOE 45", "CSEN 44"], minimumCourses: 1 },
      {
        label: "Upper-division electives",
        courses: ["BIOE 153", "BIOE 154", "BIOE 155", "BIOE 161", "BIOE 163", "BIOE 172", "BIOE 174", "BIOE 175", "BIOE 176"],
        minimumCourses: 2,
      },
    ],
  },
  "CSEN-MIN": {
    code: "CSEN-MIN", title: "Computer Engineering",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/computer-science-and-engineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Computer Science and Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["This is the Computer Engineering track of the CSE minor. Requirements are the same as the CSE minor (CSCI-MIN-SOE). Verify with the department."],
    groups: [
      { label: "Programming foundations: CSEN 11 or CSCI 60", courses: ["CSEN 11", "CSCI 60"], minimumCourses: 1 },
      { label: "Programming foundations: CSEN 12 or CSCI 61", courses: ["CSEN 12", "CSCI 61"], minimumCourses: 1 },
      { label: "Computer science foundations", courses: ["CSEN 20"] },
      { label: "Computer engineering foundations", courses: ["ECEN 21", "CSEN 21"], minimumCourses: 1 },
      {
        label: "Approved technical selections",
        courses: ["CSEN 79", "CSEN 120", "CSEN 122", "CSEN 123", "CSEN 127", "CSEN 129", "CSEN 140", "CSEN 143", "CSEN 145", "CSEN 146", "CSEN 148", "CSEN 150", "CSEN 152", "CSEN 160", "CSEN 161", "CSEN 162", "CSEN 163", "CSEN 164", "CSEN 165", "CSEN 166", "CSEN 168", "CSEN 171", "CSEN 174", "CSEN 175", "CSEN 177", "CSEN 178", "CSEN 180", "ECEN 115", "ECEN 133"],
        minimumCourses: 4,
      },
    ],
  },
  "ECEN-MIN": {
    code: "ECEN-MIN", title: "Electrical & Computer Engineering",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/electrical-and-computer-engineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Electrical & Computer Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["ECEN 21/21L, 50/50L, 120/120L required; 2 from ECEN 121/122/133/142 with labs; 3 additional approved upper-division ECEN lectures; ≥2 courses beyond primary-degree requirements."],
    groups: [
      { label: "ECE laboratory foundations", courses: ["ECEN 21", "ECEN 50", "ECEN 120"] },
      { label: "ECE laboratory courses", courses: ["ECEN 121", "ECEN 122", "ECEN 133", "ECEN 142"], minimumCourses: 2 },
      {
        label: "Additional upper-division ECEN lectures",
        courses: ["ECEN 115", "ECEN 121", "ECEN 122", "ECEN 123", "ECEN 127", "ECEN 131", "ECEN 133", "ECEN 142", "ECEN 153", "ECEN 162", "ECEN 180"],
        minimumCourses: 3,
      },
    ],
  },
  "GENG-MIN": {
    code: "GENG-MIN", title: "General Engineering",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/general-engineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — General Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["Programming choice; CENG 41; ECEN 50/50L; MECH 10L/121; 2 approved disciplinary electives; 1 approved two-course technical sequence."],
    groups: [
      { label: "Programming", courses: ["CSEN 10", "CSEN 11", "CSCI 10", "OMIS 30"], minimumCourses: 1, notes: ["Or another approved programming course with any co-requisite labs."] },
      { label: "Engineering mechanics", courses: ["CENG 41"] },
      { label: "Circuits", courses: ["ECEN 50"] },
      { label: "Mechanical fundamentals", courses: ["MECH 10L", "MECH 121"] },
      {
        label: "Approved disciplinary electives",
        courses: ["BIOE 24", "CENG 10", "CENG 43", "CSEN 12", "ECEN 21", "ECEN 33", "ECEN 115", "MECH 11", "MECH 15", "MECH 140"],
        minimumCourses: 2,
      },
      {
        label: "Approved two-course technical sequence",
        courses: ["BIOE 153", "BIOE 154", "CENG 115", "CENG 118", "CENG 121", "CENG 143", "CSEN 79", "ECEN 100", "ECEN 110", "ECEN 116", "ECEN 127", "ECEN 164", "MECH 122", "MECH 123", "MECH 125", "MECH 132"],
        minimumCourses: 2,
        needsVerification: true,
        notes: ["Must be taken as one of the Bulletin's specific two-course pairings (e.g. CENG 115 and CENG 118), not any two courses from this pool independently — verify the exact pairing in the Bulletin."],
      },
    ],
  },
  "MECH-MIN": {
    code: "MECH-MIN", title: "Mechanical Engineering",
    sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/mechanical-engineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Mechanical Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE,
    notes: ["MECH 10L/12L/45/45L/121/121R required; CENG 41; ECEN 50/50L; choose 2 specified courses; choose 1 listed two-course technical sequence."],
    groups: [
      { label: "Mechanical Engineering core", courses: ["MECH 45", "MECH 121"] },
      { label: "Supporting engineering", courses: ["CENG 41", "ECEN 50"] },
      {
        label: "Mechanical Engineering elective pair",
        courses: ["MECH 11", "MECH 15", "MECH 140", "CENG 43"],
        minimumCourses: 2,
      },
      {
        label: "Approved two-course technical sequence",
        courses: ["MECH 122", "MECH 123", "MECH 132", "MECH 114", "MECH 115", "MECH 141", "MECH 142"],
        minimumCourses: 2,
        needsVerification: true,
        notes: [
          "Must be one of the Bulletin's specific pairings: MECH 122+123, MECH 122+132, MECH 114+115, or MECH 141+142 — not any two courses from this pool independently.",
        ],
      },
    ],
  },

  // Added 2026-09-04: bulletin-confirmed minors not previously in the
  // catalog. Course lists are left empty + needsVerification where the
  // Bulletin's exact approved-course list is not verified here, following
  // the same honesty convention as the pre-existing entries above.
  "JOUR-MIN": {
    code: "JOUR-MIN", title: "Journalism",
    sourceUrl: CAS_BULLETIN_BASE + "communication.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Communication (Journalism minor)",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "7 courses total: COMM 60 plus 6 electives from the department's approved Journalism list, or up to 5 repeated units of COMM 190 Journalism Practicum counted as one elective.",
      "Up to two upper-division courses from another department (e.g. political science, ethnic studies, public health) may count with the journalism minor director's permission.",
    ],
    groups: [
      { label: "Required: COMM 60 (Journalism)", courses: ["COMM 60"], minimumCourses: 1 },
      {
        label: "Journalism electives (approved COMM list or COMM 190 practicum)",
        courses: ["COMM 106", "COMM 131D", "COMM 142", "COMM 144", "COMM 145", "COMM 160", "COMM 161", "COMM 161C", "COMM 162", "COMM 163", "COMM 164", "COMM 165", "COMM 165M", "COMM 166", "COMM 167", "COMM 168", "COMM 185", "COMM 190"],
        minimumCourses: 6,
      },
    ],
  },
  "DFLM-MIN": {
    code: "DFLM-MIN", title: "Digital Filmmaking",
    sourceUrl: CAS_BULLETIN_BASE + "communication.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Communication (Digital Filmmaking minor)",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "7 courses total: COMM 30 plus 6 electives chosen across a production list and a history/theory list (no minimum from either individually).",
    ],
    groups: [
      { label: "Required: COMM 30 (Digital Filmmaking)", courses: ["COMM 30"], minimumCourses: 1 },
      {
        label: "Production and history/theory electives",
        courses: [
          "COMM 103", "COMM 130", "COMM 130A", "COMM 131D", "COMM 131E", "COMM 131F", "COMM 132", "COMM 132D", "COMM 133", "COMM 133W", "COMM 134", "COMM 135", "COMM 146",
          "COMM 104", "COMM 136S", "COMM 136F", "COMM 137", "COMM 137S", "COMM 138", "COMM 139", "COMM 140", "COMM 140B", "COMM 140W", "COMM 140C", "COMM 140Q", "COMM 141", "COMM 143", "COMM 145",
        ],
        minimumCourses: 6,
        notes: ["The Bulletin splits this list into a production track and a history/theory track; CampusVal does not currently enforce drawing from both."],
      },
    ],
  },
  "OBPC-MIN": {
    code: "OBPC-MIN", title: "Organizational, Business, and Professional Communication",
    sourceUrl: CAS_BULLETIN_BASE + "communication.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Communication",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "7 courses total: COMM 10 plus 6 upper-division electives from the department's approved list.",
      "A COMM special-topics course and/or one relevant non-COMM course may count with the minor director's or department chair's approval.",
    ],
    groups: [
      { label: "Required: COMM 10 (Interpersonal Communication)", courses: ["COMM 10"], minimumCourses: 1 },
      {
        label: "Upper-division Communication electives (approved list)",
        courses: ["COMM 102", "COMM 112", "COMM 115", "COMM 115J", "COMM 115V", "COMM 116", "COMM 116T", "COMM 118", "COMM 119", "COMM 120", "COMM 121", "COMM 122", "COMM 123", "COMM 124", "COMM 125", "COMM 129", "COMM 145", "COMM 150", "COMM 153", "COMM 158", "COMM 171", "COMM 173", "COMM 187", "COMM 198"],
        minimumCourses: 6,
      },
    ],
  },
  "PWRT-MIN": {
    code: "PWRT-MIN", title: "Professional Writing",
    sourceUrl: CAS_BULLETIN_BASE + "english.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — English",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Distinct from the existing Creative Writing minor. No more than two courses used for an English major may also count toward this minor.",
    ],
    groups: [
      { label: "Required: ENGL 16", courses: ["ENGL 16"], minimumCourses: 1 },
      { label: "Internship: ENGL 189 and/or ASCI 198", courses: ["ENGL 189", "ASCI 198"], minimumUnits: 4 },
      { label: "Electives — at least 5, three of which upper-division (approved ENGL list)", courses: [], minimumCourses: 5, needsVerification: true },
    ],
  },
  "GEOA-MIN": {
    code: "GEOA-MIN", title: "Geospatial Analysis",
    sourceUrl: CAS_BULLETIN_BASE + "environmental-studies-and-sciences.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Environmental Studies and Sciences",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "ENVS/ENSC majors must take at least one upper-division course here that does not also count toward their major.",
      "The exact approved 'data-focused' and 'natural/social-justice dimension' elective lists are referenced by the Bulletin but not fully enumerated there — verify current options directly with the department.",
    ],
    groups: [
      { label: "Required: ENVS 15 or CENG 15", courses: ["ENVS 15", "CENG 15"], minimumCourses: 1 },
      { label: "Required: ENVS 116 or CENG 160", courses: ["ENVS 116", "CENG 160"], minimumCourses: 1 },
      { label: "Required: ENVS 117", courses: ["ENVS 117"], minimumCourses: 1 },
      { label: "Approved data-focused and natural/social-justice dimension electives", courses: [], minimumCourses: 2, needsVerification: true },
    ],
  },
  "AFAM-MIN": {
    code: "AFAM-MIN", title: "African American Studies",
    sourceUrl: CAS_BULLETIN_BASE + "ethnic-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Ethnic Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Distinct from the existing general Ethnic Studies minor.",
      "Consult the Ethnic Studies Department Chair on applicability of transfer/study-abroad courses.",
    ],
    groups: [
      { label: "Required: ETHN 5, ETHN 30", courses: ["ETHN 5", "ETHN 30"], minimumCourses: 2 },
      { label: "One Black Studies course", courses: ["ETHN 31", "ETHN 35", "ETHN 36", "ETHN 38", "ETHN 55", "ETHN 56", "ETHN 58", "ETHN 69", "ETHN 70", "ETHN 90", "ETHN 91", "ETHN 95", "ETHN 96"], minimumCourses: 1 },
      { label: "Four upper-division electives", courses: ["ETHN 100", "ETHN 130", "ETHN 130A", "ETHN 131", "ETHN 131A", "ETHN 132", "ETHN 132A", "ETHN 133", "ETHN 135", "ETHN 136", "ETHN 137", "ETHN 138", "ETHN 138A", "ETHN 148", "ETHN 149", "ETHN 165", "ETHN 172", "ETHN 175", "ETHN 178", "ETHN 187", "ETHN 188"], minimumCourses: 4 },
    ],
  },
  "ASAM-MIN": {
    code: "ASAM-MIN", title: "Asian American Studies",
    sourceUrl: CAS_BULLETIN_BASE + "ethnic-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Ethnic Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Distinct from the existing general Ethnic Studies minor.",
      "Consult the Ethnic Studies Department Chair on applicability of transfer/study-abroad courses.",
    ],
    groups: [
      { label: "Required: ETHN 5, ETHN 40", courses: ["ETHN 5", "ETHN 40"], minimumCourses: 2 },
      { label: "One Asian American Studies course", courses: ["ETHN 41", "ETHN 50", "ETHN 51", "ETHN 52", "ETHN 55", "ETHN 56", "ETHN 58", "ETHN 69", "ETHN 70", "ETHN 91", "ETHN 96"], minimumCourses: 1 },
      { label: "Four upper-division electives", courses: ["ETHN 100", "ETHN 140", "ETHN 141", "ETHN 142", "ETHN 144", "ETHN 145", "ETHN 152", "ETHN 153", "ETHN 165", "ETHN 185", "ETHN 187"], minimumCourses: 4 },
    ],
  },
  "LATX-MIN": {
    code: "LATX-MIN", title: "Latina/o/x Studies",
    sourceUrl: CAS_BULLETIN_BASE + "ethnic-studies.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Ethnic Studies",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Distinct from the existing general Ethnic Studies minor. The Bulletin renders this minor's name with an accented 'é' variant (Latina/é/o/x Studies) in some places — represented here in its plain-ASCII form for catalog-code consistency.",
      "Consult the Ethnic Studies Department Chair on applicability of transfer/study-abroad courses.",
    ],
    groups: [
      { label: "Required: ETHN 5, ETHN 20", courses: ["ETHN 5", "ETHN 20"], minimumCourses: 2 },
      { label: "One Latina/o/x Studies course", courses: ["ETHN 21", "ETHN 25", "ETHN 55", "ETHN 56", "ETHN 58", "ETHN 69", "ETHN 70", "ETHN 91", "ETHN 96"], minimumCourses: 1 },
      { label: "Four upper-division electives", courses: ["ETHN 100", "ETHN 120", "ETHN 121", "ETHN 122", "ETHN 123", "ETHN 124", "ETHN 125", "ETHN 125A", "ETHN 126", "ETHN 127", "ETHN 128", "ETHN 129", "ETHN 165", "ETHN 186", "ETHN 187"], minimumCourses: 4 },
    ],
  },
  "ANIM-MIN": {
    code: "ANIM-MIN", title: "Animation and Illustration",
    sourceUrl: CAS_BULLETIN_BASE + "art-and-art-history.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Art and Art History",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Must declare by junior year. Cannot simultaneously declare with the Graphic Design minor, Studio Art minor, or Studio Art major.",
      "The required ARTH course must be taken at SCU (excludes ARTH 11A, 12A, 194) — represented generically since it is 'any' ARTH course meeting that rule, not a fixed list.",
    ],
    groups: [
      { label: "Required: ARTS 30, ARTS 74, ARTS 81, ARTS 181", courses: ["ARTS 30", "ARTS 74", "ARTS 81", "ARTS 181"], minimumCourses: 4 },
      { label: "One 3D course", courses: ["ARTS 33", "ARTS 63", "ARTS 64"], minimumCourses: 1 },
      { label: "One ARTH course taken at SCU (excluding ARTH 11A, 12A, 194)", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Two electives", courses: ["ARTS 131", "ARTS 173", "ARTS 175", "ARTS 179", "ARTS 182", "COMM 30", "COMM 130"], minimumCourses: 2 },
      { label: "One additional studio ARTS course (excluding ARTS 190, 194, 196)", courses: [], minimumCourses: 1, needsVerification: true },
    ],
  },
  "ARTM-MIN": {
    code: "ARTM-MIN", title: "Arts Management",
    sourceUrl: CAS_BULLETIN_BASE + "art-and-art-history.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Art and Art History",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Must declare by junior year. Cannot simultaneously declare with the Art History minor or major.",
      "Also requires an internship at an arts organization and participation in a senior-year culminating event (non-course requirements, not represented as course groups).",
      "The three required ARTH 'Arts Management'-designated courses (at least one upper-division) are referenced by the Bulletin without a fixed course-number list — represented generically.",
    ],
    groups: [
      { label: "Three ARTH courses with the Arts Management designation (at least one upper-division)", courses: [], minimumCourses: 3, needsVerification: true },
      { label: "One English course (ENGL 100 preferred, or ENGL 101/112)", courses: ["ENGL 100", "ENGL 101", "ENGL 112"], minimumCourses: 1 },
      { label: "Two Management courses (MGMT 160 preferred, or MGMT 170/174)", courses: ["MGMT 160", "MGMT 170", "MGMT 174"], minimumCourses: 2 },
      { label: "One Marketing course (MKTG 181 preferred, or MKTG 186/190)", courses: ["MKTG 181", "MKTG 186", "MKTG 190"], minimumCourses: 1 },
    ],
  },
  "GRDS-MIN": {
    code: "GRDS-MIN", title: "Graphic Design",
    sourceUrl: CAS_BULLETIN_BASE + "art-and-art-history.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Art and Art History",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Must declare by junior year. Cannot simultaneously declare with the Animation and Illustration minor, Studio Art minor, or Studio Art major.",
      "ARTS 30 may be substituted with an approved upper-division equivalent. The required ARTH course must be taken at SCU (excludes ARTH 11A, 12A, 194) — represented generically.",
    ],
    groups: [
      { label: "Required: ARTS 30 (or approved upper-division equivalent), ARTS 70, ARTS 74", courses: ["ARTS 30", "ARTS 70", "ARTS 74"], minimumCourses: 3 },
      { label: "One 3D course", courses: ["ARTS 33", "ARTS 63", "ARTS 64"], minimumCourses: 1 },
      { label: "One ARTH course taken at SCU (excluding ARTH 11A, 12A, 194)", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Two electives", courses: ["ARTS 173", "ARTS 175", "ARTS 177", "ARTS 182"], minimumCourses: 2 },
      { label: "Two additional studio ARTS courses (excluding ARTS 190, 194, 199)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "One additional studio ARTS course (ARTS 75 recommended; excluding ARTS 190, 194, 196)", courses: [], minimumCourses: 1, needsVerification: true },
    ],
  },
  "TDTC-MIN": {
    code: "TDTC-MIN", title: "Theatre Design and Technology",
    sourceUrl: CAS_BULLETIN_BASE + "theatre-and-dance.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Theatre and Dance",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Distinct from the general Theatre minor; not available to Theatre Arts majors.",
      "Practicum requirement is an OR condition the schema below only approximates: either THTR 39/139 (4 units), or THTR 38 plus 2 units of THTR 39/139 with a mainstage production element — verify the exact combination with the department.",
    ],
    groups: [
      { label: "Required: THTR 10, THTR 30", courses: ["THTR 10", "THTR 30"], minimumCourses: 2 },
      { label: "One design course", courses: ["THTR 31", "THTR 32", "THTR 33", "THTR 36"], minimumCourses: 1 },
      { label: "Practicum: THTR 39/139 (4 units), or THTR 38 + 2 units of THTR 39/139", courses: ["THTR 38", "THTR 39", "THTR 139"], minimumUnits: 4 },
      { label: "Three or more upper-division design/tech courses", courses: ["THTR 130", "THTR 131", "THTR 132", "THTR 133", "THTR 134", "THTR 136", "THTR 137", "THTR 138"], minimumCourses: 3 },
    ],
  },
  "GERO-MIN": {
    code: "GERO-MIN", title: "Gerontology",
    sourceUrl: CAS_BULLETIN_BASE + "gerontology.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Gerontology",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "29 units total. Interdisciplinary minor — no more than 2 age-related courses from any single discipline may count.",
      "The Bulletin refers students to a maintained external document (not itself the Bulletin) for the complete current approved-course list — not fetched or transcribed here; verify directly with the department.",
    ],
    groups: [
      { label: "One lower-division introductory/aging course (e.g. PHSC 21, or intro anthropology/psychology/public health/sociology)", courses: [], minimumCourses: 1, needsVerification: true },
      { label: "Required upper-division: ANTH 172, PSYC 196", courses: ["ANTH 172", "PSYC 196"], minimumCourses: 2 },
      { label: "Two elective upper-division age-related courses (anthropology, biology, psychology, religious studies, or sociology)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Practicum: GERO 198 (100-hour service-learning/internship or equivalent)", courses: ["GERO 198"], minimumCourses: 1 },
    ],
  },
  "MHUM-MIN": {
    code: "MHUM-MIN", title: "Medical and Health Humanities",
    sourceUrl: CAS_BULLETIN_BASE + "medical-and-health-humanities.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Medical and Health Humanities",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "No individually required course — 7 total courses from a 40+ course approved list spanning 14 departments (Anthropology, Art and Art History, Classics, Communication, English, Gender and Sexuality Studies, History, Modern Languages, Philosophy, Public Health, Religious Studies, University Honors Program, and others). No more than 3 courses may come from the same department, and no more than 3 may be lower-division. Courses outside the published list may count with program-director approval.",
      "The 40+ course list is genuinely this open-ended by design (Bulletin's own words: 'courses not included in the list below may count... with approval') — represented as a generic 7-course requirement with its real distribution rules rather than an invented fixed list.",
    ],
    groups: [
      { label: "7 courses from the approved interdisciplinary list (max 3 per department, max 3 lower-division)", courses: [], minimumCourses: 7, needsVerification: true },
    ],
  },
  "BTEC-MIN": {
    code: "BTEC-MIN", title: "Biotechnology",
    sourceUrl: CAS_BULLETIN_BASE + "biotechnology.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Biotechnology",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "13 courses total. Also requires a research internship (10 weeks full-time, or 200-300 hours part-time) at a biotechnology company, research institute, or academic lab, plus a written report evaluated by the program director — a non-course requirement, not represented as a course group.",
      "BIOL 160, 170, 172, or 178 are strongly recommended for data-analysis/computational exposure but not separately required beyond the elective group below.",
    ],
    groups: [
      { label: "Scientific foundations: BIOL 1A, 1B, 1C, 175, CHEM 11, 12, 31, 32, 33", courses: ["BIOL 1A", "BIOL 1B", "BIOL 1C", "BIOL 175", "CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33"], minimumCourses: 9 },
      { label: "One ethics/contemporary-topics course", courses: ["BIOL 169", "BIOL 171"], minimumCourses: 1 },
      { label: "One additional ethics/contemporary-topics course", courses: ["BIOL 189A", "BIOL 189B"], minimumCourses: 1 },
      { label: "One advanced laboratory-skills course", courses: ["BIOL 176", "BIOL 177", "BIOL 191", "CHEM 143"], minimumCourses: 1 },
      { label: "One elective", courses: ["BIOL 110", "BIOL 111", "BIOL 112", "BIOL 113", "BIOL 116", "BIOL 122", "BIOL 123", "BIOL 145", "BIOL 160", "BIOL 172", "BIOL 174", "BIOL 178", "BIOL 179", "CHEM 141"], minimumCourses: 1 },
    ],
  },
  "MUTH-MIN": {
    code: "MUTH-MIN", title: "Musical Theatre",
    sourceUrl: CAS_BULLETIN_BASE + "musical-theatre.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Musical Theatre",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Joint minor between Music and Theatre and Dance. No Bulletin-stated total unit count.",
      "Singing requirement is MUSC 34 plus 3 quarters of on-campus private voice instruction (a placement test may substitute an additional 3 quarters of private instruction for MUSC 34 at higher proficiency) — the private-instruction component is not a standard course code.",
      "Dance-technique requirement is 4 units from DANC 40-47 'or higher level depending upon proficiency' — an open range, represented generically rather than enumerating every level.",
    ],
    groups: [
      { label: "Music Theory and Aural Skills (one course each; MUSC 1 and 1A suggested)", courses: ["MUSC 1", "MUSC 1A"], minimumCourses: 2 },
      { label: "Singing: MUSC 34 (plus private voice instruction, see notes)", courses: ["MUSC 34"], minimumCourses: 1 },
      { label: "One acting course", courses: ["THTR 8", "THTR 10", "THTR 24"], minimumCourses: 1 },
      { label: "Dance technique — 4 units (DANC 40-47 or higher by proficiency)", courses: [], minimumUnits: 4, needsVerification: true },
      { label: "Required: DANC 55/155", courses: ["DANC 55", "DANC 155"], minimumCourses: 1 },
      { label: "Two electives", courses: ["THTR 123", "THTR 165", "THTR 80", "THTR 180", "MUSC 153"], minimumCourses: 2 },
    ],
  },
  "RAI-MIN": {
    code: "RAI-MIN", title: "Responsible Artificial Intelligence",
    sourceUrl: SOE_BULLETIN_BASE + "computer-science-and-engineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Computer Science and Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "The 'Computing Foundation' requirement is satisfied by completing ONE of three whole tracks (CSEN, CSCI, or OMIS) — the three groups below are alternatives, not all three combined; pick one track's courses.",
      "The 4-unit elective requirement draws from an extensive ~24-course approved list spanning communication, philosophy, history, sociology, and engineering — not fully enumerated by the Bulletin excerpt reviewed; represented generically.",
    ],
    groups: [
      { label: "Computing foundation — Track A (CSEN)", courses: ["CSEN 10", "CSEN 11", "CSEN 12", "AMTH 108"], minimumCourses: 4 },
      { label: "Computing foundation — Track B (CSCI)", courses: ["CSCI 10", "CSCI 60", "CSCI 61", "CSCI 62", "CSEN 19"], minimumCourses: 5 },
      { label: "Computing foundation — Track C (OMIS)", courses: ["OMIS 30", "OMIS 114"], minimumCourses: 2 },
      { label: "Technology ethics", courses: ["ENGR 19", "PHIL 22"], minimumCourses: 1 },
      { label: "Required: PHIL 130 (Ethics in AI)", courses: ["PHIL 130"], minimumCourses: 1 },
      { label: "AI technology", courses: ["CSEN 166", "OMIS 116", "CSCI 183"], minimumCourses: 1 },
      { label: "Electives — at least 4 units (approved cross-disciplinary list)", courses: [], minimumUnits: 4, needsVerification: true },
    ],
  },
  "HCID-MIN": {
    code: "HCID-MIN", title: "Healthcare Innovation and Design",
    sourceUrl: SOE_BULLETIN_BASE + "bioengineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Bioengineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "21 units total across 4 components. Technical electives (2 courses, 8 units) must come from ONE topical theme: biodevice design (BIOE 106/163/168/174), biomolecular engineering (BIOE 175/176, BIOL 116/174/175/176/177/179), business/entrepreneurship (ECON 154, MGMT 165/177, MKTG 187/191, PHSC/SOCI 172), data science (BIOE 120/177A/177B/180, BIOL 170/178, CSCI 183/184, CSEN 140/166), design/prototyping (CSEN 168, ECEN 123/131, MECH 144), instrumentation (BIOE 161/162, CHEM 111, CSEN 143, ECEN 115/133/134/167), neuroscience (BIOL 122, PSYC 165/169), public health (PHSC 103/124, BIOL 106, PHSC 150/156, PSYC 167), or strategic communications (COMM 100/114/124/151/160/161H/173, ENGL 100/112, MKTG 179/182) — represented generically below rather than flattening all 9 themes into one combined list.",
      "Also requires a 5-unit healthcare-related capstone/supervised-research experiential activity and a 1-unit seminar/design-challenge elective — both have multiple qualifying options per the Bulletin, represented generically.",
    ],
    groups: [
      { label: "Foundational: MGMT 164, or 4 units from ENGR 110/166A/166B/171A/171B/172A/172B", courses: ["MGMT 164", "ENGR 110", "ENGR 166A", "ENGR 166B", "ENGR 171A", "ENGR 171B", "ENGR 172A", "ENGR 172B"], minimumUnits: 4 },
      { label: "Required: BIOE 111 (Introduction to Healthcare Innovation)", courses: ["BIOE 111"], minimumCourses: 1 },
      { label: "Two technical electives from one approved topical theme (see notes)", courses: [], minimumCourses: 2, needsVerification: true },
      { label: "Experiential activity: healthcare-related capstone or supervised research (5 units)", courses: [], minimumUnits: 5, needsVerification: true },
      { label: "Seminar/design-challenge elective (1 unit)", courses: [], minimumUnits: 1, needsVerification: true },
    ],
  },
  "CNST-MIN": {
    code: "CNST-MIN", title: "Construction Management",
    sourceUrl: SOE_BULLETIN_BASE + "civil-environmental-and-sustainable-engineering.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Civil, Environmental, and Sustainable Engineering",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "Up to 14 units may 'double-dip' to concurrently satisfy major or University Core requirements.",
      "Mechanical Engineering students may satisfy the CENG 7/7L requirement with MECH 10L/12L instead.",
    ],
    groups: [
      { label: "Required: CENG 7, CENG 7L, CENG 115, CENG 115L", courses: ["CENG 7", "CENG 7L", "CENG 115", "CENG 115L"], minimumCourses: 4 },
      { label: "Required: CENG 118 or CENG 128", courses: ["CENG 118", "CENG 128"], minimumCourses: 1 },
      { label: "Two courses from CENG 185, 186, 187", courses: ["CENG 185", "CENG 186", "CENG 187"], minimumCourses: 2 },
      { label: "Two electives", courses: ["CENG 119", "CENG 182", "CENG 188", "CENG 189", "ECEN 164", "ECEN 164L", "ECEN 182", "ECEN 183", "MECH 125", "MECH 160", "MECH 160L", "FNCE 118", "FNCE 129", "ENVS 128"], minimumCourses: 2 },
    ],
  },
  "INTB-MIN": {
    code: "INTB-MIN", title: "International Business",
    sourceUrl: LSB_BULLETIN_BASE + "international-business.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — International Business",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "No corresponding major exists — minor only.",
      "Students with existing language competency may satisfy the language requirement with a more advanced 100/101-level course instead of the listed option.",
    ],
    groups: [
      { label: "Foreign language (one course)", courses: ["ARAB 23", "CHIN 23", "FREN 100", "GERM 100", "ITAL 100", "JAPN 23", "SPAN 23"], minimumCourses: 1 },
      { label: "Business fundamentals: BUSN 70/170, ACTG 11/11A, ECON 1, ECON 2, ECON 3, MGMT 80, MGMT 136/6", courses: ["BUSN 70", "BUSN 170", "ACTG 11", "ACTG 11A", "ECON 1", "ECON 2", "ECON 3", "MGMT 80", "MGMT 136", "MGMT 6"], minimumCourses: 6 },
      { label: "Two upper-division international business courses", courses: ["FNCE 151", "MGMT 110", "MGMT 170", "MGMT 177", "MKTG 178", "ECON 181", "ECON 182", "ECON 184"], minimumCourses: 2 },
    ],
  },
  "SFS-MIN": {
    code: "SFS-MIN", title: "Sustainable Food Systems",
    sourceUrl: LSB_BULLETIN_BASE + "sustainable-food-systems.html",
    sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Sustainable Food Systems",
    catalogYear: BULLETIN_2026_27, lastVerified: VERIFIED_MINOR_DATE_2,
    notes: [
      "No corresponding major exists — minor only. 7 courses total; at least 4 must be upper-division, and no more than 3 may come from a student's own major.",
      "Courses in the Experiential Learning group marked with an asterisk in the Bulletin (MGMT 132, BUSN 188, ELSJ 134/135, ENVS 95, ENVS 195) require prior program-director approval.",
    ],
    groups: [
      { label: "Cultural/Societal Dimension (choose 2)", courses: ["ANTH 5", "ANTH 50", "ENVS 50", "POLI 50", "ANTH 140", "ENVS 136", "BIOL 106", "PHSC 124", "ENVS 79", "ENVS 185", "ITAL 101", "MGMT 110", "SOCI 132"], minimumCourses: 2 },
      { label: "Sustainable Development Dimension (choose 2)", courses: ["ANTH 133", "ANTH 138", "ENVS 132", "BUSN 150", "CENG 124", "ENVS 124", "ECON 135", "ENVS 22", "ENVS 146", "ENVS 147", "MGMT 110", "PHSC 1", "POLI 123"], minimumCourses: 2 },
      { label: "Innovation and Change Dimension (choose 2)", courses: ["ANTH 137", "BIOL 18", "ECON 101", "MGMT 173", "ECON 134", "ENGR 161", "MGMT 177", "ENVS 155", "MGMT 40", "MGMT 42", "MGMT 172", "MGMT 176", "MKTG 187", "SOCI 60", "SOCI 130"], minimumCourses: 2 },
      { label: "Experiential Learning Dimension (choose 1, some require program-director approval)", courses: ["MGMT 132", "BUSN 151A", "BUSN 151B", "BUSN 183A", "BUSN 183B", "BUSN 183C", "BUSN 188", "ELSJ 134", "ELSJ 135", "ENVS 95", "ENVS 191", "ENVS 195"], minimumCourses: 1 },
    ],
  },
};

export function getMinorRequirements(codeOrTitle: string): MinorRecipe | null {
  const normalized = codeOrTitle.trim().toUpperCase();
  const byCode = MINOR_RECIPES[normalized];
  if (byCode) return byCode;
  const option = MINORS.find((minor) => minor.title.toUpperCase() === normalized);
  return option ? MINOR_RECIPES[option.code] ?? null : null;
}
