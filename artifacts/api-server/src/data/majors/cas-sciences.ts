/**
 * College of Arts and Sciences science and mathematics majors (Biology is biology.ts), transcribed from
 * the SCU 2026-27 Undergraduate Bulletin (Chapter 3), "Requirements for the Major". Where the Bulletin
 * refers to a department's "approved list" without printing it, the requirement is shown in its words
 * for the student to track: CampusVal does not count it from courses.
 */
import { codes, each, list, listsOf, manual, oneOf, pick, range, section, withNotes, type MajorStructure } from "./model";
import { bulletinSource } from "./source";

// ---------------------------------------------------------------------------
// Chemistry and Biochemistry: four degrees
// ---------------------------------------------------------------------------

const CHEM_GENERAL = oneOf("general-chemistry", "CHEM 11 and 12, or 14", [
  ["CHEM 11 and 12", ["CHEM 11", "CHEM 12"]],
  ["CHEM 14", ["CHEM 14"]],
], "Depending on AP credit, students may take CHEM 14 as a replacement for CHEM 11 and 12.");
const CHEM_ORGANIC = each("organic-chemistry", "CHEM 31, 32, 33, 50", codes("CHEM", "31 32 33 50"));
const CHEM_15 = each("chem-15", "CHEM 15 (1 unit, Introduction to Research)", ["CHEM 15"]);
const CHEM_SEMINAR = manual(
  "seminar",
  "Four quarters of CHEM 115 (0.5 unit each, Seminar)",
  "Four quarters of CHEM 115 (0.5 unit each, Seminar). CampusVal records a course once, so it cannot count the four quarters.",
  ["chem-115"],
);
const CHEM_MATH = oneOf("mathematics", "MATH 11, 12, 13 or MATH 35, 36, 13", [
  ["MATH 11, 12, 13", codes("MATH", "11 12 13")],
  ["MATH 35, 36, 13", codes("MATH", "35 36 13")],
]);
const CHEM_PHYSICS = oneOf("physics", "PHYS 11, 12, 13 or PHYS 31, 32, 33", [
  ["PHYS 11, 12, 13", codes("PHYS", "11 12 13")],
  ["PHYS 31, 32, 33", codes("PHYS", "31 32 33")],
]);
const ELECTIVES_NOTE =
  "Electives for all degrees can be fulfilled by taking any upper-division chemistry course of 3 units or more, including CHEM 183 and 184.";
const chemLists = (exclude182: boolean) =>
  listsOf(
    list("chem-115", "CHEM 115 (Seminar)", ["CHEM 115"]),
    range(
      "chem-electives",
      exclude182 ? "Upper-division chemistry courses of 3 units or more (not CHEM 182)" : "Upper-division chemistry courses of 3 units or more",
      { subjects: ["CHEM"], from: 100, to: 199, minUnits: 3, ...(exclude182 ? { exclude: ["CHEM 182"] } : {}) },
      ["CHEM 183", "CHEM 184"],
    ),
  );
const BIOCHEM_BIOL_ELECTIVE = list("biology-elective", "BIOL 110, 113, 172, 174, or 178 (for one of the two electives)", codes("BIOL", "110 113 172 174 178"));

const CHEM_SOURCE_NOTE = "Transcribed from the Chemistry and Biochemistry page's 'Requirements for the Majors'.";

export const CHEMISTRY_BS_STRUCTURE: MajorStructure = {
  ...bulletinSource("CHEM", "Department of Chemistry and Biochemistry", `${CHEM_SOURCE_NOTE} Bachelor of Science in Chemistry.`),
  lists: chemLists(true),
  sections: [
    section("chemistry", "Chemistry", [
      CHEM_GENERAL,
      CHEM_ORGANIC,
      each("upper-division", "CHEM 102, 111, 141, 151, 152, 154", codes("CHEM", "102 111 141 151 152 154")),
      CHEM_15,
      pick("electives", "Three upper-division chemistry electives, not including CHEM 182", 3, ["chem-electives"], ELECTIVES_NOTE),
      CHEM_SEMINAR,
    ]),
    section("math-physics", "Mathematics and physics", [CHEM_MATH, CHEM_PHYSICS]),
  ],
  notes: [],
};

export const BIOCHEMISTRY_STRUCTURE: MajorStructure = {
  ...bulletinSource("BCHM", "Department of Chemistry and Biochemistry", `${CHEM_SOURCE_NOTE} Bachelor of Science in Biochemistry.`),
  lists: { ...chemLists(true), ...listsOf(BIOCHEM_BIOL_ELECTIVE) },
  sections: [
    section("chemistry", "Chemistry", [
      CHEM_GENERAL,
      CHEM_ORGANIC,
      each("upper-division", "CHEM 101, 111, 141, 142, 143, 150", codes("CHEM", "101 111 141 142 143 150")),
      oneOf("chem-151-152", "CHEM 151 or 152", [
        ["CHEM 151", ["CHEM 151"]],
        ["CHEM 152", ["CHEM 152"]],
      ]),
      CHEM_15,
      pick(
        "electives",
        "Two additional upper-division chemistry electives, not including CHEM 182",
        2,
        ["chem-electives", "biology-elective"],
        "BIOL 110, 113, 172, 174, or 178 may be taken to satisfy one of these two electives.",
        { maxPerList: { "biology-elective": 1 }, notes: [ELECTIVES_NOTE] },
      ),
      CHEM_SEMINAR,
    ]),
    section("math-physics-biology", "Mathematics, physics and biology", [CHEM_MATH, CHEM_PHYSICS, each("biology", "BIOL 1A, 1B, 1C, 175", ["BIOL 1A", "BIOL 1B", "BIOL 1C", "BIOL 175"])]),
  ],
  notes: [],
};

