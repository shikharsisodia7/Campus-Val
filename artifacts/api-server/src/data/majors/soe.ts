/**
 * School of Engineering majors, transcribed from the SCU 2026-27 Undergraduate Bulletin (Chapter 5),
 * "Requirements for the Major". The Bulletin's words are kept beside each structure (source.ts); every
 * course named here is named there. Laboratories: "for every required engineering and science course,
 * if an associated laboratory is listed following the course description, then that laboratory is also
 * required" — a lab the Bulletin lists by code is its own requirement; one it does not list is noted.
 */
import { codes, each, list, listsOf, manual, oneOf, pick, range, section, withNotes, type MajorStructure } from "./model";
import { bulletinSource } from "./source";

const ENGL_181 = each("engl-181", "English", ["ENGL 181"]);
const MATH_11_14 = each("math-11-14", "Mathematics", codes("MATH", "11 12 13 14"));
const PHYS_31_33 = each("phys-31-33", "Physics", codes("PHYS", "31 32 33"));
const CHEM_11 = oneOf("chem-11", "CHEM 11 or 11T", [
  ["CHEM 11", ["CHEM 11"]],
  ["CHEM 11T", ["CHEM 11T"]],
]);
const SENIOR_DESIGN = (subject: string) => each("senior-design", "Senior design", codes(subject, "194 195 196"));

// ---------------------------------------------------------------------------
// Electrical Engineering, B.S.
// ---------------------------------------------------------------------------

const PROFESSIONAL_DEVELOPMENT_EE =
  "A professional development experience selected from one of the following options: four or more units in a study abroad program that does not duplicate other coursework; cooperative education experience with enrollment in ECEN 188 and ECEN 189; 3 units in ENGR 110 (Community-Based Engineering Design); preparation for graduate study in electrical engineering with completion of 2 or more additional units of upper-division or graduate-level courses; completion of an approved minor or second major in any field of engineering or science; completion of 10 or more units in the combined bachelor of science and master of science program; 2 units of Peer education experience; 2 units of undergraduate research, ECEN 199.";

const ECEN_ELECTIVE_RANGE = { subjects: ["ECEN"], from: 100, to: 199, exclude: ["ECEN 188", "ECEN 189"] };

export const ELECTRICAL_ENGINEERING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "EE",
    "Department of Electrical and Computer Engineering",
    "Transcribed from the Bulletin's 'Major in Electrical Engineering'. The fifth technical elective is any undergraduate ECEN 100-level elective except ECEN 188 and 189.",
  ),
  lists: listsOf(
    list("ee-science", "One of CHEM 12, PHYS 113 or 121, MATH 53, 105 or 123", ["CHEM 12", "PHYS 113", "PHYS 121", "MATH 53", "MATH 105", "MATH 123"]),
    list("ic-design", "IC Design", codes("ECEN", "116 117 151 152 153 156")),
    list("systems", "Systems", codes("ECEN", "118 130 132 133 134 158 160 161")),
    list("rf-communication", "RF and Communication", codes("ECEN", "105 141 142 144")),
    list("power-systems", "Power Systems", codes("ECEN", "164 183 184")),
    list("digital-embedded", "Digital and Embedded Systems", codes("ECEN", "121 122 123 127 131 162 180")),
    range("ecen-electives", "Undergraduate ECEN 100-level electives (not ECEN 188 or 189)", ECEN_ELECTIVE_RANGE),
  ),
  sections: [
    section("english", "English", [ENGL_181]),
    section("math-science", "Mathematics and natural science", [
      MATH_11_14,
      each("amth", "AMTH 106 and AMTH 108", ["AMTH 106", "AMTH 108"]),
      CHEM_11,
      PHYS_31_33,
      oneOf("phys-34-or-math-51", "PHYS 34 or MATH 51", [
        ["PHYS 34", ["PHYS 34"]],
        ["MATH 51", ["MATH 51"]],
      ]),
      pick("science-elective", "One course selected from CHEM 12, PHYS 113 or 121, MATH 53, 105 or 123", 1, ["ee-science"], "One course from the list."),
    ]),
    section("engineering", "Engineering", [
      each("engr-1", "ENGR 1", ["ENGR 1"]),
      withNotes(each("csen-10", "CSEN 10", ["CSEN 10"]), "Or demonstrated equivalent programming proficiency."),
      each("csen-11-12", "CSEN 11, CSEN 12", ["CSEN 11", "CSEN 12"]),
      each("mech-121", "MECH 121", ["MECH 121"]),
      each("ecen-core", "ECEN core", codes("ECEN", "20 21 50 100 104 110 115 120 192 194 195 196")),
    ]),
    section("technical-electives", "Technical electives", [
      pick(
        "technical-electives-areas",
        "Technical electives: one course from at least four of the five areas",
        4,
        ["ic-design", "systems", "rf-communication", "power-systems", "digital-embedded"],
        "Five undergraduate ECEN 100-level elective courses are required. One course must be selected from at least four of the following five areas.",
        { minDistinctLists: 4 },
      ),
      pick(
        "technical-elective-fifth",
        "Fifth technical elective",
        1,
        ["ecen-electives"],
        "The fifth of the five undergraduate ECEN 100-level elective courses.",
        {
          notes: [
            "Additional electives may be substituted, with the approval of the advisor, including first-year graduate-level electrical engineering coursework. ECEN 188 and 189 may not be used as technical electives.",
          ],
        },
      ),
    ]),
    section("professional-development", "Professional development", [
      manual("professional-development", "Professional development experience", PROFESSIONAL_DEVELOPMENT_EE),
    ]),
  ],
  notes: ["Electrical engineering majors complete a minimum of 190 units."],
};

