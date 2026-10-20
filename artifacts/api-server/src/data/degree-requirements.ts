import type { College } from "./graduation-paths";

/**
 * College-aware SCU degree requirements.
 *
 * Every requirement group carries the official SCU source URL it was taken
 * from, the academic year of that source, and the date it was last verified
 * against the source. Nothing here is invented: where SCU says "choose from
 * an approved list", the item is flagged `needsVerification` and the UI lets
 * the student check it off manually instead of us fabricating a course list.
 *
 * Official sources used (verified 2026-07-23):
 * - University Core Curriculum: SCU Undergraduate Bulletin, Chapter 2
 *   https://www.scu.edu/bulletin/undergraduate/chapter-2-transformative-experiences-and-learning-resources/the-core-curriculum.html
 * - University degree requirements (units, GPA, residency): Bulletin Chapter 8
 *   https://www.scu.edu/bulletin/undergraduate/chapter-8-academic-and-administrative-policies-and-regulations/degree-requirements.html
 * - Leavey School of Business core: https://www.scu.edu/business/undergraduates/core/
 *   and Bulletin Chapter 4 (Undergraduate Degrees)
 * - School of Engineering: Bulletin Chapter 5 (Undergraduate Degrees) and
 *   https://www.scu.edu/engineering/current-student-resources/current-undergraduate-students/advising-resources/core-requirements/
 * - College of Arts and Sciences: Bulletin Chapter 3 (major listings)
 */

export const SOURCES = {
  coreCurriculum:
    "https://www.scu.edu/bulletin/undergraduate/chapter-2-transformative-experiences-and-learning-resources/the-core-curriculum.html",
  degreeRequirements:
    "https://www.scu.edu/bulletin/undergraduate/chapter-8-academic-and-administrative-policies-and-regulations/degree-requirements.html",
  leaveyCore: "https://www.scu.edu/business/undergraduates/core/",
  leaveyBulletin:
    "https://www.scu.edu/bulletin/undergraduate/chapter-4-leavey-school-of-business/undergraduate-degrees.html",
  engineeringBulletin:
    "https://www.scu.edu/bulletin/undergraduate/chapter-5-school-of-engineering/undergraduate-degrees.html",
  engineeringCore:
    "https://www.scu.edu/engineering/current-student-resources/current-undergraduate-students/advising-resources/core-requirements/",
  casBulletin:
    "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/index.html",
} as const;

const ACADEMIC_YEAR = "2025-26 / 2026-27 Undergraduate Bulletin";
const LAST_VERIFIED = "2026-07-23";

export interface RequirementItemDef {
  id: string;
  label: string;
  description: string;
  /** Concrete SCU course codes that satisfy this item (any one of them). Empty when SCU says "choose from an approved list". */
  courses: string[];
  /**
   * True when the item can (also) be satisfied from an approved list we do
   * not reproduce — the student may check it off manually. Items may be
   * hybrid: a known course list plus an approved-list alternative (e.g.
   * Leavey C&I 3: MGMT 80 or any approved C&I 3 course).
   */
  needsVerification: boolean;
  phase?: "Foundations" | "Explorations" | "Integrations";
  /**
   * Course SETS, any one of which satisfies the item when every course in it is
   * complete ("OMIS 41, or ECON 41 and ECON 42"). When present, `courses` is
   * the union of the sets and completion follows the sets, not "any one course".
   */
  routes?: { label: string; courses: string[] }[];
}

export interface RequirementGroupDef {
  id: string;
  title: string;
  kind: "university" | "university_core" | "college" | "major";
  sourceUrl: string;
  sourceLabel: string;
  academicYear: string;
  lastVerified: string;
  notes: string[];
  items: RequirementItemDef[];
}

/** Display name of each school, as SCU writes it. */
export const SCHOOL_NAME: Record<College, string> = {
  CAS: "College of Arts and Sciences",
  LSB: "Leavey School of Business",
  SOE: "School of Engineering",
};

/**
 * The programs in a plan, as canonical codes. School requirements and their
 * program-specific variants (the Accounting STS route, Economics' ECON 41 + 42)
 * are chosen from these, never from a course prefix or a hard-coded major name.
 */
export interface PlanProgramContext {
  /** Major codes ("FNCE", "ECON", "ECON_CAS"). */
  majors: string[];
  /** Minor codes ("MIS-MIN"). */
  minors: string[];
}