export const BIOCHEMISTRY_ACS_STRUCTURE: MajorStructure = {
  ...bulletinSource("BCHM_ACS", "Department of Chemistry and Biochemistry", `${CHEM_SOURCE_NOTE} Bachelor of Science in Biochemistry, ACS Certified.`),
  lists: { ...chemLists(false), ...listsOf(BIOCHEM_BIOL_ELECTIVE) },
  sections: [
    section("chemistry", "Chemistry", [
      CHEM_GENERAL,
      CHEM_ORGANIC,
      each("upper-division", "CHEM 101, 111, 141, 142, 143, 150, 154", codes("CHEM", "101 111 141 142 143 150 154")),
      oneOf("chem-151-152", "CHEM 151 or 152", [
        ["CHEM 151", ["CHEM 151"]],
        ["CHEM 152", ["CHEM 152"]],
      ]),
      CHEM_15,
      each("chem-183-184", "CHEM 183, 184", ["CHEM 183", "CHEM 184"]),
      pick(
        "electives",
        "Two additional upper-division chemistry electives",
        2,
        ["chem-electives", "biology-elective"],
        "BIOL 110, 113, 172, 174, or 178 may be taken to satisfy one of these two electives.",
        { maxPerList: { "biology-elective": 1 }, notes: [ELECTIVES_NOTE] },
      ),
      CHEM_SEMINAR,
    ]),
    section("math-physics-biology", "Mathematics, physics and biology", [
      CHEM_MATH,
      each("physics", "PHYS 31, 32, 33", codes("PHYS", "31 32 33")),
      each("biology", "BIOL 1A, 1B, 1C, 175", ["BIOL 1A", "BIOL 1B", "BIOL 1C", "BIOL 175"]),
    ]),
  ],
  notes: [],
};

export const CHEMISTRY_BA_STRUCTURE: MajorStructure = {
  ...bulletinSource("CHEM_BA", "Department of Chemistry and Biochemistry", `${CHEM_SOURCE_NOTE} Bachelor of Arts in Chemistry.`),
  lists: {
    ...chemLists(true),
    ...listsOf(list("lab-courses", "CHEM 102, 143, 154, or 1 unit of CHEM 182", codes("CHEM", "102 143 154 182"))),
  },
  sections: [
    section("chemistry", "Chemistry", [
      CHEM_GENERAL,
      CHEM_ORGANIC,
      oneOf("chem-101-102", "CHEM 101 or 102", [
        ["CHEM 101", ["CHEM 101"]],
        ["CHEM 102", ["CHEM 102"]],
      ]),
      each("upper-division", "CHEM 111, 141", ["CHEM 111", "CHEM 141"]),
      oneOf("chem-150-152", "CHEM 150 or 151 or 152", [
        ["CHEM 150", ["CHEM 150"]],
        ["CHEM 151", ["CHEM 151"]],
        ["CHEM 152", ["CHEM 152"]],
      ]),
      CHEM_15,
      pick("electives", "Two additional upper-division chemistry electives, not including CHEM 182", 2, ["chem-electives"], ELECTIVES_NOTE),
      pick(
        "lab-requirement",
        "Upper-division lab requirement: 30 hours",
        1,
        ["lab-courses"],
        "Upper-division lab requirement: 30 hours, which can be satisfied by CHEM 102, 143, 154, or 1 unit of CHEM 182.",
        { overlay: true },
      ),
      CHEM_SEMINAR,
    ]),
    section("math-physics", "Mathematics and physics", [CHEM_MATH, CHEM_PHYSICS]),
  ],
  notes: [],
};

// ---------------------------------------------------------------------------
// Physics and Engineering Physics
// ---------------------------------------------------------------------------

const PHYS_CHEM = oneOf("chemistry", "CHEM 11 or CHEM 14", [
  ["CHEM 11", ["CHEM 11"]],
  ["CHEM 14", ["CHEM 14"]],
]);
const PHYS_DIFFEQ = oneOf("differential-equations", "AMTH 106 (preferred) or MATH 23", [
  ["AMTH 106 (preferred)", ["AMTH 106"], true],
  ["MATH 23", ["MATH 23"]],
]);

export const PHYSICS_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "PHYS",
    "Department of Physics and Engineering Physics",
    "Transcribed from the Bulletin's 'Major in Physics', including any course-associated laboratory components.",
  ),
  lists: listsOf(
    list("programming-elective", "CSCI 10, CSEN 10, CSEN 11, MECH 45, CHEM 12", ["CSCI 10", "CSEN 10", "CSEN 11", "MECH 45", "CHEM 12"], "CHEM 12 and CHEM 14 cannot both be taken for credit."),
    list("upper-division-electives", "PHYS 104, 113, 116, 123, 141, 161, 162", codes("PHYS", "104 113 116 123 141 161 162")),
    list("supplemental-lab", "PHYS 113L, 123L", ["PHYS 113L", "PHYS 123L"]),
  ),
  sections: [
    section("math-science", "Mathematics and chemistry", [PHYS_CHEM, each("mathematics", "MATH 11, 12, 13, 14", codes("MATH", "11 12 13 14")), PHYS_DIFFEQ]),
    section("physics", "Physics", [
      oneOf("introductory-physics", "PHYS 31, 32 (preferred) or PHYS 11, 12", [
        ["PHYS 31, 32 (preferred)", ["PHYS 31", "PHYS 32"], true],
        ["PHYS 11, 12", ["PHYS 11", "PHYS 12"]],
      ]),
      each("physics-core", "Physics core", codes("PHYS", "20 33 34 70 103 111 112 120 121 122 151 192")),
      pick("programming-elective", "One elective chosen from CSCI 10, CSEN 10, CSEN 11, MECH 45, CHEM 12", 1, ["programming-elective"], "One course from the list."),
      pick("upper-division-electives", "Three upper-division electives", 3, ["upper-division-electives"], "Three upper-division electives chosen from PHYS 104, 113, 116, 123, 141, 161, 162."),
      pick("supplemental-lab", "One supplemental laboratory", 1, ["supplemental-lab"], "One supplemental laboratory: PHYS 113L or 123L."),
    ]),
  ],
  notes: [],
};