// ---------------------------------------------------------------------------
// Electrical and Computer Engineering, B.S.
// ---------------------------------------------------------------------------

export const ELECTRICAL_COMPUTER_ENGINEERING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "ECEN",
    "Department of Electrical and Computer Engineering",
    "Transcribed from the Bulletin's 'Major in Electrical and Computer Engineering'. CSEN 79 or CSCI 163 may replace one of the two listed ECEN electives (at most one).",
  ),
  lists: listsOf(
    list("ecen-science", "One of CHEM 11 or 12, PHYS 34, 113 or 121, MATH 105 or 123", [
      "CHEM 11",
      "CHEM 12",
      "PHYS 34",
      "PHYS 113",
      "PHYS 121",
      "MATH 105",
      "MATH 123",
    ]),
    list("ecen-listed-electives", "ECEN 123, 127, 131, 162, 180", codes("ECEN", "123 127 131 162 180")),
    list("ecen-substitute", "Substitute for one of these: CSEN 79 or CSCI 163", ["CSEN 79", "CSCI 163"]),
    range("ecen-electives", "Undergraduate ECEN 100-level electives (not ECEN 188 or 189)", ECEN_ELECTIVE_RANGE),
  ),
  sections: [
    section("english", "English", [ENGL_181]),
    section("math-science", "Mathematics and natural science", [
      each("math", "Mathematics", codes("MATH", "11 12 13 14 51 53")),
      each("amth", "AMTH 106 and AMTH 108", ["AMTH 106", "AMTH 108"]),
      PHYS_31_33,
      pick("science-elective", "One course selected from CHEM 11 or 12, PHYS 34, 113 or 121, MATH 105 or 123", 1, ["ecen-science"], "One course from the list."),
    ]),
    section("engineering", "Engineering", [
      each("engr-1", "ENGR 1", ["ENGR 1"]),
      each("csen", "CSEN 10, 11, 12, and 177", codes("CSEN", "10 11 12 177")),
      each("ecen-core", "ECEN core", codes("ECEN", "20 21 50 100 115 120 121 122 133 142 192 194 195 196")),
    ]),
    section("technical-electives", "Technical electives", [
      pick(
        "technical-electives-listed",
        "Two technical electives from ECEN 123, 127, 131, 162, 180",
        2,
        ["ecen-listed-electives", "ecen-substitute"],
        "Two electives must be selected from: ECEN 123, 127, 131, 162, 180. Either CSEN 79 or CSCI 163 may be substituted for one of these ECEN electives.",
        { maxPerList: { "ecen-substitute": 1 } },
      ),
      pick(
        "technical-electives-ecen",
        "Two additional ECEN 100-level technical electives",
        2,
        ["ecen-electives"],
        "Two additional electives must be selected from undergraduate ECEN 100-level elective courses.",
        {
          notes: [
            "With advisor approval at most one technical elective may be selected from CSEN courses. ECEN 188 and 189 may not be used as technical electives. Additional electives may be substituted, with the approval of the advisor from first-year graduate-level engineering coursework.",
          ],
        },
      ),
    ]),
    section("professional-development", "Professional development", [
      manual(
        "professional-development",
        "Professional development experience",
        PROFESSIONAL_DEVELOPMENT_EE.replace(
          "preparation for graduate study in electrical engineering",
          "preparation for graduate study in either electrical and computer engineering or computer science and engineering",
        ),
      ),
    ]),
  ],
  notes: ["Electrical and computer engineering majors complete a minimum of 190 units."],
};

