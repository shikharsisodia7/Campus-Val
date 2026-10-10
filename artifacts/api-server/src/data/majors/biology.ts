import type { MajorStructure } from "./model";

// ---------------------------------------------------------------------------
// Biology, B.S. — SCU 2026-27 Undergraduate Bulletin, Department of Biology
// ---------------------------------------------------------------------------

const BIOLOGY_THEME_CMB = ["BIOL 110", "BIOL 112", "BIOL 113", "BIOL 115", "BIOL 122", "BIOL 174", "BIOL 175"];
const BIOLOGY_THEME_EEB = [
  "BIOL 120",
  "BIOL 134",
  "BIOL 151",
  "BIOL 156",
  "BIOL 158",
  "BIOL 165",
  "BIOL 173",
  "BIOL 180",
  "BIOL 181",
];
const BIOLOGY_THEME_MOD = ["BIOL 117", "BIOL 160", "BIOL 170", "BIOL 172", "BIOL 178"];

export const BIOLOGY_STRUCTURE: MajorStructure = {
  defaultSubject: "BIOL",
  sourceUrl: "https://www.scu.edu/bulletin/undergraduate/chapter-3-college-of-arts-and-sciences/biology.html",
  sourceLabel: "SCU 2026-27 Undergraduate Bulletin — Department of Biology, Requirements for the Major",
  catalogYear: "2026-27",
  lastVerified: "2026-10-09",
  verificationNote:
    "Transcribed from the Bulletin's 'Requirements for the Major' section and checked course by course against its course listings. " +
    "Every theme course (CMB, EEB, MOD) is listed there as a lecture-and-laboratory (L&L) course; BIOL 102 is the only JES course with a laboratory.",
  sourceText: [
    "In addition to fulfilling the undergraduate Core Curriculum requirements for the bachelor of science degree, students majoring in biology must complete the following departmental requirements:",
    "BIOL 1A, 1B, and 1C",
    "CHEM 11, 12, 31, 32, and 33",
    "PHYS 11, 12, 13 or PHYS 31, 32, 33",
    "MATH 35 and 36 (recommended) or MATH 11 and 12",
    "BIOL 101",
    "Seven approved upper-division biology courses, including five with a laboratory component",
    "For these seven courses, students will take one course each from Upper Division Themes (CMB, EEB, MOD), all with laboratory, plus at least 4 elective courses, at least two with laboratory. Electives may be selected from Theme or Specialty courses. For one of their 4 electives, students are strongly recommended to take a course in Justice and Equity in Science (JES) theme.",
    "Cell and Molecular Biology (CMB): 110, 112, 113, 115, 122, 174, 175",
    "Ecology, Evolution and Biodiversity (EEB): 120, 134, 151, 156, 158, 165, 173, 180, 181",
    "Biological Modeling (MOD): 117, 160, 170, 172, 178",
    "Justice and Equity in Science (JES): 102, 169, 171",
    "Specialty Courses with lab: 104, 114AW, 116, 123, 124, 142AW, 144, 176, 177, 191, 198*",
    "Specialty Courses (lecture only): 105, 106, 111, 119, 145, 153, 164, 179, 189, CHEM 141, 142",
    "*Requires faculty mentor",
  ],
  lists: {
    cmb: {
      key: "cmb",
      label: "Theme: Cell and Molecular Biology (CMB)",
      courses: BIOLOGY_THEME_CMB,
      note: "The 2026-27 Bulletin titles BIOL 115 “Animal Development L&L”; CampusVal's course catalog still shows its earlier title.",
    },
    eeb: { key: "eeb", label: "Theme: Ecology, Evolution and Biodiversity (EEB)", courses: BIOLOGY_THEME_EEB },
    mod: { key: "mod", label: "Theme: Biological Modeling (MOD)", courses: BIOLOGY_THEME_MOD },
    "jes-lab": {
      key: "jes-lab",
      label: "Theme: Justice and Equity in Science (JES), with laboratory",
      courses: ["BIOL 102"],
      note: "The Bulletin strongly recommends a JES course for one of the four electives.",
    },
    "jes-lecture": {
      key: "jes-lecture",
      label: "Theme: Justice and Equity in Science (JES), lecture only",
      courses: ["BIOL 169", "BIOL 171"],
      note: "The Bulletin strongly recommends a JES course for one of the four electives.",
    },
    "specialty-lab": {
      key: "specialty-lab",
      label: "Specialty courses with lab",
      courses: [
        "BIOL 104",
        "BIOL 114AW",
        "BIOL 116",
        "BIOL 123",
        "BIOL 124",
        "BIOL 142AW",
        "BIOL 144",
        "BIOL 176",
        "BIOL 177",
        "BIOL 191",
        "BIOL 198",
      ],
      note: "BIOL 198 requires a faculty mentor.",
    },
    "specialty-lecture": {
      key: "specialty-lecture",
      label: "Specialty courses (lecture only)",
      courses: [
        "BIOL 105",
        "BIOL 106",
        "BIOL 111",
        "BIOL 119",
        "BIOL 145",
        "BIOL 153",
        "BIOL 164",
        "BIOL 179",
        "BIOL 189",
        "CHEM 141",
        "CHEM 142",
      ],
      note:
        "The Bulletin's list names BIOL 189; its course listings describe BIOL 189A and 189B (2 units each). Confirm with the Biology department which counts.",
    },
  },
  sections: [
    {
      key: "foundation",
      label: "Biology, chemistry, physics and mathematics",
      requirements: [
        {
          key: "biol-intro",
          label: "Introductory biology",
          description: "BIOL 1A, 1B, and 1C",
          rule: { kind: "each", courses: ["BIOL 1A", "BIOL 1B", "BIOL 1C"] },
        },
        {
          key: "chemistry",
          label: "Chemistry",
          description: "CHEM 11, 12, 31, 32, and 33",
          rule: { kind: "each", courses: ["CHEM 11", "CHEM 12", "CHEM 31", "CHEM 32", "CHEM 33"] },
        },
        {
          key: "physics",
          label: "Physics: PHYS 11, 12, 13 or PHYS 31, 32, 33",
          description: "Complete one of the two physics sequences.",
          rule: {
            kind: "alternatives",
            options: [
              { label: "PHYS 11, 12, 13", courses: ["PHYS 11", "PHYS 12", "PHYS 13"] },
              { label: "PHYS 31, 32, 33", courses: ["PHYS 31", "PHYS 32", "PHYS 33"] },
            ],
          },
        },
        {
          key: "mathematics",
          label: "Mathematics: MATH 35 and 36 (recommended) or MATH 11 and 12",
          description: "Complete one of the two calculus sequences; the Bulletin recommends MATH 35 and 36.",
          rule: {
            kind: "alternatives",
            options: [
              { label: "MATH 35 and 36 (recommended)", courses: ["MATH 35", "MATH 36"], recommended: true },
              { label: "MATH 11 and 12", courses: ["MATH 11", "MATH 12"] },
            ],
          },
        },
        {
          key: "biol-101",
          label: "Biology Research Seminar",
          description: "BIOL 101",
          rule: { kind: "each", courses: ["BIOL 101"] },
        },
      ],
    },
    {
      key: "themes",
      label: "Upper-division themes — one course from each, all with laboratory",
      requirements: [
        {
          key: "theme-cmb",
          label: "Cell and Molecular Biology (CMB) theme",
          description: "One CMB theme course, with laboratory.",
          rule: { kind: "choose", count: 1, lists: ["cmb"] },
        },
        {
          key: "theme-eeb",
          label: "Ecology, Evolution and Biodiversity (EEB) theme",
          description: "One EEB theme course, with laboratory.",
          rule: { kind: "choose", count: 1, lists: ["eeb"] },
        },
        {
          key: "theme-mod",
          label: "Biological Modeling (MOD) theme",
          description: "One MOD theme course, with laboratory.",
          rule: { kind: "choose", count: 1, lists: ["mod"] },
        },
      ],
    },
    {
      key: "electives",
      label: "Upper-division electives — four, at least two with laboratory",
      requirements: [
        {
          key: "electives-lab",
          label: "Electives with a laboratory component",
          description: "Two elective courses with laboratory, from the Theme or Specialty courses.",
          rule: { kind: "choose", count: 2, lists: ["cmb", "eeb", "mod", "jes-lab", "specialty-lab"] },
        },
        {
          key: "electives-any",
          label: "Electives, with or without laboratory",
          description: "Two more elective courses from the Theme or Specialty courses. A JES course is strongly recommended for one elective.",
          rule: {
            kind: "choose",
            count: 2,
            lists: ["jes-lecture", "jes-lab", "cmb", "eeb", "mod", "specialty-lab", "specialty-lecture"],
          },
          notes: ["For one of the four electives the Bulletin strongly recommends a Justice and Equity in Science (JES) course: BIOL 102, 169 or 171."],
        },
      ],
    },
  ],
  notes: [
    "Seven approved upper-division biology courses, including five with a laboratory component: one course from each of the CMB, EEB and MOD themes (all with laboratory) plus four electives, at least two with laboratory.",
  ],
};