export const ENGINEERING_PHYSICS_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "ENGPHYS",
    "Department of Physics and Engineering Physics",
    "Transcribed from the Bulletin's 'Major in Engineering Physics'. The five-course technical cluster is approved by an advisor, so CampusVal does not count it from courses.",
  ),
  lists: listsOf(
    list("programming", "CSCI 10, CSEN 10, CSEN 11, or MECH 45", ["CSCI 10", "CSEN 10", "CSEN 11", "MECH 45"]),
    list("physics-elective", "PHYS 104, 113, 116, 122, 123, 141, 151, 161, 162", codes("PHYS", "104 113 116 122 123 141 151 161 162")),
    list(
      "engineering-courses",
      "CHEM 12, CHEM 14, MECH 10, 11, 15, 122, 143 (or ECEN 123 or CSEN 123), CENG 41, 43, CSEN 11 (or CSCI 60), ECEN 21 (or CSEN 21), ECEN 100, 110, 115, 118, 144",
      [
        "CHEM 12",
        "CHEM 14",
        ...codes("MECH", "10 11 15 122 143"),
        "ECEN 123",
        "CSEN 123",
        "CENG 41",
        "CENG 43",
        "CSEN 11",
        "CSCI 60",
        "ECEN 21",
        "CSEN 21",
        ...codes("ECEN", "100 110 115 118 144"),
      ],
      "CHEM 12 and CHEM 14 cannot both be taken for credit. Courses joined by \"or\" are alternatives: count one of them. Similar relevant courses might be considered as substitutions, but an EP program advisor must authorize the substitution in advance.",
    ),
  ),
  sections: [
    section("math-science", "Mathematics and chemistry", [PHYS_CHEM, each("mathematics", "MATH 11, 12, 13, 14", codes("MATH", "11 12 13 14")), PHYS_DIFFEQ]),
    section("physics", "Physics", [
      pick("programming", "One course chosen from CSCI 10, CSEN 10, CSEN 11, or MECH 45", 1, ["programming"], "One course from the list."),
      each("physics-core", "Physics core", codes("PHYS", "20 31 32 33 34 70 103 111 112 121 192")),
      oneOf("phys-120", "PHYS 120 (preferred) or MECH 121 (with permission)", [
        ["PHYS 120 (preferred)", ["PHYS 120"], true],
        ["MECH 121 (with permission from an EP program advisor)", ["MECH 121"]],
      ]),
      pick("physics-elective", "One upper-division physics elective", 1, ["physics-elective"], "One upper-division physics elective chosen from PHYS 104, 113, 116, 122, 123, 141, 151, 161, 162."),
    ]),
    section("engineering", "Engineering", [
      pick("engineering-courses", "At least four engineering and science courses", 4, ["engineering-courses"], "At least four courses chosen from the list."),
      manual(
        "technical-cluster",
        "Approved cluster of five additional technical courses",
        "An approved cluster of five additional technical courses focused in a specific area chosen by the student and subject to advisor consent. A few of the popular course cluster areas include: computational, electronics, materials science, solid state, and mechanical.",
      ),
    ]),
  ],
  notes: ["Engineering physics requires a minimum of 193 units (Bulletin Chapter 8)."],
};

// ---------------------------------------------------------------------------
// Mathematics, B.S. (optional emphases) and Computer Science, B.S. (required emphasis)
// ---------------------------------------------------------------------------

const MATH_ANALYSIS = list("analysis", "Analysis: MATH 102, 105, or 153", codes("MATH", "102 105 153"));
const MATH_ALGEBRA = list("algebra", "Algebra: MATH 103 or 111", codes("MATH", "103 111"));