// ---------------------------------------------------------------------------
// Mechanical Engineering, B.S.
// ---------------------------------------------------------------------------

export const MECHANICAL_ENGINEERING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "MECH",
    "Department of Mechanical Engineering",
    "Transcribed from the Bulletin's 'Requirements for the Major'. A course written with its lab or recitation (\"MECH 15/15L\", \"MECH 121/121R\") is listed as both codes.",
  ),
  lists: listsOf(),
  sections: [
    section("english", "English", [ENGL_181]),
    section("math-science", "Mathematics and natural science", [
      MATH_11_14,
      each("amth-106", "AMTH 106", ["AMTH 106"]),
      each("mech-103", "MECH 103/103R", ["MECH 103", "MECH 103R"]),
      oneOf("numerical-methods", "AMTH 118 or MATH 166", [
        ["AMTH 118", ["AMTH 118"]],
        ["MATH 166", ["MATH 166"]],
      ]),
      CHEM_11,
      PHYS_31_33,
      each("mech-15", "MECH 15/15L", ["MECH 15", "MECH 15L"]),
    ]),
    section("engineering", "Engineering", [
      each("engr-1", "ENGR 1, 1L", ["ENGR 1", "ENGR 1L"]),
      each("ceng", "CENG 41, 43/43L", ["CENG 41", "CENG 43", "CENG 43L"]),
      each("mech-45", "MECH 45/45L", ["MECH 45", "MECH 45L"]),
      oneOf("circuits", "ECEN 50/50L or PHYS 70", [
        ["ECEN 50/50L", ["ECEN 50", "ECEN 50L"]],
        ["PHYS 70", ["PHYS 70"]],
      ]),
      each(
        "mech-core",
        "Mechanical engineering core",
        codes("MECH", "10L 11 12L 101L 114 115 121 121R 122 122L 123 123L 140 140R 141 141L"),
      ),
      oneOf("mech-142", "MECH 142/142L (or ECEN 130/130L)", [
        ["MECH 142/142L", ["MECH 142", "MECH 142L"]],
        ["ECEN 130/130L", ["ECEN 130", "ECEN 130L"]],
      ]),
      each("mech-capstone", "MECH 160/160L, 194, 195, 196", codes("MECH", "160 160L 194 195 196")),
    ]),
    section("technical-electives", "Technical electives", [
      manual(
        "technical-electives",
        "12 units of technical electives",
        "12 units of technical electives. This requirement may be satisfied by: taking (a) pre-approved upper-division MECH courses, (b) graduate courses (with major GPA 3.0 or above), (c) Co-Op (up to 4 units): MECH 188 (2 units, Co-op Education) & MECH 189 (2 units, Co-op Technical Report), and/or (d) MECH 199 (up to 8 units): Directed Research with a faculty advisor.",
        undefined,
        [
          "Students may apply a maximum of 8 units used to fulfill requirements toward another major/minor program toward meeting the above technical electives requirement. Courses from other departments need pre-approval from the Mechanical Engineering Department.",
          "The Bulletin does not print the pre-approved MECH list, so CampusVal does not count this from courses.",
        ],
      ),
    ]),
  ],
  notes: ["Mechanical engineering majors complete a minimum of 192 units."],
};

// ---------------------------------------------------------------------------
// Civil Engineering, B.S.
// ---------------------------------------------------------------------------

const CENG_DESIGN = codes("CENG", "122 133 134 135 137 138 142 144 146 147 150 162 165 166");
const CENG_ANALYSIS = [...codes("CENG", "116 122 123 137 139 151 160"), "ENVS 116", ...codes("CENG", "161 162 165 166 182 185 186 187")];