const EMPTY_PROGRAMS: PlanProgramContext = { majors: [], minors: [] };

// ---------------------------------------------------------------------------
// School-specific University Core fulfillment.
//
// The University Core is ONE requirement set for every undergraduate. A school
// may prescribe HOW its students fulfil a Core area (Leavey: "Social Science:
// ECON 1"). That is an overlay on the shared Core item, never a second Core and
// never a reason to file the item under SCHOOL or MAJOR: the item stays CORE and
// carries the school's statement as an annotation, with its source.
//
// Only statements the school's official page makes are here. A route names the
// course sets SCU says satisfy the area: the area counts as completed only when
// every part of a route has a completed course, and as planned when every part
// is completed or planned. Choosing a Leavey major never completes anything.
// ---------------------------------------------------------------------------

export interface CoreFulfillmentRoute {
  /** "MGMT 162 with MGMT 136, MGMT 6 or PHIL 109". */
  label: string;
  /** One course from EACH part. A single part is "any one of these". */
  parts: string[][];
}

export interface SchoolCoreFulfillmentDef {
  id: string;
  school: College;
  /** The University Core item it describes ("socsci"). */
  coreItemId: string;
  /** The school's statement about the area, in its own words. */
  text: string;
  /** Course routes SCU names. Empty: guidance only (choose from the approved list). */
  routes: CoreFulfillmentRoute[];
  /**
   * True when the routes ARE the school's requirement for the area (no separate
   * approved list): the item then needs no manual verification.
   */
  definitive: boolean;
  /** Leavey School requirement items the same course also satisfies (a genuine overlap). */
  schoolRequirementIds: string[];
  /** Who it applies to, when not every student of the school ("Accounting majors"). */
  programScope: string | null;
  /** Applies to the plan only when this returns true (program-specific rules). */
  appliesTo?: (programs: PlanProgramContext) => boolean;
  sourceLabel: string;
  sourceUrl: string;
  academicYear: string;
  lastVerified: string;
}

const LEAVEY_CORE_PAGE = {
  sourceLabel: "Leavey School of Business — Core Curriculum for business students",
  sourceUrl: "https://www.scu.edu/business/undergraduates/core/",
  // The page states no edition; it was read and compared with this data on the date below.
  academicYear: "Current (page states no academic year)",
  lastVerified: "2026-10-20",
};

const hasMajor = (programs: PlanProgramContext, ...codes: string[]) => programs.majors.some((m) => codes.includes(m));
const hasMinor = (programs: PlanProgramContext, ...codes: string[]) => programs.minors.some((m) => codes.includes(m));
/** "Students who declare a major or a minor in management information systems". */
const isMisStudent = (programs: PlanProgramContext) => hasMajor(programs, "OMIS") || hasMinor(programs, "MIS-MIN");