export const MATHEMATICS_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "MATH",
    "Department of Mathematics and Computer Science",
    "Transcribed from the Bulletin's 'Major in Mathematics' and its five optional emphases. The seven upper-division courses are 5-unit courses; MATH 100 and courses 190 and above do not count toward them.",
  ),
  lists: listsOf(
    MATH_ANALYSIS,
    MATH_ALGEBRA,
    list("geometry", "Geometry: MATH 101, 113, or 174", codes("MATH", "101 113 174")),
    list("discrete", "Discrete mathematics: MATH 176 or 177", codes("MATH", "176 177")),
    list("applied", "Applied mathematics: MATH 122, 125, 141, 144, 146, 155, or 166", codes("MATH", "122 125 141 144 146 155 166")),
    range("upper-division", "Approved 5-unit upper-division mathematics courses (CSCI 162 also permitted)", { subjects: ["MATH"], from: 101, to: 189, minUnits: 5 }, ["CSCI 162"]),
    list("applied-two", "MATH 125, 141, 144, 146, 147, 155, 166, 178", codes("MATH", "125 141 144 146 147 155 166 178")),
    list("applied-one", "MATH 166, 147", codes("MATH", "166 147")),
    list("data-184", "CSCI 184 or CSEN 178", ["CSCI 184", "CSEN 178"]),
    list("data-two", "CSCI 127, 163; MATH 146, 147, 166; CSEN 166, 169; ECON 174", ["CSCI 127", "CSCI 163", ...codes("MATH", "146 147 166"), "CSEN 166", "CSEN 169", "ECON 174"]),
    list("financial-two", "MATH 144, 146, 147, 166", codes("MATH", "144 146 147 166")),
    range("math-econ-two", "MATH 125, MATH 166, ECON 170–174", { subjects: ["ECON"], from: 170, to: 174 }, ["MATH 125", "MATH 166"]),
  ),
  sections: [
    section("lower-division", "Lower division", [
      withNotes(each("csci-10", "CSCI 10", ["CSCI 10"]), "Or demonstrated equivalent proficiency in computer programming."),
      each("mathematics", "MATH 11, 12, 13, 14, 23, 51, 52, and 53", codes("MATH", "11 12 13 14 23 51 52 53")),
      withNotes(
        each("physics", "PHYS 31 and 32", ["PHYS 31", "PHYS 32"]),
        "Students planning to teach in secondary schools may substitute, with approval of the department chair, PHYS 11 and 12 for PHYS 31 and 32.",
      ),
    ]),
    section("upper-division", "Seven approved 5-unit upper-division courses", [
      pick("analysis", "At least one course in analysis", 1, ["analysis"], "MATH 102, 105, or 153."),
      pick("algebra", "At least one course in algebra", 1, ["algebra"], "MATH 103 or 111."),
      pick(
        "geometry-discrete-applied",
        "At least one course from geometry, discrete mathematics, or applied mathematics",
        1,
        ["geometry", "discrete", "applied"],
        "Geometry (MATH 101, 113, or 174), discrete mathematics (MATH 176 or 177), or applied mathematics (MATH 122, 125, 141, 144, 146, 155, or 166).",
      ),
      pick("upper-division-more", "Four more approved upper-division courses", 4, ["upper-division"], "The rest of the seven approved 5-unit upper-division courses in mathematics (CSCI 162 also permitted). MATH 100, and courses 190 and above do not count toward the seven courses."),
    ]),

    section("applied-mathematics", "Emphasis in Applied Mathematics", [
      each("applied-core", "MATH 102, 122, and 123", codes("MATH", "102 122 123")),
      pick("applied-two", "Two courses from MATH 125, 141, 144, 146, 147, 155, 166, 178", 2, ["applied-two"], "Or an approved alternative 5-unit upper-division mathematics course."),
      pick("applied-one", "One course from MATH 166, 147", 1, ["applied-one"], "One of the two."),
    ], "applied-mathematics"),
    section("data-science", "Emphasis in Data Science", [
      each("data-core", "MATH 122, 123; CSCI 10, 60, 61, 62, 183", [...codes("MATH", "122 123"), ...codes("CSCI", "10 60 61 62 183")]),
      pick("data-184", "CSCI 184 or CSEN 178", 1, ["data-184"], "One of the two."),
      pick("data-two", "Two courses from CSCI 127, 163; MATH 146, 147, 166; CSEN 166, 169; ECON 174", 2, ["data-two"], "Two courses from the list."),
    ], "data-science"),
    section("financial-mathematics", "Emphasis in Financial Mathematics", [
      each("financial-core", "MATH 102, 122, 123, 125; BUSN 70; ACTG 11, 12; FNCE 121, 124", [...codes("MATH", "102 122 123 125"), "BUSN 70", "ACTG 11", "ACTG 12", "FNCE 121", "FNCE 124"]),
      pick("financial-two", "Two courses from MATH 144, 146, 147, 166", 2, ["financial-two"], "Two courses from the list."),
    ], "financial-mathematics"),
    section("mathematical-economics", "Emphasis in Mathematical Economics", [
      each("math-econ-core", "MATH 102, 122, 123, 146, 147; ECON 113", [...codes("MATH", "102 122 123 146 147"), "ECON 113"]),
      pick("math-econ-two", "Two courses from MATH 125, MATH 166, ECON 170–174", 2, ["math-econ-two"], "Two courses from the list."),
    ], "mathematical-economics"),
    section("mathematics-education", "Emphasis in Mathematics Education", [
      each("education-core", "MATH 101, 102, 122, 170, 195", codes("MATH", "101 102 122 170 195")),
      oneOf("education-123", "MATH 123 (or 8)", [
        ["MATH 123", ["MATH 123"]],
        ["MATH 8", ["MATH 8"]],
      ]),
      oneOf("education-175", "MATH 175 (or 178)", [
        ["MATH 175", ["MATH 175"]],
        ["MATH 178", ["MATH 178"]],
      ]),
    ], "mathematics-education"),
  ],
  variants: {
    kind: "emphasis",
    required: false,
    options: [
      { key: "applied-mathematics", label: "Emphasis in Applied Mathematics" },
      { key: "data-science", label: "Emphasis in Data Science" },
      { key: "financial-mathematics", label: "Emphasis in Financial Mathematics" },
      { key: "mathematical-economics", label: "Emphasis in Mathematical Economics" },
      { key: "mathematics-education", label: "Emphasis in Mathematics Education" },
    ],
    note: "Students are not required to select an emphasis for the major in mathematics. Only one emphasis is allowed. Data Science may not be used as an emphasis for both majors.",
  },
  notes: [
    "Students planning to undertake graduate studies in pure mathematics should take MATH 105, 111, 112, 113, 153, and 154. Students planning to undertake graduate studies in applied mathematics should complete the emphasis in applied mathematics and take MATH 105, 144, 153, 154, and 155.",
    "At least four of the required upper-division courses in the major must be taken at Santa Clara. A single upper-division course in the Department of Mathematics and Computer Science can only be used to satisfy one major or one minor requirement in the department. (Exceptions may be approved by the Chair.)",
    "Students planning to complete the Mathematics Education emphasis are strongly advised to complete the College's Urban Education minor.",
  ],
};