export const CIVIL_ENGINEERING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "CENG",
    "Department of Civil, Environmental and Sustainable Engineering",
    "Transcribed from the Bulletin's 'Requirements for the Major in Civil Engineering'. The Bulletin lists CENG 43L in the engineering list without CENG 43; it is transcribed as written.",
  ),
  lists: listsOf(
    list("design", "Design-focused electives", CENG_DESIGN, "CENG 134, 135 and 144 are taken with their laboratories (134L, 135L, 144L)."),
    list("analysis", "Analysis-focused electives", CENG_ANALYSIS, "CENG 123 is taken with CENG 123L. CENG 160 may be replaced by ENVS 116."),
  ),
  sections: [
    section("english", "English", [ENGL_181]),
    section("math-science", "Mathematics and natural science", [
      MATH_11_14,
      oneOf("differential-equations", "AMTH 106 (or MATH 22)", [
        ["AMTH 106", ["AMTH 106"]],
        ["MATH 22", ["MATH 22"]],
      ]),
      oneOf("probability", "AMTH 112 (or AMTH 108)", [
        ["AMTH 112", ["AMTH 112"]],
        ["AMTH 108", ["AMTH 108"]],
      ]),
      CHEM_11,
      PHYS_31_33,
      each("ceng-20", "CENG 20, 20L", ["CENG 20", "CENG 20L"]),
    ]),
    section("engineering", "Engineering", [
      each("engr-1", "ENGR 1, 1L", ["ENGR 1", "ENGR 1L"]),
      oneOf("circuits", "ECEN 49 (or ECEN 50)", [
        ["ECEN 49", ["ECEN 49"]],
        ["ECEN 50", ["ECEN 50"]],
      ]),
      each("ceng-7-10", "CENG 7, 7L, 10, 10L", codes("CENG", "7 7L 10 10L")),
      oneOf("ceng-15", "CENG 15 (or ENVS 15), 15L (satisfied by ENVS 15)", [
        ["CENG 15 and 15L", ["CENG 15", "CENG 15L"]],
        ["ENVS 15", ["ENVS 15"]],
      ]),
      each(
        "ceng-core",
        "Civil engineering core",
        codes("CENG", "41 44 43L 115 115L 121 121L 125 125L 128 132 140 140L 141 141L 143 143L 145 148 192A 192B 193 194"),
      ),
      oneOf("ceng-160-or-182", "Either CENG 160 (or ENVS 116) or CENG 182", [
        ["CENG 160", ["CENG 160"]],
        ["ENVS 116", ["ENVS 116"]],
        ["CENG 182", ["CENG 182"]],
      ]),
    ]),
    section("electives", "Technical electives", [
      pick("electives-design", "Two design-focused technical electives", 2, ["design"], "Five technical electives, with at least two design-focused electives."),
      pick("electives-analysis", "One analysis-focused technical elective", 1, ["analysis"], "Five technical electives, with at least one analysis-focused elective."),
      pick(
        "electives-more",
        "Two more technical electives",
        2,
        ["design", "analysis"],
        "The remaining two of the five technical electives, design- or analysis-focused.",
        {
          notes: [
            "The technical electives should be selected in consultation with an academic advisor. The program requires that students take either CENG 160 or CENG 182; whichever course is not taken to satisfy this requirement may be taken as a technical elective.",
          ],
        },
      ),
    ]),
  ],
  notes: ["Civil engineering majors complete a minimum of 191 units."],
};

// ---------------------------------------------------------------------------
// Bioengineering, B.S. (three tracks)
// ---------------------------------------------------------------------------

const BIOE_TE_NOTE =
  "8 units minimum. Of the required minimum of 8 TE units, at least 4 units must be upper-division BIOE courses. BIOE 100 can only be taken up to two times. Maximum of 6 units combined for co-ops, internships, and supervised independent research. Non-BIOE units will not be credited. The course not selected as a required course may count as a TE.";
const BIOE_TE_COMMON = codes("BIOE", "100 108 111 130");

