/**
 * Leavey School of Business majors, transcribed from the SCU 2026-27 Undergraduate Bulletin (Chapter 4),
 * "Requirements for the Major". Each is "in addition to fulfilling undergraduate Core Curriculum and
 * Leavey School of Business requirements": the Leavey core (BUSN 70, ECON 1-3, ACTG 11-12, OMIS 40-41,
 * the upper-division Common Core and MGMT 162) is its own requirement group (degree-requirements.ts),
 * so a Leavey core course never fills a major elective here.
 */
import { codes, each, list, listsOf, manual, oneOf, pick, range, section, withNotes, type MajorStructure } from "./model";
import { bulletinSource } from "./source";

/** Leavey core courses that are not major electives (FNCE 121, MGMT 160, MKTG 181, OMIS 108, MGMT 162...). */
const LEAVEY_CORE_UPPER = ["FNCE 121", "MGMT 160", "MGMT 162", "MGMT 196", "MKTG 181", "OMIS 108"];
const leaveyCoreNote = (subject: string) =>
  `Leavey core courses (${LEAVEY_CORE_UPPER.filter((c) => c.startsWith(subject)).join(", ")}) belong to the Leavey School of Business requirements, so they are not counted as ${subject} electives here.`;

export const ACCOUNTING_STRUCTURE: MajorStructure = {
  ...bulletinSource("ACTG", "Department of Accounting", "Transcribed from the Bulletin's 'Major in Accounting'."),
  lists: listsOf(),
  sections: [
    section("accounting", "Accounting", [
      withNotes(
        each("actg-core", "Accounting core", codes("ACTG", "120 130 131 132 134 135 136 138")),
        "Accounting majors may use ACTG 134 to satisfy both the information systems requirement in the Leavey School of Business curriculum and the Science, Technology & Society requirement in the University Core.",
      ),
    ]),
  ],
  notes: [],
};

const AIS_ELECTIVES = codes("OMIS", "107 111 113 114 120 121 135 137");

export const ACCOUNTING_INFORMATION_SYSTEMS_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "AIS",
    "Department of Information Systems and Analytics and Department of Accounting",
    "Transcribed from the Information Systems and Analytics page's 'Major in Accounting and Information Systems (AIS)'. The Accounting page's version of the same major lists ACTG 155 without OMIS 150 and says majors are required to enroll in ACTG 155; both texts are kept, and the difference is shown on the requirement.",
  ),
  lists: listsOf(list("ais-elective", "OMIS 107, 111, 113, 114, 120, 121, 135, 137", AIS_ELECTIVES)),
  sections: [
    section("accounting", "Accounting", [each("actg-core", "Accounting core", codes("ACTG", "120 130 131 132 135 136 138"))]),
    section("information-systems", "Information systems", [
      withNotes(
        each("omis-30", "OMIS 30", ["OMIS 30"]),
        "Accounting and information systems majors may use either OMIS 30 or OMIS 31 to satisfy the information systems requirement in the Leavey School of Business curriculum.",
      ),
      each("omis-105-106", "OMIS 105, 106", ["OMIS 105", "OMIS 106"]),
      withNotes(
        oneOf("omis-150", "OMIS 150 (or ACTG 155)", [
          ["OMIS 150", ["OMIS 150"]],
          ["ACTG 155", ["ACTG 155"]],
        ]),
        "OMIS 150 is cross-listed with ACTG 155. Students must register for ACTG 155 to take the CPA exam.",
        "The Department of Accounting's page lists ACTG 155 only and says majors are required to enroll in ACTG 155. Confirm with your advisor.",
      ),
      pick("ais-elective", "One course from OMIS 107, 111, 113, 114, 120, 121, 135, 137", 1, ["ais-elective"], "One course from the list."),
    ]),
  ],
  notes: ["A course cannot be double-dipped in multiple programs."],
};