const CS_UPPER = range("any-upper", "Any other 4-5 unit upper-division CSCI course below 190 or CSEN course below 188", { subjects: ["CSCI", "CSEN"], from: 100, to: 189, minUnits: 4, exclude: ["CSEN 188", "CSEN 189"] });
const CS_UPPER_CSCI = range("any-upper-csci", "Any other 4-5 unit upper-division CSCI course below 190", { subjects: ["CSCI"], from: 100, to: 189, minUnits: 4 });
const CS_UPPER_NO_150 = range("any-upper-no-150", "Any other 4-5 unit upper-division CSCI course below 190 or CSEN course below 188, excluding CSEN 150", {
  subjects: ["CSCI", "CSEN"],
  from: 100,
  to: 189,
  minUnits: 4,
  exclude: ["CSEN 188", "CSEN 189", "CSEN 150"],
});

export const COMPUTER_SCIENCE_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "CSCI",
    "Department of Mathematics and Computer Science",
    "Transcribed from the Bulletin's 'Major in Computer Science'. The five additional upper-division courses are one emphasis's requirements.",
  ),
  lists: listsOf(
    list("science", "One of PHYS 31, CHEM 11, ENVS 21, or ENVS 23", ["PHYS 31", "CHEM 11", "ENVS 21", "ENVS 23"]),
    list("algorithms-two", "CSCI 146, 147, 165, 181, MATH 101, 175, 176, 177, 178", [...codes("CSCI", "146 147 165 181"), ...codes("MATH", "101 175 176 177 178")]),
    CS_UPPER,
    CS_UPPER_CSCI,
    CS_UPPER_NO_150,
    list("data-two", "CSCI 127, 146, 147, 164, 166, MATH 123, CSEN 166", [...codes("CSCI", "127 146 147 164 166"), "MATH 123", "CSEN 166"]),
    list("security-two", "MATH 175, CSEN 152 and 152L, CSEN 161 and 161L, CSEN 146 and 146L", ["MATH 175", "CSEN 152", "CSEN 161", "CSEN 146"], "Each CSEN course is taken with its laboratory (152L, 161L, 146L)."),
    list("software-first", "CSCI 183, 180, 168", codes("CSCI", "183 180 168")),
    list("software-second", "CSCI 183, 180, 168, CSEN 161, 178", [...codes("CSCI", "183 180 168"), "CSEN 161", "CSEN 178"]),
  ),
  sections: [
    section("foundation", "Mathematics, computer science and science", [
      each("mathematics", "MATH 11, 12, 13, 14, 51, 53", codes("MATH", "11 12 13 14 51 53")),
      each("computer-science", "CSCI 10, 60, 61, 62", codes("CSCI", "10 60 61 62")),
      pick("science", "One of PHYS 31, CHEM 11, ENVS 21, or ENVS 23", 1, ["science"], "One course from the list."),
      each("systems", "CSEN 20 and 20L, ECEN 21 and 21L", ["CSEN 20", "CSEN 20L", "ECEN 21", "ECEN 21L"]),
      each("upper-division-core", "MATH 122, CSCI 161, and 163, and CSEN 177 and 177L", ["MATH 122", "CSCI 161", "CSCI 163", "CSEN 177", "CSEN 177L"]),
    ]),
    section("algorithms", "Algorithms and Complexity emphasis", [
      each("algorithms-core", "CSCI 162, CSCI 164", ["CSCI 162", "CSCI 164"]),
      pick("algorithms-two", "Two more courses from CSCI 146, 147, 165, 181, MATH 101, 175, 176, 177, 178", 2, ["algorithms-two"], "Two courses from the list."),
      pick("algorithms-one", "One more course from the list above or any other upper-division CSCI or CSEN course", 1, ["algorithms-two", "any-upper"], "One more course from the list above or any other additional 4-5 unit upper-division CSCI course below 190 or CSEN course below 188."),
    ], "algorithms"),
    section("data-science", "Data Science emphasis", [
      each("data-core", "CSCI 183, 184, 185", codes("CSCI", "183 184 185")),
      pick("data-two", "Two more courses", 2, ["data-two", "any-upper"], "Two more courses from CSCI 127, 146, 147, 164, 166, MATH 123, CSEN 166, or any other additional 4-5 unit upper-division CSCI course below 190 or CSEN course below 188."),
    ], "data-science"),
    section("security", "Security emphasis", [
      each("security-core", "MATH 178, CSCI 180, CSCI 181", ["MATH 178", "CSCI 180", "CSCI 181"]),
      pick("security-two", "Two more courses", 2, ["security-two", "any-upper-no-150"], "Two more courses from MATH 175, CSEN 152 and 152L, CSEN 161 and 161L, CSEN 146 and 146L, or any other additional 4-5 unit upper-division CSCI course below 190 or CSEN course below 188 excluding CSEN 150."),
    ], "security"),
    section("software", "Software emphasis", [
      each("software-core", "CSCI 169, CSCI 187, CSEN 146 and 146L", ["CSCI 169", "CSCI 187", "CSEN 146", "CSEN 146L"]),
      pick("software-first", "One more course", 1, ["software-first", "any-upper-csci"], "One more course from CSCI 183, 180, 168, or any other additional 4-5 unit upper-division CSCI course below 190."),
      pick("software-second", "One other course", 1, ["software-second", "any-upper"], "One other course from CSCI 183, 180, 168, CSEN 161, 178 or any other additional 4-5 unit upper-division CSCI course below 190 or CSEN course below 188."),
    ], "software"),
  ],
  variants: {
    kind: "emphasis",
    required: true,
    options: [
      { key: "algorithms", label: "Algorithms and Complexity emphasis" },
      { key: "data-science", label: "Data Science emphasis" },
      { key: "security", label: "Security emphasis" },
      { key: "software", label: "Software emphasis" },
    ],
    note: "Students should decide their emphasis by the end of junior year. Only one emphasis is allowed. Data Science may not be used as an emphasis for both majors.",
  },
  notes: [
    "It is highly recommended that students (especially students in the Software emphasis) take additional upper-division courses beyond the minimum required for the degree, such as CSEN 178.",
    "At least four of the required upper-division courses in the major must be taken at Santa Clara. A single upper-division course in the Department of Mathematics and Computer Science can only be used to satisfy one major or one minor requirement in the department. (Exceptions may be approved by the Chair.)",
  ],
};