export const BIOENGINEERING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "BIOE",
    "Department of Bioengineering",
    "Transcribed from the Bulletin's 'Requirements for the Major'. The three tracks (biomolecular, medical-device, pre-med) are separate requirement sets; the technical electives are counted in units, so the recommended courses are listed to browse.",
  ),
  lists: listsOf(
    list("bioethics", "Bioethics", ["BIOE 180", "BIOL 171", "ENGR 19", "PHIL 27", "PHIL 117", "TESP 157"]),
    list("te-biomolecular", "Recommended technical electives (biomolecular track)", [
      ...BIOE_TE_COMMON,
      ...codes("BIOE", "138 139 150 154 155 156 157 158 159 161 166 167 168 170 173 174 177A 177B 178 179 180 181 185 186 187 190 188 189 198 199"),
      ...codes("BIOL", "110 113 114 122 172 174 178 179"),
      ...codes("CHEM", "111 141 142 150 151"),
      "PHYS 171",
    ]),
    list("te-medical-device", "Recommended technical electives (medical-device track)", [
      ...codes("BIOE", "100 106 107 108 111 130 148 150 156 157 163 166 167 168 170 172 173 175 176 177A 177B 178 179 180 181 185 186 187 190 188 189 198 199"),
      "AMTH 118",
      "CSEN 140",
      "CSCI 183",
      "CSCI 184",
      ...codes("ECEN", "115 116 123"),
      "CSEN 123",
      "MECH 143",
      ...codes("ECEN", "133 151 156 160"),
      "MECH 151",
      "PHYS 171",
    ]),
    list("te-pre-med", "Recommended technical electives (pre-med track)", [
      ...codes("BIOE", "100 107 108 111 130 138 139 140 141 148 150 154 155 156 157 161 163 166 167 168 170 173 174 175 176 177A 177B 178 179 180 181 185 186 187 190 188 189 198 199"),
      ...codes("BIOL", "110 113 114 122 172 174 178 179"),
      ...codes("CHEM", "111 141 142 150 151"),
      "PHYS 171",
    ]),
  ),
  sections: [
    section("english", "English", [ENGL_181]),
    section("bioethics", "Bioethics", [pick("bioethics", "Bioethics", 1, ["bioethics"], "One course from BIOE 180, BIOL 171, ENGR 19, PHIL 27, PHIL 117 or TESP 157.")]),
    section("mathematics", "Mathematics", [
      MATH_11_14,
      each("amth-106", "AMTH 106", ["AMTH 106"]),
      oneOf("bioe-120", "BIOE 120 (or AMTH 108)", [
        ["BIOE 120", ["BIOE 120"]],
        ["AMTH 108", ["AMTH 108"]],
      ]),
    ]),
    section("engineering", "Engineering", [
      each("engr-1", "ENGR 1, 1L", ["ENGR 1", "ENGR 1L"]),
      each("bioe-core", "BIOE 1, 23, 24, 25, 45", codes("BIOE", "1 23 24 25 45")),
    ]),
    section("senior-design", "Senior design project sequence", [SENIOR_DESIGN("BIOE")]),

    section("biomolecular-science", "Biomolecular track: natural science", [
      each("biomolecular-science", "Natural science (biomolecular track)", [...codes("BIOE", "21 22"), ...codes("CHEM", "11 12 31 32"), ...codes("PHYS", "31 32 33")]),
    ], "biomolecular"),
    section("biomolecular-engineering", "Biomolecular track: engineering", [
      each("biomolecular-engineering", "Engineering (biomolecular track)", codes("BIOE", "32 153 162 163 171 172 175 176")),
    ], "biomolecular"),
    section("biomolecular-te", "Biomolecular track: technical electives", [
      manual("te-biomolecular", "Technical electives (biomolecular track)", BIOE_TE_NOTE, ["te-biomolecular"]),
    ], "biomolecular"),

    section("medical-device-science", "Medical-device track: natural science", [
      each("medical-device-science", "Natural science (medical-device track)", [...codes("BIOE", "21 22"), ...codes("CHEM", "11 12 31"), ...codes("PHYS", "31 32 33")]),
    ], "medical-device"),
    section("medical-device-engineering", "Medical-device track: engineering", [
      each("medical-device-engineering", "Engineering (medical-device track)", ["MECH 10L", ...codes("BIOE", "32 153 154 155 161 162 168 171 174")]),
    ], "medical-device"),
    section("medical-device-te", "Medical-device track: technical electives", [
      manual("te-medical-device", "Technical electives (medical-device track)", BIOE_TE_NOTE, ["te-medical-device"]),
    ], "medical-device"),

    section("pre-med-science", "Pre-med track: natural science", [
      each("pre-med-biology", "BIOL 1A, 1B", ["BIOL 1A", "BIOL 1B"]),
      oneOf("pre-med-biol-1c", "BIOL 1C (replaceable with BIOE 22)", [
        ["BIOL 1C", ["BIOL 1C"]],
        ["BIOE 22", ["BIOE 22"]],
      ]),
      oneOf("pre-med-bioe-24-25", "BIOE 24 or 25", [
        ["BIOE 24", ["BIOE 24"]],
        ["BIOE 25", ["BIOE 25"]],
      ]),
      each("pre-med-chemistry-physics", "CHEM 11, 12, 31, 32, 33; PHYS 31, 32, 33", [...codes("CHEM", "11 12 31 32 33"), ...codes("PHYS", "31 32 33")]),
    ], "pre-med"),
    section("pre-med-engineering", "Pre-med track: engineering", [
      each("pre-med-engineering", "BIOE 153, 162, 161, 171, 172", codes("BIOE", "153 162 161 171 172")),
      oneOf("pre-med-154-155", "BIOE 154 or 155", [
        ["BIOE 154", ["BIOE 154"]],
        ["BIOE 155", ["BIOE 155"]],
      ]),
    ], "pre-med"),
    section("pre-med-te", "Pre-med track: technical electives", [
      manual("te-pre-med", "Technical electives (pre-med track)", BIOE_TE_NOTE, ["te-pre-med"]),
    ], "pre-med"),
  ],
  variants: {
    kind: "track",
    required: true,
    options: [
      { key: "biomolecular", label: "Biomolecular track" },
      { key: "medical-device", label: "Medical-device track" },
      { key: "pre-med", label: "Pre-med track" },
    ],
  },
  notes: ["Bioengineering majors complete a minimum of 191 units and the requirements of one track, together with associated labs."],
};