export const BUSINESS_ANALYTICS_STRUCTURE: MajorStructure = {
  ...bulletinSource("BANL", "Department of Information Systems and Analytics", "Transcribed from the Bulletin's 'Major in Business Analytics (BA)'."),
  lists: listsOf(
    list("ba-elective", "ACTG 134, ACTG 155, OMIS 105, 112, 113, 114, 118, ECON 173, 174, FNCE 146, MKTG 182, MKTG 192", [
      "ACTG 134",
      "ACTG 155",
      ...codes("OMIS", "105 112 113 114 118"),
      "ECON 173",
      "ECON 174",
      "FNCE 146",
      "MKTG 182",
      "MKTG 192",
    ]),
  ),
  sections: [
    section("analytics", "Business analytics", [
      each("omis-30", "OMIS 30", ["OMIS 30"]),
      each("ba-core", "OMIS 109, 115, 163, and 164", codes("OMIS", "109 115 163 164")),
      pick("ba-electives", "Two courses from the business analytics list", 2, ["ba-elective"], "Two courses from the list."),
    ]),
  ],
  notes: ["A course cannot be double-dipped in multiple programs."],
};

export const MANAGEMENT_INFORMATION_SYSTEMS_STRUCTURE: MajorStructure = {
  ...bulletinSource("OMIS", "Department of Information Systems and Analytics", "Transcribed from the Bulletin's 'Major in Management Information Systems (MIS)'."),
  lists: listsOf(list("mis-elective", "OMIS 111, 112, 113, 114, 116, 117, 118, 120, 121, 135, 137, 150", codes("OMIS", "111 112 113 114 116 117 118 120 121 135 137 150"))),
  sections: [
    section("information-systems", "Management information systems", [
      withNotes(
        each("omis-30", "OMIS 30", ["OMIS 30"]),
        "Majors in management information systems take OMIS 30 or OMIS 31, which satisfies the information systems requirement in the business core.",
      ),
      each("mis-core", "OMIS 105, 106, and 107", codes("OMIS", "105 106 107")),
      pick("mis-electives", "Three courses from the MIS list", 3, ["mis-elective"], "Three courses from the list."),
    ]),
  ],
  notes: ["A course cannot be double-dipped in multiple programs."],
};

export const FINANCE_STRUCTURE: MajorStructure = {
  ...bulletinSource("FNCE", "Department of Finance", "Transcribed from the Bulletin's 'Requirements for the Major'."),
  lists: listsOf(
    list("quantitative", "MATH 12 or 31 or FNCE 186", ["MATH 12", "MATH 31", "FNCE 186"]),
    range("finance-electives", "Upper-division finance electives", {
      subjects: ["FNCE"],
      from: 100,
      to: 199,
      exclude: ["FNCE 118", "FNCE 121", "FNCE 127", "FNCE 129", "FNCE 131"],
    }),
  ),
  sections: [
    section("finance", "Finance", [
      each("fnce-core", "FNCE 124 and 125", ["FNCE 124", "FNCE 125"]),
      pick("quantitative", "Math 12 or 31 or FNCE 186", 1, ["quantitative"], "One of MATH 12, MATH 31 or FNCE 186."),
      pick("finance-electives", "Four upper-division finance electives", 4, ["finance-electives"], "Four upper-division finance electives.", {
        notes: [
          "FNCE 186 qualifies as one of the four upper-division finance electives required for finance majors. FNCE 118, FNCE 127, FNCE 129, and FNCE 131 do NOT satisfy upper-division elective requirements for finance majors and are not included in the finance major GPA.",
          leaveyCoreNote("FNCE"),
          "A course counts once here: FNCE 186 used for the MATH 12 / 31 requirement is not counted again as an elective. Confirm with your advisor if you need it to count for both.",
        ],
      }),
    ]),
  ],
  notes: [],
};

export const MANAGEMENT_STRUCTURE: MajorStructure = {
  ...bulletinSource("MGMT", "Department of Management and Entrepreneurship", "Transcribed from the Bulletin's 'Requirements for the Major'."),
  lists: listsOf(
    list(
      "management-electives",
      "MGMT 110, 113, 132, 134, 164, 165, 166, 168, 169, 170, 171, 172, 173, 175, 176, 177, 178, 179, 180, 197, 198 (5 units), 198E, and 199 (5 units)",
      codes("MGMT", "110 113 132 134 164 165 166 168 169 170 171 172 173 175 176 177 178 179 180 197 198 198E 199"),
      "MGMT 198 and MGMT 199 count when taken for 5 units.",
    ),
  ),
  sections: [
    section("management", "Management", [
      each("mgmt-161", "MGMT 161", ["MGMT 161"]),
      pick("management-electives", "Four management electives", 4, ["management-electives"], "Four courses selected from the list."),
    ]),
  ],
  notes: [],
};