// ---------------------------------------------------------------------------
// Psychology, Neuroscience
// ---------------------------------------------------------------------------

export const PSYCHOLOGY_STRUCTURE: MajorStructure = {
  ...bulletinSource("PSYC", "Department of Psychology", "Transcribed from the Bulletin's 'Requirements for the Major'."),
  lists: listsOf(
    list("math-6-11-35", "MATH 6, 11, or 35", codes("MATH", "6 11 35")),
    list("biological", "Biological psychology: PSYC 165, 166, 167, 169", codes("PSYC", "165 166 167 169")),
    list("developmental", "Developmental psychology: PSYC 172, 184, 185, 196", codes("PSYC", "172 184 185 196")),
    list("applied", "Applied psychology: PSYC 115, 117, 134, 140, 157, 190", codes("PSYC", "115 117 134 140 157 190")),
    list("socio-cultural", "Socio-cultural/personality: PSYC 150, 160, 162", codes("PSYC", "150 160 162")),
    list("learning", "Learning/cognition/perception: PSYC 120, 130, 131, 138", codes("PSYC", "120 130 131 138")),
    list("advanced-topics", "Advanced topics", codes("PSYC", "111AT 116AT 118AT 132AT 133AT 141AT 151AT 154AT 168AT 175AT 178AT 199A")),
    range("upper-division", "Upper-division psychology courses (not Advanced Topics)", { subjects: ["PSYC"], from: 100, to: 199, excludeSuffixes: ["AT"] }),
  ),
  sections: [
    section("foundation", "Foundation", [
      each("psychology", "PSYC 1, 2, 51, 52, and 53", codes("PSYC", "1 2 51 52 53")),
      each("math-8", "MATH 8", ["MATH 8"]),
      pick("math", "MATH 6, 11, or 35", 1, ["math-6-11-35"], "One of the three."),
    ]),
    section("areas", "Upper-division areas", [
      pick("biological", "One biological psychology course", 1, ["biological"], "PSYC 165, 166, 167, 169."),
      pick("developmental", "One developmental psychology course", 1, ["developmental"], "PSYC 172, 184, 185, 196."),
      pick("applied", "One applied psychology course", 1, ["applied"], "PSYC 115, 117, 134, 140, 157, 190."),
      pick("socio-cultural", "One socio-cultural/personality course", 1, ["socio-cultural"], "PSYC 150, 160, 162."),
      pick("learning", "One learning/cognition/perception course", 1, ["learning"], "PSYC 120, 130, 131, 138."),
      pick("advanced-topics", "One advanced topics course", 1, ["advanced-topics"], "PSYC 111AT, 116AT, 118AT, 132AT, 133AT, 141AT, 151AT, 154AT, 168AT, 175AT, 178AT, 199A."),
      pick("additional", "Three additional approved upper-division psychology courses", 3, ["upper-division"], "Three additional approved upper-division psychology courses (Advanced Topics courses may NOT be used)."),
    ]),
  ],
  notes: [],
};

export const NEUROSCIENCE_STRUCTURE: MajorStructure = {
  ...bulletinSource("NEUR", "Neuroscience Program", "Transcribed from the Bulletin's 'Requirements for the Major'. PHIL 32 and the physics sequences are recommended, not required."),
  lists: listsOf(
    list("biology-one", "BIOL 110, 112, 120, 123, 124, 165, 172, 174, 175, 178", codes("BIOL", "110 112 120 123 124 165 172 174 175 178")),
    list("psychology-one", "PSYC 120, 130, 138, 166, 167, 196", codes("PSYC", "120 130 138 166 167 196")),
    list("additional-science", "NEUR 175, 185, BIOL 110, 112, 119, 120, 123, 123A, 124, 164, 165, 170, 171, 172, 174, 175, 178; CHEM 141; CSCI 168", [
      "NEUR 175",
      "NEUR 185",
      ...codes("BIOL", "110 112 119 120 123 123A 124 164 165 170 171 172 174 175 178"),
      "CHEM 141",
      "CSCI 168",
    ]),
    list("additional-mind", "NEUR 175, 185, COMM 176A/113; PHIL 113, 117; PSYC 120, 130, 138, 166, 167, 196", [
      "NEUR 175",
      "NEUR 185",
      "COMM 176A",
      "COMM 113",
      "PHIL 113",
      "PHIL 117",
      ...codes("PSYC", "120 130 138 166 167 196"),
    ]),
  ),
  sections: [
    section("foundation", "Foundation", [
      each("neuroscience", "NEUR 1, 10, 150, 190", codes("NEUR", "1 10 150 190")),
      each("biology", "BIOL 1A, 1B, 1C, 122, 160", codes("BIOL", "1A 1B 1C 122 160")),
      each("chem-11", "CHEM 11", ["CHEM 11"]),
      oneOf("chem-12", "CHEM 12 (or 14)", [
        ["CHEM 12", ["CHEM 12"]],
        ["CHEM 14", ["CHEM 14"]],
      ]),
      each("organic", "CHEM 31, 32, 33", codes("CHEM", "31 32 33")),
      oneOf("math-35", "MATH 35 or 11 (35 recommended)", [
        ["MATH 35 (recommended)", ["MATH 35"], true],
        ["MATH 11", ["MATH 11"]],
      ]),
      oneOf("math-36", "MATH 36 or 12 or CSCI 10", [
        ["MATH 36", ["MATH 36"]],
        ["MATH 12", ["MATH 12"]],
        ["CSCI 10", ["CSCI 10"]],
      ]),
      each("psychology", "PSYC 1, 165, 169", codes("PSYC", "1 165 169")),
    ]),
    section("upper-division", "Upper-division choices", [
      pick("biology-one", "One from BIOL 110, 112, 120, 123, 124, 165, 172, 174, 175, 178", 1, ["biology-one"], "One course from the list."),
      pick("psychology-one", "One from PSYC 120, 130, 138, 166, 167, 196", 1, ["psychology-one"], "One course from the list."),
      pick("additional-science", "One additional course (neuroscience, biology, chemistry or computer science)", 1, ["additional-science"], "One additional course from the list."),
      pick("additional-mind", "One additional course (neuroscience, communication, philosophy or psychology)", 1, ["additional-mind"], "One additional course from the list."),
    ]),
  ],
  notes: ["PHIL 32 is recommended. Recommended courses for students intending to pursue graduate work in Neuroscience: PHYS 11, 12, 13 or PHYS 31, 32, 33."],
};