// ---------------------------------------------------------------------------
// Computer Science and Engineering, B.S.; Web Design and Engineering, B.S.
// ---------------------------------------------------------------------------

const EDUCATIONAL_ENRICHMENT =
  "An educational enrichment experience selected from one of the following options: 8 or more units in a study abroad program that does not duplicate other coursework; acceptance to one of the school's master's degree programs and completion of at least the first 12 units of that program prior to completion of the undergraduate degree; undergraduate research with completion of 6 or more units of CSEN 193 (cannot also be used to satisfy a CSEN elective); 12 or more units approved by an academic advisor. The courses must be part of a theme or be in the same department, and may not also be used to satisfy other requirements of the student's primary major.";
const ENRICHMENT_NOTE =
  "Any units satisfying the Educational Enrichment requirement that are applied to the MS program must be in addition to the 182 units required for the undergraduate degree.";
const CSEN_SENIOR_DESIGN = [
  each("csen-192", "CSEN 192", ["CSEN 192"]),
  oneOf("csen-194", "CSEN 194 (or ENGR 194)", [
    ["CSEN 194", ["CSEN 194"]],
    ["ENGR 194", ["ENGR 194"]],
  ]),
  oneOf("csen-195", "CSEN 195 (or ENGR 195)", [
    ["CSEN 195", ["CSEN 195"]],
    ["ENGR 195", ["ENGR 195"]],
  ]),
  oneOf("csen-196", "CSEN 196 (or ENGR 196)", [
    ["CSEN 196", ["CSEN 196"]],
    ["ENGR 196", ["ENGR 196"]],
  ]),
];
const CHEM_11_REPLACEMENTS = ["BIOL 18", "ENVS 21", "PHYS 34"];