export const LEAVEY_CORE_FULFILLMENTS: SchoolCoreFulfillmentDef[] = [
  {
    id: "lsb-core-math",
    school: "LSB",
    coreItemId: "math",
    text: "MATH 30 or MATH 11. Most business students take the calculus for business course: MATH 30. MATH 35 can be used to satisfy this requirement for business majors who have a second major in the life sciences.",
    routes: [
      { label: "MATH 30", parts: [["MATH 30"]] },
      { label: "MATH 11", parts: [["MATH 11"]] },
    ],
    definitive: true,
    schoolRequirementIds: [],
    programScope: null,
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-math-finance",
    school: "LSB",
    coreItemId: "math",
    text: "Finance students: MATH 11 or MATH 30, and MATH 12 or MATH 31 or FNCE 186. The second course is tracked under the Finance major requirements.",
    routes: [],
    definitive: true,
    schoolRequirementIds: [],
    programScope: "Finance majors",
    appliesTo: (p) => hasMajor(p, "FNCE"),
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-math-economics",
    school: "LSB",
    coreItemId: "math",
    text: "Economics students: MATH 11 or MATH 30, and MATH 12 or MATH 31. The second course is tracked under the Economics major requirements.",
    routes: [],
    definitive: true,
    schoolRequirementIds: [],
    programScope: "Economics (B.S. Commerce) majors",
    appliesTo: (p) => hasMajor(p, "ECON"),
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-civic",
    school: "LSB",
    coreItemId: "civic",
    text: "MGMT 162 and MGMT 136 (or MGMT 6) or PHIL 109.",
    routes: [{ label: "MGMT 162 with MGMT 136, MGMT 6 or PHIL 109", parts: [["MGMT 162"], ["MGMT 136", "MGMT 6", "PHIL 109"]] }],
    definitive: true,
    schoolRequirementIds: ["lsb-mgmt162"],
    programScope: null,
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-ci3",
    school: "LSB",
    coreItemId: "ci3",
    text: "Cultures & Ideas 3 with MGMT 80 when the course is taken on the SCU campus. When MGMT 80 is not taken on the SCU campus, students choose from a list of approved courses.",
    routes: [{ label: "MGMT 80 (on the SCU campus)", parts: [["MGMT 80"]] }],
    definitive: false,
    schoolRequirementIds: [],
    programScope: null,
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-ethics",
    school: "LSB",
    coreItemId: "ethics",
    text: "One business ethics course: MGMT 136 (preferred, or MGMT 6) or PHIL 109.",
    routes: [
      { label: "MGMT 136", parts: [["MGMT 136"]] },
      { label: "MGMT 6", parts: [["MGMT 6"]] },
      { label: "PHIL 109", parts: [["PHIL 109"]] },
    ],
    definitive: true,
    schoolRequirementIds: [],
    programScope: null,
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-sts",
    school: "LSB",
    coreItemId: "sts",
    text: "Science, Technology, and Society: OMIS 34.",
    routes: [{ label: "OMIS 34", parts: [["OMIS 34"]] }],
    definitive: false,
    schoolRequirementIds: ["lsb-omis34"],
    programScope: null,
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-sts-accounting",
    school: "LSB",
    coreItemId: "sts",
    text: "Students who are considering a major in accounting should take ACTG 134 to satisfy the Science, Technology, and Society requirement.",
    routes: [{ label: "ACTG 134", parts: [["ACTG 134"]] }],
    definitive: false,
    schoolRequirementIds: ["lsb-omis34"],
    programScope: "Accounting majors",
    appliesTo: (p) => hasMajor(p, "ACTG"),
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-sts-mis",
    school: "LSB",
    coreItemId: "sts",
    text: "Students who declare a major or a minor in management information systems will take OMIS 30 or OMIS 31, which will satisfy the information systems requirement in the business core, and may choose a course to satisfy Science, Technology, and Society from the list of approved courses.",
    routes: [],
    definitive: false,
    schoolRequirementIds: [],
    programScope: "Management information systems majors and minors",
    appliesTo: isMisStudent,
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-socsci",
    school: "LSB",
    coreItemId: "socsci",
    text: "Social Science: ECON 1.",
    routes: [{ label: "ECON 1", parts: [["ECON 1"]] }],
    definitive: true,
    schoolRequirementIds: ["lsb-econ1"],
    programScope: null,
    ...LEAVEY_CORE_PAGE,
  },
  {
    id: "lsb-core-advwriting",
    school: "LSB",
    coreItemId: "advwriting",
    text: "Advanced Writing: BUSN 179.",
    routes: [{ label: "BUSN 179", parts: [["BUSN 179"]] }],
    definitive: true,
    schoolRequirementIds: [],
    programScope: null,
    ...LEAVEY_CORE_PAGE,
  },
];

/**
 * The school Core fulfillments that apply to a plan: one school's statements
 * apply whenever that school is among the plan's schools (a Biology + Finance
 * plan gets Leavey's), narrowed by program where SCU narrows them.
 */
export function schoolCoreFulfillments(
  schools: readonly College[],
  programs: PlanProgramContext = EMPTY_PROGRAMS,
): SchoolCoreFulfillmentDef[] {
  return LEAVEY_CORE_FULFILLMENTS.filter(
    (def) => schools.includes(def.school) && (def.appliesTo ? def.appliesTo(programs) : true),
  );
}

// ---------------------------------------------------------------------------
// University Core Curriculum: one requirement set for ALL SCU undergraduates.
// The primary school decides only what the Bulletin makes school-dependent for
// the Core itself (the engineering Pathway count and double-dipping rule);
// schools' fulfillment statements are overlays (above), not a different Core.
// ---------------------------------------------------------------------------