const MKTG_BT_STRONG = ["MKTG 185", "MKTG 187"];
const MKTG_CC_STRONG = codes("MKTG", "165 175 186");

export const MARKETING_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "MKTG",
    "Department of Marketing",
    "Transcribed from the Bulletin's 'Requirements for the Major'. The emphases only recommend courses (\"an emphasis will not appear on a student's transcript\"), so they are shown as lists inside the elective requirement, not as requirements.",
  ),
  lists: listsOf(
    range("marketing-electives", "Marketing electives (upper-division MKTG courses)", {
      subjects: ["MKTG"],
      from: 100,
      to: 199,
      exclude: ["MKTG 179", "MKTG 181", "MKTG 198"],
    }),
    list(
      "business-technology",
      "Business and Technology Marketing Emphasis (recommended)",
      [...MKTG_BT_STRONG, ...codes("MKTG", "173 174 175 177 186 188 189 190 191 193 194")],
      "MKTG 185 and 187 are strongly recommended.",
    ),
    list(
      "consumer-channel",
      "Consumer and Channel Marketing Emphasis (recommended)",
      [...MKTG_CC_STRONG, ...codes("MKTG", "173 174 177 178 187 189 190 191 193 194")],
      "MKTG 165, 175 and 186 are strongly recommended.",
    ),
    list(
      "individually-designed",
      "Individually Designed Marketing Emphasis (typical courses)",
      codes("MKTG", "165 173 174 175 177 178 185 186 187 188 189 190 191 192 193 194"),
      "Three courses selected with the student's marketing faculty advisor.",
    ),
  ),
  sections: [
    section("marketing", "Marketing", [
      withNotes(each("mktg-core", "MKTG 182 and 183", ["MKTG 182", "MKTG 183"]), "Recommended to be completed in junior year, prior to electives."),
      withNotes(
        oneOf("mktg-179", "MKTG 179 (cross-listed with BUSN 179)", [
          ["MKTG 179", ["MKTG 179"]],
          ["BUSN 179", ["BUSN 179"]],
        ]),
        "MKTG 179 and BUSN 179 are cross-listed and are required for all majors.",
      ),
      pick(
        "marketing-electives",
        "Three marketing electives",
        3,
        ["marketing-electives", "business-technology", "consumer-channel", "individually-designed"],
        "Three elective courses in marketing must be completed. The emphases inform students of recommended classes; an emphasis will not appear on a student's transcript.",
        {
          notes: [
            "The MKTG 198 internship elective should be designed to augment the student's career goals. However, MKTG 198 cannot be substituted for an elective course in the major.",
            leaveyCoreNote("MKTG"),
          ],
        },
      ),
    ]),
  ],
  notes: [],
};