// ---------------------------------------------------------------------------
// Public Health Science, B.S. (two emphases, one required)
// ---------------------------------------------------------------------------

const PHSC_INTERNSHIP = manual(
  "internship",
  "An approved 100 hour internship",
  "The PHSC major requires students to complete at least 100 hours of public health-related internship work. Internships must be approved in advance by a faculty member in the Department of Public Health.",
);
const phscElective = (required: string[]) =>
  range("phsc-elective", "Any PHSC course other than the required courses", { subjects: ["PHSC"], from: 1, to: 199, exclude: required });
const HEALTH_SCIENCE_REQUIRED = codes("PHSC", "1 2 3 100 139 151 190 197");
const HEALTH_SOCIETY_REQUIRED = codes("PHSC", "1 2 3 50 100 125 139 151 175 190 197");

export const PUBLIC_HEALTH_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "PHSC",
    "Department of Public Health",
    "Transcribed from the Bulletin's two sections 'Requirements for the Major in Public Health Science' (Health Science Emphasis; Health and Society Emphasis). Approved social science, biomedical and humanities electives are not printed, so they are shown for the student to track.",
  ),
  lists: {
    ...listsOf(
      list("statistics", "PHSC 50 (recommended), MATH 8, ANTH 112, BIOL 160/ENVS 110, COMM 110, OMIS 40, PSYC 51, SOCI 120", [
        "PHSC 50",
        "MATH 8",
        "ANTH 112",
        "BIOL 160",
        "ENVS 110",
        "COMM 110",
        "OMIS 40",
        "PSYC 51",
        "SOCI 120",
      ]),
    ),
    "phsc-elective-science": { ...phscElective(HEALTH_SCIENCE_REQUIRED), key: "phsc-elective-science" },
    "phsc-elective-society": { ...phscElective(HEALTH_SOCIETY_REQUIRED), key: "phsc-elective-society" },
  },
  sections: [
    section("health-science", "Health Science Emphasis", [
      each("health-science-phsc", "PHSC 1, 2, 3, 100, 139, 151, 190, 197", HEALTH_SCIENCE_REQUIRED),
      each("health-science-biology", "BIOL 1A, 1B, 1C", codes("BIOL", "1A 1B 1C")),
      each("health-science-chemistry", "CHEM 11, 12, 31", codes("CHEM", "11 12 31")),
      manual("health-science-social-science", "Two approved introductory social science courses", "Two approved introductory social science courses."),
      oneOf("health-science-math", "MATH 35, 36 (recommended) or MATH 11, 12", [
        ["MATH 35, 36 (recommended)", ["MATH 35", "MATH 36"], true],
        ["MATH 11, 12", ["MATH 11", "MATH 12"]],
      ]),
      pick("health-science-statistics", "One statistics course", 1, ["statistics"], "One statistics course chosen from PHSC 50 (recommended), MATH 8, ANTH 112, BIOL 160/ENVS 110, COMM 110, OMIS 40, PSYC 51, SOCI 120."),
      pick("health-science-elective", "One public health elective", 1, ["phsc-elective-science"], "Any PHSC course other than the required courses listed above."),
      manual("health-science-biomedical", "Two approved upper-division biomedical electives, at least one with a lab component", "Two approved upper-division biomedical electives, at least one with a lab component."),
      manual("health-science-humanities", "Two approved upper-division social science or humanities electives", "Two approved upper-division social science or humanities electives."),
      { ...PHSC_INTERNSHIP, key: "health-science-internship" },
    ], "health-science"),
    section("health-society", "Health and Society Emphasis", [
      each("health-society-phsc", "PHSC 1, 2, 3, 50, 100, 125, 139, 151, 175, 190, 197", HEALTH_SOCIETY_REQUIRED),
      oneOf("health-society-biology", "BIOL 2 or BIOL 1A or BIOL 11", [
        ["BIOL 2", ["BIOL 2"]],
        ["BIOL 1A", ["BIOL 1A"]],
        ["BIOL 11", ["BIOL 11"]],
      ]),
      manual("health-society-social-science", "A total of six approved introductory social science courses, chosen from two departments", "A total of six approved introductory social science courses, chosen from two departments."),
      oneOf("health-society-math", "MATH 35 (recommended) or MATH 11", [
        ["MATH 35 (recommended)", ["MATH 35"], true],
        ["MATH 11", ["MATH 11"]],
      ]),
      pick("health-society-elective", "One public health elective", 1, ["phsc-elective-society"], "Any PHSC course other than the required courses listed above."),
      manual("health-society-upper-division", "Three approved upper-division social science electives", "Three approved upper-division social science electives."),
      { ...PHSC_INTERNSHIP, key: "health-society-internship" },
    ], "health-society"),
  ],
  variants: {
    kind: "emphasis",
    required: true,
    options: [
      { key: "health-science", label: "Health Science Emphasis" },
      { key: "health-society", label: "Health and Society Emphasis" },
    ],
  },
  notes: [],
};