export const COMPUTER_SCIENCE_ENGINEERING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "CSE",
    "Department of Computer Science and Engineering",
    "Transcribed from the Bulletin's 'Bachelor of Science in Computer Science and Engineering'. AP scores that replace CHEM 11 are not courses, so CampusVal cannot count them; the course replacements are listed.",
  ),
  lists: listsOf(
    list("amth-106", "AMTH 106", ["AMTH 106"]),
    range("amth-106-substitutes", "Pre-approved substitutions for AMTH 106: MATH 101–178, or a CHEM 11 replacement", { subjects: ["MATH"], from: 101, to: 178 }, CHEM_11_REPLACEMENTS),
    list("chem-11", "CHEM 11 or CHEM 11T", ["CHEM 11", "CHEM 11T"]),
    list("chem-11-replacements", "Pre-approved replacements for CHEM 11", CHEM_11_REPLACEMENTS, "AP Biology or AP Environmental Science (score of 4 or 5) also replace CHEM 11."),
    list("math-53-alternatives", "MATH 53 or CSCI 166 or AMTH 118", ["MATH 53", "CSCI 166", "AMTH 118"]),
    range("cse-electives", "CSEN 101–180, ECEN 115, or 133", { subjects: ["CSEN"], from: 101, to: 180 }, ["ECEN 115", "ECEN 133"]),
  ),
  sections: [
    section("english", "English", [ENGL_181]),
    section("math-science", "Mathematics and natural science", [
      MATH_11_14,
      pick(
        "amth-106",
        "AMTH 106 or an advisor-approved mathematics or natural science elective",
        1,
        ["amth-106", "amth-106-substitutes"],
        "AMTH 106, or a pre-approved substitution: MATH 101–178, or any CHEM 11 replacement (if not used to replace CHEM 11).",
      ),
      each("amth-108", "AMTH 108", ["AMTH 108"]),
      pick("math-53", "MATH 53 or CSCI 166 or AMTH 118", 1, ["math-53-alternatives"], "One of the three."),
      pick(
        "chem-11",
        "CHEM 11 or CHEM 11T or an advisor-approved natural science elective",
        1,
        ["chem-11", "chem-11-replacements"],
        "CHEM 11 or CHEM 11T, or a pre-approved replacement: AP Biology (score of 4 or 5), AP Environmental Science (score of 4 or 5), BIOL 18, ENVS 21, and PHYS 34.",
      ),
      PHYS_31_33,
    ]),
    section("engineering", "Engineering", [
      each("engr-1", "ENGR 1, ENGR 1L", ["ENGR 1", "ENGR 1L"]),
      oneOf("ecen-21", "ECEN 21 (or CSEN 21)", [
        ["ECEN 21", ["ECEN 21"]],
        ["CSEN 21", ["CSEN 21"]],
      ]),
      each("ecen", "ECEN 50, 153", ["ECEN 50", "ECEN 153"]),
      withNotes(each("csen-10", "CSEN 10", ["CSEN 10"]), "Or demonstrated equivalent programming proficiency."),
      each("csen-core", "CSEN core", codes("CSEN", "11 12 19 20 79 122 146 171 174 175 177 179")),
      ...CSEN_SENIOR_DESIGN,
    ]),
    section("cse-electives", "Computer Science and Engineering electives", [
      pick(
        "cse-electives",
        "Three upper-division electives (at least 12 units)",
        3,
        ["cse-electives"],
        "Three upper-division courses (totaling at least 12 units) selected from CSEN 101–180, ECEN 115, or 133, in an emphasis area selected in consultation with an academic advisor.",
        {
          notes: [
            "6 units of CSEN 193 or 4 units of CSEN 199 may be used as one elective, and at most one upper-division course from another department may be used as an elective, with advisor approval, and cannot also be used as a substitution for AMTH 106.",
          ],
        },
      ),
    ]),
    section("enrichment", "Educational enrichment", [manual("educational-enrichment", "Educational enrichment experience", EDUCATIONAL_ENRICHMENT, undefined, [ENRICHMENT_NOTE])]),
  ],
  notes: ["Computer science and engineering majors complete a minimum of 182 units, together with associated labs."],
};

export const WEB_DESIGN_ENGINEERING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "WDE",
    "Department of Computer Science and Engineering",
    "Transcribed from the Bulletin's 'Bachelor of Science in Web Design and Engineering'; its educational enrichment requirement is 'Same as for the bachelor of science in computer science and engineering', copied from there.",
  ),
  lists: listsOf(),
  sections: [
    section("arts-humanities", "Arts, humanities, and social science", [
      ENGL_181,
      oneOf("arts-74", "ARTS 74 or 174", [
        ["ARTS 74", ["ARTS 74"]],
        ["ARTS 174", ["ARTS 174"]],
      ]),
      oneOf("arts-75", "ARTS 75 or 175", [
        ["ARTS 75", ["ARTS 75"]],
        ["ARTS 175", ["ARTS 175"]],
      ]),
      each("arts-177", "ARTS 177", ["ARTS 177"]),
      each("comm-12", "COMM 12", ["COMM 12"]),
      oneOf("comm-3-30", "COMM 3 or 30", [
        ["COMM 3", ["COMM 3"]],
        ["COMM 30", ["COMM 30"]],
      ]),
      each("comm-50", "COMM 50", ["COMM 50"]),
      oneOf("soci-49", "SOCI 49 or 149", [
        ["SOCI 49", ["SOCI 49"]],
        ["SOCI 149", ["SOCI 149"]],
      ]),
    ]),
    section("math-science", "Mathematics and natural science", [
      MATH_11_14,
      each("amth-108", "AMTH 108", ["AMTH 108"]),
      manual("natural-science", "Natural science course", "Natural Science - any natural science course from the list approved by the University Core."),
    ]),
    section("engineering", "Engineering", [
      each("engr-1", "ENGR 1", ["ENGR 1"]),
      oneOf("programming", "CSEN 10, 11, 12 (or CSCI 10, 60, 61)", [
        ["CSEN 10, 11, 12", codes("CSEN", "10 11 12")],
        ["CSCI 10, 60, 61", codes("CSCI", "10 60 61")],
      ]),
      each("csen-core", "CSEN core", codes("CSEN", "60 146 161 162 163 164 169 174")),
      ...CSEN_SENIOR_DESIGN,
    ]),
    section("enrichment", "Educational enrichment", [manual("educational-enrichment", "Educational enrichment experience", EDUCATIONAL_ENRICHMENT, undefined, [ENRICHMENT_NOTE])]),
  ],
  notes: ["Web design and engineering majors complete a minimum of 175 units, together with associated labs. CSEN 10 may be met by demonstrated equivalent programming proficiency."],
};