/** Economics: the same major in the Leavey School (B.S. Commerce) and the College (B.S.); the electives differ. */
function economics(key: "ECON" | "ECON_CAS", electives: number, department: string): MajorStructure {
  const lsb = key === "ECON";
  return {
    ...bulletinSource(
      key,
      department,
      `Transcribed from the Bulletin's 'Requirements for the Major' and its two concentrations. ${lsb ? "Three" : "Five"} upper-division economics electives.`,
    ),
    lists: listsOf(
      list("statistics", "MATH 8 or OMIS 40 or MATH 122 or AMTH 108", ["MATH 8", "OMIS 40", "MATH 122", "AMTH 108"]),
      list("econ-181-182", "ECON 181 or 182", ["ECON 181", "ECON 182"]),
      range("econ-electives", "Upper-division economics electives", { subjects: ["ECON"], from: 100, to: 199 }),
      list("data-b", "ECON 173 or 174", ["ECON 173", "ECON 174"]),
      list(
        "data-c",
        "ECON 112, 134, 135, 142, 150, 151, 154, 166, 186, 187, 188, 192; 173 or 174 (if not used to satisfy B)",
        codes("ECON", "112 134 135 142 150 151 154 166 186 187 188 192 173 174"),
        "ECON 192 counts if taken 3 times.",
      ),
      list("data-substitutes", "Pre-approved substitutions (one only)", ["CSCI 183", "ENVS 117", "OMIS 114", "OMIS 150"]),
      list("math-econ", "ECON 170, 171, 172, 173, 174, 187, or 188", codes("ECON", "170 171 172 173 174 187 188")),
    ),
    sections: [
      section("economics", "Economics", [
        each("econ-principles", "ECON 1, 2, and 3", codes("ECON", "1 2 3")),
        oneOf("calculus", "MATH 30 and 31, or MATH 11, 12, and 13", [
          ["MATH 30 and 31", ["MATH 30", "MATH 31"]],
          ["MATH 11, 12, and 13", codes("MATH", "11 12 13")],
        ]),
        pick("statistics", "MATH 8 or OMIS 40 or MATH 122 or AMTH 108", 1, ["statistics"], "One of the four."),
        lsb
          ? withNotes(each("econometrics", "ECON 41 and 42", ["ECON 41", "ECON 42"]), "Satisfies OMIS 41 requirement in the Leavey School of Business core.")
          : each("econometrics", "ECON 41 and 42", ["ECON 41", "ECON 42"]),
        each("econ-theory", "ECON 113, 114, and 115", codes("ECON", "113 114 115")),
        pick("econ-181-182", "ECON 181 or 182", 1, ["econ-181-182"], "One of the two."),
        pick(
          "econ-electives",
          `${electives === 3 ? "Three" : "Five"} upper-division economics electives`,
          electives,
          ["econ-electives"],
          `${electives === 3 ? "Three" : "Five"} upper-division economics electives, at least two of which must be completed after ECON 113 and 115.`,
        ),
      ]),
      section("data-analysis", "Concentration in Data Analysis for Economics", [
        each("data-analysis-econ-43", "ECON 43", ["ECON 43"]),
        pick("data-analysis-b", "One of the following: ECON 173 or 174", 1, ["data-b"], "One of the two."),
        pick(
          "data-analysis-c",
          "Three of the following",
          3,
          ["data-c", "data-substitutes"],
          "Three of the following: ECON 112, 134, 135, 142, 150, 151, 154, 166, 186, 187, 188, 192 (if taken 3 times); 173 or 174 (if not used to satisfy B).",
          {
            maxPerList: { "data-substitutes": 1 },
            notes: [
              "Pass these courses with a grade of “C” or higher. All upper-division courses in the concentration can count as upper-division electives toward the economics major. One (and only one) of the courses in list C may be substituted with an approved course; substitutions must be approved by the Concentration advisor. Non-economics courses will not count as one of the upper-division electives toward the economics major.",
            ],
          },
        ),
      ], "data-analysis"),
      section("mathematical-economics", "Mathematical Economics Concentration", [
        withNotes(
          each("math-econ-math", "MATH 11, 12, 13, 14, 53, AMTH 106", [...codes("MATH", "11 12 13 14 53"), "AMTH 106"]),
          "MATH 122 and 123 are strongly recommended. Students completing the mathematical economics concentration take MATH 11, 12, and 13 instead of MATH 30 and 31.",
        ),
        pick("math-econ-electives", "Three of ECON 170, 171, 172, 173, 174, 187, or 188", 3, ["math-econ"], "These courses also count as electives required for the major."),
      ], "mathematical-economics"),
    ],
    variants: {
      kind: "concentration",
      required: false,
      options: [
        { key: "data-analysis", label: "Concentration in Data Analysis for Economics" },
        { key: "mathematical-economics", label: "Mathematical Economics Concentration" },
      ],
    },
    notes: [],
  };
}

export const ECONOMICS_LSB_STRUCTURE = economics("ECON", 3, "Department of Economics (Leavey School of Business)");
export const ECONOMICS_CAS_STRUCTURE = economics("ECON_CAS", 5, "Department of Economics (College of Arts and Sciences)");

export const LSB_STRUCTURES: Record<string, MajorStructure> = {
  ACTG: ACCOUNTING_STRUCTURE,
  AIS: ACCOUNTING_INFORMATION_SYSTEMS_STRUCTURE,
  BANL: BUSINESS_ANALYTICS_STRUCTURE,
  OMIS: MANAGEMENT_INFORMATION_SYSTEMS_STRUCTURE,
  FNCE: FINANCE_STRUCTURE,
  MGMT: MANAGEMENT_STRUCTURE,
  MKTG: MARKETING_STRUCTURE,
  ECON: ECONOMICS_LSB_STRUCTURE,
  ECON_CAS: ECONOMICS_CAS_STRUCTURE,
};
