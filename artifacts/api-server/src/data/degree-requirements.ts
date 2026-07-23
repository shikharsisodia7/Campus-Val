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
}

export interface RequirementGroupDef {
  id: string;
  title: string;
  kind: "university_core" | "college" | "major";
  sourceUrl: string;
  sourceLabel: string;
  academicYear: string;
  lastVerified: string;
  notes: string[];
  items: RequirementItemDef[];
}

// ---------------------------------------------------------------------------
// University Core Curriculum (applies to ALL SCU undergraduates), with the
// documented per-college fulfillment differences from official SCU sources.
// ---------------------------------------------------------------------------

function universityCore(college: College): RequirementGroupDef {
  const leavey = college === "LSB";
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
      description: leavey
        ? "Leavey students take MATH 30 (business calculus) or MATH 11. Finance and Economics majors also need MATH 12/31 (or FNCE 186 for Finance). MATH 35 allowed with a life-science second major."
        : "One approved mathematics course. STEM majors typically satisfy this within the major's calculus sequence.",
      courses: leavey ? ["MATH 30", "MATH 11"] : [],
      needsVerification: !leavey,
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
      description: leavey
        ? "Leavey students satisfy Civic Engagement with MGMT 162 together with MGMT 136 (or MGMT 6) or PHIL 109."
        : "One course from the approved Civic Engagement list. Must be completed at SCU.",
      courses: leavey ? ["MGMT 162"] : [],
      needsVerification: !leavey,
      phase: "Explorations",
    },
    {
      id: "ci3",
      label: "Cultures & Ideas 3",
      description: leavey
        ? "Leavey students satisfy C&I 3 with MGMT 80 when taken on the SCU campus; otherwise choose from the approved list."
        : "One course from the approved C&I 3 list.",
      courses: leavey ? ["MGMT 80"] : [],
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
      description: leavey
        ? "One business ethics course: MGMT 136 (preferred, or MGMT 6) or PHIL 109."
        : "One course from the approved Ethics list.",
      courses: leavey ? ["MGMT 136", "MGMT 6", "PHIL 109"] : [],
      needsVerification: !leavey,
      phase: "Explorations",
    },
    {
      id: "natsci",
      label: "Natural Science",
      description: leavey
        ? "One approved natural science course with lab."
        : "One approved natural science course. STEM/engineering majors typically satisfy this within the major.",
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
      description: leavey
        ? "Leavey students satisfy STS with OMIS 34 (prospective Accounting majors: ACTG 134). MIS majors/minors choose from the approved list instead."
        : "One course from the approved STS list. Must be completed at SCU.",
      courses: leavey ? ["OMIS 34", "ACTG 134"] : [],
      needsVerification: true,
      phase: "Explorations",
    },
    {
      id: "socsci",
      label: "Social Science",
      description: leavey
        ? "Leavey students satisfy Social Science with ECON 1."
        : "One course from the approved Social Science list.",
      courses: leavey ? ["ECON 1"] : [],
      needsVerification: !leavey,
      phase: "Explorations",
    },
    {
      id: "advwriting",
      label: "Advanced Writing",
      description: leavey
        ? "Leavey students satisfy Advanced Writing with BUSN 179. Must be completed at SCU."
        : "Upper-division writing course in your discipline. Must be completed at SCU.",
      courses: leavey ? ["BUSN 179"] : [],
      needsVerification: !leavey,
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
  if (leavey) {
    notes.push(
      "Where a specific Leavey course is listed (e.g. OMIS 34 for STS, ECON 1 for Social Science, BUSN 179 for Advanced Writing), that mapping comes from the official Leavey Core Curriculum page.",
    );
  }

  return {
    id: "university-core",
    title: "University Core Curriculum",
    kind: "university_core",
    sourceUrl: leavey ? SOURCES.leaveyCore : SOURCES.coreCurriculum,
    sourceLabel: leavey
      ? "SCU Bulletin Ch. 2 + Leavey Core Curriculum page"
      : "SCU Undergraduate Bulletin, Ch. 2: The Core Curriculum",
    academicYear: ACADEMIC_YEAR,
    lastVerified: LAST_VERIFIED,
    notes,
    items,
  };
}

// ---------------------------------------------------------------------------
// College / school specific requirements
// ---------------------------------------------------------------------------

function collegeGroup(college: College): RequirementGroupDef {
  if (college === "LSB") {
    return {
      id: "college-lsb",
      title: "Leavey School of Business Requirements",
      kind: "college",
      sourceUrl: SOURCES.leaveyCore,
      sourceLabel: "Leavey Core Curriculum (official Leavey page)",
      academicYear: ACADEMIC_YEAR,
      lastVerified: LAST_VERIFIED,
      notes: [
        "Degree: Bachelor of Science in Commerce — minimum 175 quarter units, of which at least 60 must be upper-division.",
        "The Leavey lower-division business core is required of every business major regardless of department.",
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
          description: "OMIS 41.",
          courses: ["OMIS 41"],
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

export const UNIVERSITY_DEGREE_RULES: string[] = [
  "Minimum 175 quarter units for the B.A./B.S. (CAS) and B.S. in Commerce (Leavey); engineering unit minimums are set by the major department (193 for engineering physics).",
  "At least 60 quarter units of upper-division coursework.",
  "Minimum 2.0 GPA overall at SCU and in the major (and any minor).",
  "Residency: at least 45 units at Santa Clara after reaching junior standing.",
  "No more than half of the required units may come from transfer and/or test credit.",
];

export function buildRequirementGroups(college: College): {
  universityCore: RequirementGroupDef;
  college: RequirementGroupDef;
} {
  return { universityCore: universityCore(college), college: collegeGroup(college) };
}