function universityCore(college: College): RequirementGroupDef {
  const engineering = college === "SOE";

  const items: RequirementItemDef[] = [
    {
      id: "ctw1",
      label: "Critical Thinking & Writing 1",
      description:
        "First course of the two-quarter CTW sequence. Must be completed at SCU for students admitted as first-years.",
      courses: [],
      needsVerification: true,
      phase: "Foundations",
    },
    {
      id: "ctw2",
      label: "Critical Thinking & Writing 2",
      description: "Second course of the CTW sequence, taken in order.",
      courses: [],
      needsVerification: true,
      phase: "Foundations",
    },
    {
      id: "ci1",
      label: "Cultures & Ideas 1",
      description: "First course of the two-quarter C&I sequence.",
      courses: [],
      needsVerification: true,
      phase: "Foundations",
    },
    {
      id: "ci2",
      label: "Cultures & Ideas 2",
      description: "Second course of the C&I sequence, taken in order.",
      courses: [],
      needsVerification: true,
      phase: "Foundations",
    },
    {
      id: "math",
      label: "Mathematics",
      description: "One approved mathematics course. STEM majors typically satisfy this within the major's calculus sequence.",
      courses: [],
      needsVerification: true,
      phase: "Foundations",
    },
    {
      id: "rtc1",
      label: "Religion, Theology & Culture 1",
      description:
        "First of three RTC courses. First-year admits must take all three in sequential order.",
      courses: [],
      needsVerification: true,
      phase: "Foundations",
    },
    {
      id: "lang",
      label: "Second Language",
      description:
        "Proficiency requirement; the level varies by major. Satisfiable by coursework, a proficiency exam, or AP score of 4+ in a classical or modern language.",
      courses: [],
      needsVerification: true,
      phase: "Foundations",
    },
    {
      id: "arts",
      label: "Arts",
      description: "One course from the approved Arts list.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "civic",
      label: "Civic Engagement",
      description: "One course from the approved Civic Engagement list. Must be completed at SCU.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "ci3",
      label: "Cultures & Ideas 3",
      description: "One course from the approved C&I 3 list.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "diversity",
      label: "Diversity: U.S. Perspectives",
      description: "One course from the approved Diversity list.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "ethics",
      label: "Ethics",
      description: "One course from the approved Ethics list.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "natsci",
      label: "Natural Science",
      description: "One approved natural science course. STEM/engineering majors typically satisfy this within the major.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "rtc2",
      label: "Religion, Theology & Culture 2",
      description: "Second RTC course, in sequence. Must be completed at SCU.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "rtc3",
      label: "Religion, Theology & Culture 3",
      description: "Third RTC course, in sequence. Must be completed at SCU.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "sts",
      label: "Science, Technology & Society",
      description: "One course from the approved STS list. Must be completed at SCU.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "socsci",
      label: "Social Science",
      description: "One course from the approved Social Science list.",
      courses: [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "advwriting",
      label: "Advanced Writing",
      description: "Upper-division writing course in your discipline. Must be completed at SCU.",
      courses: [],
      needsVerification: true,
      phase: "Integrations",
    },
    {
      id: "elsj",
      label: "Experiential Learning for Social Justice",
      description:
        "Community-based learning course from the approved ELSJ list. Must be completed at SCU.",
      courses: [],
      needsVerification: true,
      phase: "Integrations",
    },
    {
      id: "pathway",
      label: engineering ? "Pathway (3 courses, at least 12 units)" : "Pathway (4 courses, at least 16 units)",
      description: engineering
        ? "Engineering majors complete three Pathway courses (at least 12 units) in one declared Pathway. Declare by end of second year."
        : "CAS and Leavey majors complete four Pathway courses (at least 16 units) in one declared Pathway. Declare by end of second year.",
      courses: [],
      needsVerification: true,
      phase: "Integrations",
    },
  ];

  const notes: string[] = [
    "Core requirements that must be completed at SCU (per the Bulletin): Civic Engagement; Science, Technology & Society; Religion, Theology & Culture; Advanced Writing; ELSJ; and Pathways.",
  ];
  if (engineering) {
    notes.push(
      "School of Engineering students may satisfy more than one Core requirement with a single course when that course is approved for both Core areas (\"double-dipping\").",
    );
  } else {
    notes.push(
      "CAS and Leavey students satisfy Foundations and Explorations with one course per Core area (Second Language may require more than one course).",
    );
  }
  return {
    id: "university-core",
    title: "University Core Curriculum",
    kind: "university_core",
    sourceUrl: SOURCES.coreCurriculum,
    sourceLabel: "SCU Undergraduate Bulletin, Ch. 2: The Core Curriculum",
    academicYear: ACADEMIC_YEAR,
    lastVerified: LAST_VERIFIED,
    notes,
    items,
  };
}

// ---------------------------------------------------------------------------
// College / school specific requirements
// ---------------------------------------------------------------------------

function collegeGroup(college: College, programs: PlanProgramContext = EMPTY_PROGRAMS): RequirementGroupDef {
  if (college === "LSB") {
    // The Bulletin's program-specific routes. ACTG 134 is the information
    // systems course for accounting students; OMIS 30 or 31 for students with a
    // management information systems major or minor (and, per the AIS major's
    // own text, accounting and information systems majors). They are NOT routes
    // for every business major, so they are offered only to those programs.
    const isRoutes = [
      "OMIS 34",
      ...(hasMajor(programs, "ACTG") ? ["ACTG 134"] : []),
      ...(isMisStudent(programs) || hasMajor(programs, "AIS") ? ["OMIS 30", "OMIS 31"] : []),
    ];
    // "OMIS 40 and 41 or OMIS 40 and ECON 41 and 42 (for economics majors)" —
    // Leavey Economics only; CAS Economics (ECON_CAS) has no Leavey core at all.
    const economics = hasMajor(programs, "ECON");
    return {
      id: "college-lsb",
      title: "Leavey School of Business Requirements",
      kind: "college",
      sourceUrl: SOURCES.leaveyBulletin,
      sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Leavey School of Business Core Curriculum (lower and upper division)",
      academicYear: "2026-27",
      lastVerified: "2026-10-09",
      notes: [
        "Degree: Bachelor of Science in Commerce — minimum 175 quarter units, of which at least 60 must be upper-division.",
        "The Leavey School of Business core (lower division, the upper-division Common Core of Knowledge, and the MGMT 162 capstone) is required of every business major regardless of department.",
      ],
      items: [
        {
          id: "lsb-busn70",
          label: "Contemporary Business Issues",
          description: "BUSN 70 — taken first year (unless internal/external transfer).",
          courses: ["BUSN 70"],
          needsVerification: false,
        },
        {
          id: "lsb-omis15",
          label: "Introduction to Spreadsheets",
          description: "OMIS 15.",
          courses: ["OMIS 15"],
          needsVerification: false,
        },
        {
          id: "lsb-busn85",
          label: "Business Law",
          description: "BUSN 85.",
          courses: ["BUSN 85"],
          needsVerification: false,
        },
        {
          id: "lsb-econ1",
          label: "Principles of Microeconomics",
          description: "ECON 1 (also satisfies the Core Social Science area).",
          courses: ["ECON 1"],
          needsVerification: false,
        },
        {
          id: "lsb-econ2",
          label: "Principles of Macroeconomics",
          description: "ECON 2.",
          courses: ["ECON 2"],
          needsVerification: false,
        },
        {
          id: "lsb-econ3",
          label: "International Economics, Development, and Growth",
          description: "ECON 3.",
          courses: ["ECON 3"],
          needsVerification: false,
        },
        {
          id: "lsb-mgmt71",
          label: "Foundations of Leadership",
          description:
            "MGMT 71 (with MGMT 72 and MGMT 196; external transfers with 44+ units take MGMT 174 instead).",
          courses: ["MGMT 71", "MGMT 174"],
          needsVerification: false,
        },
        {
          id: "lsb-mgmt72",
          label: "Values-Driven Leadership in Silicon Valley",
          description: "MGMT 72 (not required for MGMT 174 transfer path).",
          courses: ["MGMT 72", "MGMT 174"],
          needsVerification: false,
        },
        {
          id: "lsb-actg11",
          label: "Introduction to Financial Accounting",
          description: "ACTG 11 — typically sophomore fall or winter.",
          courses: ["ACTG 11"],
          needsVerification: false,
        },
        {
          id: "lsb-actg12",
          label: "Introduction to Managerial Accounting",
          description: "ACTG 12 — the quarter after ACTG 11.",
          courses: ["ACTG 12"],
          needsVerification: false,
        },
        {
          id: "lsb-omis40",
          label: "Statistics and Data Analysis 1",
          description: "OMIS 40.",
          courses: ["OMIS 40"],
          needsVerification: false,
        },
        {
          id: "lsb-omis41",
          label: "Statistics and Data Analysis 2",
          description: "OMIS 41, or ECON 41 and 42 for economics majors (OMIS 40 and 41 or OMIS 40 and ECON 41 and 42).",
          courses: economics ? ["OMIS 41", "ECON 41", "ECON 42"] : ["OMIS 41"],
          needsVerification: false,
          ...(economics
            ? {
                routes: [
                  { label: "OMIS 41", courses: ["OMIS 41"] },
                  { label: "ECON 41 and ECON 42 (economics majors)", courses: ["ECON 41", "ECON 42"] },
                ],
              }
            : {}),
        },
        {
          id: "lsb-omis34",
          label: "Information Systems",
          description:
            "OMIS 34. Students considering an accounting major should take ACTG 134; students who declare a major or a minor in management information systems take OMIS 30 or OMIS 31, which satisfies the information systems requirement in the business core.",
          courses: isRoutes,
          needsVerification: false,
        },
        {
          id: "lsb-mgmt196",
          label: "Leadership: MGMT 196",
          description:
            "MGMT 196 — Leadership (with MGMT 71 and MGMT 72) and the upper-division Common Core of Knowledge. External transfers with 44+ units take MGMT 174 instead.",
          courses: ["MGMT 196", "MGMT 174"],
          needsVerification: false,
        },
        {
          id: "lsb-fnce121",
          label: "Common Core: FNCE 121",
          description: "Upper-division Common Core of Knowledge.",
          courses: ["FNCE 121"],
          needsVerification: false,
        },
        {
          id: "lsb-mgmt160",
          label: "Common Core: MGMT 160",
          description: "Upper-division Common Core of Knowledge.",
          courses: ["MGMT 160"],
          needsVerification: false,
        },
        {
          id: "lsb-mktg181",
          label: "Common Core: MKTG 181",
          description: "Upper-division Common Core of Knowledge.",
          courses: ["MKTG 181"],
          needsVerification: false,
        },
        {
          id: "lsb-omis108",
          label: "Common Core: OMIS 108",
          description: "Upper-division Common Core of Knowledge.",
          courses: ["OMIS 108"],
          needsVerification: false,
        },
        {
          id: "lsb-mgmt162",
          label: "Capstone: MGMT 162",
          description: "One course, to be taken with senior standing.",
          courses: ["MGMT 162"],
          needsVerification: false,
        },
      ],
    };
  }

  if (college === "SOE") {
    return {
      id: "college-soe",
      title: "School of Engineering Requirements",
      kind: "college",
      sourceUrl: SOURCES.engineeringBulletin,
      sourceLabel: "SCU Bulletin Ch. 5: School of Engineering + SOE Core Requirements page",
      academicYear: ACADEMIC_YEAR,
      lastVerified: LAST_VERIFIED,
      notes: [
        "Degree: Bachelor of Science in the major field. The minimum number of quarter units is specified by each major department (Bulletin Ch. 8) — engineering programs typically exceed the university's 175-unit floor.",
        "Each engineering major's mathematics, natural science, and engineering-core coursework is defined by that major's curriculum chart in Bulletin Chapter 5; those courses appear under Major Requirements below.",
        "Engineering majors complete three Pathway courses (12+ units) rather than four, and may double-dip approved Core courses (see University Core notes).",
      ],
      items: [
        {
          id: "soe-curriculum",
          label: "Major curriculum chart (math, science & engineering core)",
          description:
            "Complete the mathematics, natural science, and engineering coursework on your major's official curriculum chart in Bulletin Chapter 5. Tracked per-course under Major Requirements.",
          courses: [],
          needsVerification: true,
        },
        {
          id: "soe-units",
          label: "Unit minimum set by major department",
          description:
            "Meet the total unit minimum your department specifies for the B.S. degree (verify on your major's Bulletin Ch. 5 page and in Workday).",
          courses: [],
          needsVerification: true,
        },
      ],
    };
  }

  return {
    id: "college-cas",
    title: "College of Arts and Sciences Requirements",
    kind: "college",
    sourceUrl: SOURCES.degreeRequirements,
    sourceLabel: "SCU Bulletin Ch. 8: Degree Requirements + Ch. 3 (CAS)",
    academicYear: ACADEMIC_YEAR,
    lastVerified: LAST_VERIFIED,
    notes: [
      "Degree: Bachelor of Arts or Bachelor of Science — minimum 175 quarter units (193 for engineering physics), of which at least 60 must be upper-division.",
      "CAS does not impose a separate college-wide course list beyond the University Core; degree coursework beyond the Core is defined by the major department (Bulletin Ch. 3). B.A. programs carry a higher second-language proficiency expectation than B.S. programs.",
    ],
    items: [
      {
        id: "cas-units",
        label: "175 quarter units (min), 60 upper-division",
        description:
          "Complete at least 175 quarter units (193 for engineering physics) including 60 upper-division units.",
        courses: [],
        needsVerification: true,
      },
      {
        id: "cas-major",
        label: "Departmental major requirements",
        description:
          "Complete the requirements of your declared major department (tracked under Major Requirements below).",
        courses: [],
        needsVerification: true,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// University-wide degree rules (Chapter 8) — same for everyone; surfaced as
// notes on the response so the UI can show them with their source.
// ---------------------------------------------------------------------------

/**
 * University-wide degree rules (Bulletin Ch. 8), the same for every student.
 * One entry per rule with a stable id: the sidebar shows them as the
 * UNIVERSITY requirements group, and `UNIVERSITY_DEGREE_RULES` (the plain
 * sentences the Core requirements page lists) is derived from the same list so
 * the two cannot drift.
 */
const UNIVERSITY_RULES: { id: string; label: string; text: string }[] = [
  {
    id: "minimum-units",
    label: "Minimum quarter units",
    text: "Minimum 175 quarter units for the B.A./B.S. (CAS) and B.S. in Commerce (Leavey); engineering unit minimums are set by the major department (193 for engineering physics).",
  },
  {
    id: "upper-division-units",
    label: "Upper-division units",
    text: "At least 60 quarter units of upper-division coursework.",
  },
  {
    id: "minimum-gpa",
    label: "Minimum GPA",
    text: "Minimum 2.0 GPA overall at SCU and in the major (and any minor).",
  },
  {
    id: "residency",
    label: "Residency",
    text: "Residency: at least 45 units at Santa Clara after reaching junior standing.",
  },
  {
    id: "transfer-credit-cap",
    label: "Transfer and test credit limit",
    text: "No more than half of the required units may come from transfer and/or test credit.",
  },
];

export const UNIVERSITY_DEGREE_RULES: string[] = UNIVERSITY_RULES.map((rule) => rule.text);

/**
 * The UNIVERSITY group: degree-level rules, not courses. Nothing in it can be
 * completed by a course, so every item stays open and "needs verification";
 * Workday's APR is the record of whether they are met.
 */
function universityRequirements(): RequirementGroupDef {
  return {
    id: "university-requirements",
    title: "University Degree Requirements",
    kind: "university",
    sourceUrl: SOURCES.degreeRequirements,
    sourceLabel: "SCU Bulletin Ch. 8: Degree Requirements",
    academicYear: ACADEMIC_YEAR,
    lastVerified: LAST_VERIFIED,
    notes: [
      "Degree-level rules that apply to every undergraduate. They are not courses, so CampusVal does not mark them complete: your Workday Academic Progress Report is the record of whether they are met.",
    ],
    items: UNIVERSITY_RULES.map((rule) => ({
      id: `university-requirements-${rule.id}`,
      label: rule.label,
      description: rule.text,
      courses: [],
      needsVerification: true,
    })),
  };
}

/**
 * The requirement groups every plan shares, for a SET of schools.
 *
 * `primaryCollege` is the school of the plan's primary major: it decides only
 * the Core's own school-dependent rules (the engineering Pathway count). The
 * `schools` are every school any of the plan's MAJORS belongs to, primary first,
 * each once: each contributes its own school requirements, and its Core
 * fulfillment statements overlay the one shared University Core. A Biology +
 * Finance plan therefore gets the College of Arts and Sciences AND the Leavey
 * School of Business requirements, and one University Core.
 */
export function buildRequirementGroups(
  primaryCollege: College,
  schools: readonly College[] = [primaryCollege],
  programs: PlanProgramContext = EMPTY_PROGRAMS,
): {
  university: RequirementGroupDef;
  universityCore: RequirementGroupDef;
  schools: RequirementGroupDef[];
  coreFulfillments: SchoolCoreFulfillmentDef[];
} {
  const distinct = [...new Set(schools)];
  return {
    university: universityRequirements(),
    universityCore: universityCore(primaryCollege),
    schools: distinct.map((school) => collegeGroup(school, programs)),
    coreFulfillments: schoolCoreFulfillments(distinct, programs),
  };
}