// ---------------------------------------------------------------------------
// Engineering (General Engineering), B.S.
// ---------------------------------------------------------------------------

export const GENERAL_ENGINEERING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "GENR",
    "Department of General Engineering",
    "Transcribed from the Bulletin's 'Requirements for the Major in Engineering'. The 36-unit upper-division concentration is designed with an advisor, so CampusVal does not count it from courses.",
  ),
  lists: listsOf(),
  sections: [
    section("math-science", "Mathematics and natural sciences", [
      MATH_11_14,
      each("amth-106", "AMTH 106", ["AMTH 106"]),
      withNotes(each("amth-108", "AMTH 108", ["AMTH 108"]), "Or other approved upper-division mathematics elective."),
      withNotes(CHEM_11, "And associated labs."),
      withNotes(PHYS_31_33, "And associated labs."),
    ]),
    section("engineering", "Engineering", [
      each("engr", "ENGR 1, 1L, ENGR 2, ENGR 110", ["ENGR 1", "ENGR 1L", "ENGR 2", "ENGR 110"]),
      each("bioe-111", "BIOE 111", ["BIOE 111"]),
      each("ceng", "CENG 41, 43, 43L", codes("CENG", "41 43 43L")),
      oneOf("programming", "CSEN 10 and 10L (or other approved programming course and lab)", [
        ["CSEN 10 and 10L", ["CSEN 10", "CSEN 10L"]],
        ["CSEN 11 and 11L", ["CSEN 11", "CSEN 11L"]],
        ["CSCI 10", ["CSCI 10"]],
        ["OMIS 30", ["OMIS 30"]],
      ]),
      each("ecen", "ECEN 21, 21L, 50, 50L, 115, 115L", codes("ECEN", "21 21L 50 50L 115 115L")),
      each("mech", "MECH 10L, 11, 15, 15L, 121", codes("MECH", "10L 11 15 15L 121")),
    ]),
    section("advanced-writing", "Advanced writing", [ENGL_181]),
    section("concentration", "Upper-division concentration", [
      manual("concentration", "Upper-division concentration (36 units)", "36 upper-division units defining a coherent concentration, selected in consultation with an academic advisor."),
    ]),
    section("design", "Design sequence", [
      oneOf("engr-193", "ENGR 193 or ENGR 197A", [
        ["ENGR 193", ["ENGR 193"]],
        ["ENGR 197A", ["ENGR 197A"]],
      ]),
      each("engr-163", "ENGR 163", ["ENGR 163"]),
      oneOf(
        "senior-design",
        "ENGR 194, 195, 196 or ENGR 197B-D",
        [
          ["ENGR 194, 195, 196", codes("ENGR", "194 195 196")],
          ["ENGR 197B-D", codes("ENGR", "197B 197C 197D")],
          ["With permission: BIOE 194, 195, 196", codes("BIOE", "194 195 196")],
          ["With permission: CENG 192A, 192B, 192C, 193, 194", codes("CENG", "192A 192B 192C 193 194")],
          ["With permission: CSEN 194, 195, 196", codes("CSEN", "194 195 196")],
          ["With permission: ECEN 194, 195, 196", codes("ECEN", "194 195 196")],
          ["With permission: MECH 194, 195, 196", codes("MECH", "194 195 196")],
        ],
        "ENGR 194, 195, 196 or ENGR 197B-D and any associated labs. With permission, you may alternatively choose from one of the department sequences.",
      ),
    ]),
  ],
  notes: ["Engineering majors complete a minimum of 189 units and the specified requirements for their concentration."],
};

export const SOE_STRUCTURES: Record<string, MajorStructure> = {
  EE: ELECTRICAL_ENGINEERING_STRUCTURE,
  ECEN: ELECTRICAL_COMPUTER_ENGINEERING_STRUCTURE,
  MECH: MECHANICAL_ENGINEERING_STRUCTURE,
  CENG: CIVIL_ENGINEERING_STRUCTURE,
  BIOE: BIOENGINEERING_STRUCTURE,
  CSE: COMPUTER_SCIENCE_ENGINEERING_STRUCTURE,
  WDE: WEB_DESIGN_ENGINEERING_STRUCTURE,
  GENR: GENERAL_ENGINEERING_STRUCTURE,
};