// ---------------------------------------------------------------------------
// Environmental Science, Environmental Studies
// ---------------------------------------------------------------------------

const ENVS_INTERNSHIP = manual("internship", "An approved 100-hour internship", "An approved 100-hour internship.");
const ENVS_ETHICS = oneOf("ethics", "ENVS 79 or PHIL 29", [
  ["ENVS 79", ["ENVS 79"]],
  ["PHIL 29", ["PHIL 29"]],
]);
const ENVS_GIS = oneOf("gis", "ENVS 116 or CENG 160", [
  ["ENVS 116", ["ENVS 116"]],
  ["CENG 160", ["CENG 160"]],
]);

export const ENVIRONMENTAL_SCIENCE_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "ENSC",
    "Department of Environmental Studies and Sciences",
    "Transcribed from the Bulletin's 'Major in Environmental Science'. The department's approved upper-division lists are not printed in the Bulletin, so those requirements are shown for the student to track.",
  ),
  lists: listsOf(),
  sections: [
    section("foundation", "Foundation", [
      each("envs-intro", "ENVS 21, 22, 23", codes("ENVS", "21 22 23")),
      oneOf("mathematics", "MATH 11 or MATH 35", [
        ["MATH 11", ["MATH 11"]],
        ["MATH 35", ["MATH 35"]],
      ]),
      oneOf("chemistry", "CHEM [11+12+31] or CHEM [14+31]", [
        ["CHEM 11, 12, 31", codes("CHEM", "11 12 31")],
        ["CHEM 14, 31", codes("CHEM", "14 31")],
      ]),
      ENVS_ETHICS,
      each("envs-core", "ENVS 100, 101, 122, 198", codes("ENVS", "100 101 122 198")),
      oneOf("statistics", "ENVS 110/BIOL 160", [
        ["ENVS 110", ["ENVS 110"]],
        ["BIOL 160", ["BIOL 160"]],
      ]),
      ENVS_GIS,
      each("envs-188", "ENVS 188", ["ENVS 188"]),
      oneOf("science-series", "BIOL 1A, 1B, 1C or PHYS 11, 12, 13 (PHYS 31, 32, 33 can be substituted)", [
        ["BIOL 1A, 1B, 1C", codes("BIOL", "1A 1B 1C")],
        ["PHYS 11, 12, 13", codes("PHYS", "11 12 13")],
        ["PHYS 31, 32, 33", codes("PHYS", "31 32 33")],
      ]),
      manual("social-science", "One approved departmental upper-division social science course", "One selection from the approved list of departmental upper-division social science courses."),
      ENVS_INTERNSHIP,
    ]),
    section("upper-division", "Six upper-division environmental science courses", [
      manual(
        "upper-division",
        "Six upper-division environmental science courses (at least three lab courses)",
        "Six upper-division environmental science courses from the following categories. At least three must be lab courses: at least two courses from the approved list of biological sciences courses; at least two courses from the approved list of physical sciences courses; up to two courses from the approved list of elective courses.",
      ),
    ]),
  ],
  notes: [],
};

export const ENVIRONMENTAL_STUDIES_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "ENVS",
    "Department of Environmental Studies and Sciences",
    "Transcribed from the Bulletin's 'Major in Environmental Studies'. The department's approved lists are not printed in the Bulletin, so those requirements are shown for the student to track.",
  ),
  lists: listsOf(),
  sections: [
    section("foundation", "Foundation", [
      each("envs-intro", "ENVS 21, 22, 23", codes("ENVS", "21 22 23")),
      oneOf("envs-50", "ENVS 50/ANTH 50", [
        ["ENVS 50", ["ENVS 50"]],
        ["ANTH 50", ["ANTH 50"]],
      ]),
      ENVS_ETHICS,
      each("envs-core", "ENVS 100, 101, 122, 198", codes("ENVS", "100 101 122 198")),
      manual("statistics", "One approved statistics course", "One selection from the approved list of statistics courses (ENVS 110 preferred for students with only 1 major)."),
      each("envs-111", "ENVS 111", ["ENVS 111"]),
      ENVS_GIS,
      each("envs-188", "ENVS 188", ["ENVS 188"]),
      ENVS_INTERNSHIP,
    ]),
    section("upper-division", "Five upper-division courses", [
      manual(
        "upper-division",
        "Five upper-division courses",
        "Five upper-division courses from the following categories: one natural science lab course from the approved list of electives offered within the Department; two to four additional courses from the approved list of electives offered within the Department; up to two courses from the approved list of electives offered outside the Department.",
      ),
    ]),
  ],
  notes: [],
};

export const CAS_SCIENCE_STRUCTURES: Record<string, MajorStructure> = {
  CHEM: CHEMISTRY_BS_STRUCTURE,
  BCHM: BIOCHEMISTRY_STRUCTURE,
  BCHM_ACS: BIOCHEMISTRY_ACS_STRUCTURE,
  CHEM_BA: CHEMISTRY_BA_STRUCTURE,
  PHYS: PHYSICS_STRUCTURE,
  ENGPHYS: ENGINEERING_PHYSICS_STRUCTURE,
  MATH: MATHEMATICS_STRUCTURE,
  CSCI: COMPUTER_SCIENCE_STRUCTURE,
  PSYC: PSYCHOLOGY_STRUCTURE,
  NEUR: NEUROSCIENCE_STRUCTURE,
  PHSC: PUBLIC_HEALTH_STRUCTURE,
  ENSC: ENVIRONMENTAL_SCIENCE_STRUCTURE,
  ENVS: ENVIRONMENTAL_STUDIES_STRUCTURE,
};
