/**
 * College of Arts and Sciences humanities, social science, arts and language majors, transcribed from
 * the SCU 2026-27 Undergraduate Bulletin (Chapter 3), "Requirements for the Major". Where the Bulletin
 * states a requirement CampusVal cannot read from course codes (an "approved list" it does not print, a
 * course attribute such as "before 1800", units of ensemble), the requirement is shown in its words for
 * the student to track. Course-listing headings are used only where a requirement names them (Political
 * Science subfields, History fields).
 */
import { codes, each, list, listsOf, manual, oneOf, pick, range, section, withNotes, type MajorStructure } from "./model";
import { bulletinSource, listedUnder } from "./source";

// ---------------------------------------------------------------------------
// Communication, B.A. (optional emphases)
// ---------------------------------------------------------------------------

const comm = (numbers: string) => codes("COMM", numbers);

export const COMMUNICATION_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "COMM",
    "Department of Communication",
    "Transcribed from the Bulletin's 'Requirements for the Major' and its six optional emphases, which identify specific courses within the same requirements. Bare course numbers in the Bulletin's text (\"199R and/or 199I\") are communication courses.",
  ),
  defaultSubject: "COMM",
  lists: listsOf(
    list("intermediate", "COMM 10, 30, 50, 60, 80", comm("10 30 50 60 80")),
    range("upper-division", "Upper-division communication courses (102-189, 198)", { subjects: ["COMM"], from: 102, to: 189 }, ["COMM 198"]),
    list("independent-study", "COMM 199R, 199I (no more than one section)", ["COMM 199R", "COMM 199I"]),
    list("global-media-a", "Global media list", comm("108 141 142 144 171 180 181A 181D 183 184 185 187")),
    list("global-media-b", "Global media second list", comm("114 115 115G 116 116G 133 137 143 145 154 174 176 189")),
    list("organizational", "Organizational, professional & business list", comm("102 112 115 115J 115V 116 116T 118 119 120 121 122 123 125 126 129 153 187 198"), "A special Topics Course approved by the emphasis director also counts."),
    list("diversity", "Communication, diversity, and culture list", comm("114 115 115G 115J 115V 116 116G 116M 117 140 140B 140C 140W 140Q 142 144 171 174 176 181D 183 187")),
    list("film-production", "Film production list", comm("103 130 130A 131F 131D 131E 132 132D 133 133W 134 135 142")),
    list("film-history", "Film and television history list", comm("104 136S 136F 137 137S 138 139 140 140B 140W 140C 140Q 141 143 145 146")),
    list("journalism", "Journalism list", comm("106 131D 139 142 160 161 161C 163 164 165 165M 168")),
    list("strategic-a", "Strategic communication list", comm("150 151 151A 152 157 158")),
    list("strategic-b", "Strategic communication second list", comm("105 119 121 122 124 153 154Y 155 156 183 187")),
  ),
  sections: [
    section("foundation", "Foundation courses", [each("foundation", "COMM 1, 2, 3, 4", comm("1 2 3 4"))]),
    section("intermediate", "Intermediate courses", [pick("intermediate", "Three intermediate courses", 3, ["intermediate"], "Three Intermediate Courses chosen from the following five courses: COMM 10, 30, 50, 60, 80.")]),
    section("upper-division", "Upper-division requirements", [
      pick(
        "upper-division-electives",
        "Six upper-division communication electives",
        6,
        ["upper-division", "independent-study"],
        "Six elective upper-division communication courses (signified by course numbers 102-189, 198, and no more than one section of 199R and/or 199I).",
        { maxPerList: { "independent-study": 1 } },
      ),
      each("methods-portfolio", "COMM 100, 101, 197", comm("100 101 197")),
    ]),

    section("global-media", "Global Media, Culture, and Technology emphasis", [
      each("global-media-80", "COMM 80", ["COMM 80"]),
      pick("global-media-a", "At least two upper-division electives from the first list", 2, ["global-media-a"], "At least two upper-division electives from this list."),
      pick("global-media-b", "At least one upper-division elective from the second list", 1, ["global-media-b"], "At least one upper-division elective course from this list."),
    ], "global-media"),
    section("organizational", "Organizational, Professional & Business Communication emphasis", [
      each("organizational-10", "COMM 10", ["COMM 10"]),
      pick("organizational-four", "Four upper-division electives from the list", 4, ["organizational"], "Four upper-division electives from the following list."),
    ], "organizational"),
    section("diversity", "Communication, Diversity, and Culture emphasis", [
      each("diversity-core", "COMM 10, COMM 80", ["COMM 10", "COMM 80"]),
      pick("diversity-four", "Four upper-division electives from the list", 4, ["diversity"], "Four upper-division electives from this list."),
    ], "diversity"),
    section("digital-filmmaking", "Digital Filmmaking emphasis", [
      each("film-30", "COMM 30", ["COMM 30"]),
      oneOf("film-50-80", "COMM 50 or COMM 80", [
        ["COMM 50", ["COMM 50"]],
        ["COMM 80", ["COMM 80"]],
      ]),
      pick("film-production", "At least three production electives", 3, ["film-production"], "At least three upper-division electives from this list."),
      pick("film-history", "At least one film or television history elective", 1, ["film-history"], "At least one upper-division elective from this list."),
    ], "digital-filmmaking"),
    section("journalism", "Journalism emphasis", [
      each("journalism-60", "COMM 60", ["COMM 60"]),
      pick("journalism-three", "At least three journalism electives", 3, ["journalism"], "At least three upper-division electives from this list.", {
        notes: [
          "No more than one upper-division elective from COMM 144, 145, 156, 166, 167, 169. Students may complete a minimum of 5 units from repeated practicum courses (COMM 190 Journalism Practicum) to count as one upper-division course.",
        ],
      }),
    ], "journalism"),
    section("strategic", "Strategic Communication emphasis", [
      each("strategic-50", "COMM 50", ["COMM 50"]),
      pick("strategic-one", "At least one strategic communication elective", 1, ["strategic-a"], "At least one upper-division elective from this list."),
      pick("strategic-three", "Three more electives from either list", 3, ["strategic-a", "strategic-b"], "Three upper-division electives from this list or the list above."),
    ], "strategic"),
  ],
  variants: {
    kind: "emphasis",
    required: false,
    options: [
      { key: "global-media", label: "Global Media, Culture, and Technology" },
      { key: "organizational", label: "Organizational, Professional & Business Communication" },
      { key: "diversity", label: "Communication, Diversity, and Culture" },
      { key: "digital-filmmaking", label: "Digital Filmmaking" },
      { key: "journalism", label: "Journalism" },
      { key: "strategic", label: "Strategic Communication" },
    ],
    note: "Communication majors have the option of completing an emphasis within the major. Completion of an emphasis will be noted on student transcripts. Students may only complete one emphasis.",
  },
  notes: [],
};

// ---------------------------------------------------------------------------
// English, History, Political Science
// ---------------------------------------------------------------------------

export const ENGLISH_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "ENGL",
    "Department of English",
    "Transcribed from the Bulletin's 'Requirements for the Major'. Its concentrations and course attributes (period before 1800; theory, gender/sexuality, or ethnic/global studies) are not course lists, so those requirements are shown for the student to track.",
  ),
  lists: listsOf(),
  sections: [
    section("foundation", "Foundation courses", [each("foundation", "ENGL 14, 15, and 16", codes("ENGL", "14 15 16"))]),
    section("requirements", "Major requirements", [
      manual("historical", "Two historically grounded literary or cultural studies courses", "Two historically grounded literary or cultural studies courses; at least one of these courses must be from a period before 1800."),
      manual("literary-concentration", "Three-course concentration in literary/cultural studies", "A three-course concentration in literary/cultural studies (American, British, Global, or individually defined); at least two of these courses must be upper-division."),
      manual("writing-concentration", "Three-course concentration in writing", "A three-course concentration in writing (professional writing and new media, or creative writing, or individually-defined); at least two of these courses must be upper-division."),
      manual("theory", "One upper-division course in theory, gender/sexuality, or ethnic/global studies", "One upper-division course in theory, or gender/sexuality, or ethnic/global studies (this course may also be used to meet another requirement)."),
      manual("senior-seminar", "One senior seminar", "One senior seminar."),
    ]),
  ],
  notes: ["The English Department does not allow students to challenge courses."],
};

const HIST_FIELDS = {
  global: listedUnder("HIST", "Lower-Division Course: Global History", "Upper-Division Courses: Global History"),
  americas: listedUnder(
    "HIST",
    "Lower-Division Courses: United States History",
    "Upper-Division Courses: United States History",
    "Lower-Division Courses: Latin American History",
    "Upper-Division Courses: Latin American History",
  ),
  europe: listedUnder("HIST", "Lower-Division Courses: European History", "Upper-Division Courses: European History"),
  asia: listedUnder("HIST", "Lower-Division Courses: East Asian, South Asian, and Indian Ocean History", "Upper-Division Courses: East Asian, South Asian, and Indian Ocean History"),
  africa: listedUnder("HIST", "Lower-Division Courses: African, West Asian, Middle Eastern History", "Upper-Division Courses: African, West Asian, Middle Eastern History"),
};
const HIST_SEMINARS = Object.values(HIST_FIELDS)
  .flat()
  .filter((c) => /^HIST 1\d\dS$/.test(c));

export const HISTORY_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "HIST",
    "Department of History",
    "Transcribed from the Bulletin's 'Requirements for the Major'. The five geographic fields are read from the Bulletin's course-listing headings (Global; United States and Latin American = Americas; European; East Asian, South Asian, and Indian Ocean; African, West Asian, Middle Eastern). Seminars are the listed courses numbered with an S.",
  ),
  lists: listsOf(
    range("lower-division", "Lower-division history courses", { subjects: ["HIST"], from: 1, to: 99 }),
    range("upper-division", "Upper-division history courses", { subjects: ["HIST"], from: 100, to: 199 }),
    list("seminar", "Seminar courses (apart from HIST 100S and 101S)", HIST_SEMINARS),
    list("field-global", "Global", HIST_FIELDS.global),
    list("field-americas", "Americas (US & Latin)", HIST_FIELDS.americas),
    list("field-europe", "Europe", HIST_FIELDS.europe),
    list("field-asia", "East and South Asia", HIST_FIELDS.asia),
    list("field-africa", "Africa and West Asia", HIST_FIELDS.africa),
  ),
  sections: [
    section("lower-division", "Lower division", [pick("lower-division", "Four lower-division courses", 4, ["lower-division"], "Four lower-division courses, which may include HIST 11A and 12A.")]),
    section("upper-division", "Nine upper-division courses", [
      each("required-seminars", "HIST 100S, HIST 101S", ["HIST 100S", "HIST 101S"]),
      pick("seminar", "One seminar course", 1, ["seminar"], "One Seminar course (apart from HIST 100S and 101S) taken after the student has completed 115 quarter units."),
      pick("upper-division", "Six other upper-division courses", 6, ["upper-division"], "Six other upper-division courses."),
    ]),
    section("breadth", "Geographic breadth", [
      pick(
        "geographic-breadth",
        "At least one course in four of the five fields",
        4,
        ["field-global", "field-americas", "field-europe", "field-asia", "field-africa"],
        "Geographic breadth requirement: at least one course in four of the following fields: Global; Americas (US & Latin); Europe; East and South Asia; Africa and West Asia.",
        { minDistinctLists: 4, overlay: true },
      ),
    ]),
  ],
  notes: [
    "An optional senior project (HIST 197), which makes one eligible for Honors in History, may be taken as one of the required upper-division courses.",
    "Hybrid courses: lower-division hybrid courses are worth 4 units, upper-division hybrid courses 5 units.",
  ],
};

const POLI_SUBFIELDS = {
  us: listedUnder("POLI", "Upper-Division Courses: United States Politics"),
  comparative: listedUnder("POLI", "Upper-Division Courses: Comparative Politics"),
  ir: listedUnder("POLI", "Upper-Division Courses: International Relations"),
  philosophy: listedUnder("POLI", "Upper-Division Courses: Political Philosophy"),
  quantitative: listedUnder("POLI", "Upper-Division Course: Applied Quantitative Methods"),
};

export const POLITICAL_SCIENCE_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "POLI",
    "Department of Political Science",
    "Transcribed from the Bulletin's 'Requirements for the Major' and its three optional emphases. The five subfields are read from the Bulletin's course-listing headings; senior seminars are the courses listed under 'Senior Seminars'.",
  ),
  lists: listsOf(
    list("math", "MATH 8, 11, 30, or 35 (MATH 8 preferred)", codes("MATH", "8 11 30 35")),
    list("us-politics", "United States politics", POLI_SUBFIELDS.us),
    list("comparative", "Comparative politics", POLI_SUBFIELDS.comparative),
    list("international-relations", "International relations", POLI_SUBFIELDS.ir),
    list("political-philosophy", "Political philosophy", POLI_SUBFIELDS.philosophy),
    list("quantitative", "Applied quantitative methods", POLI_SUBFIELDS.quantitative),
    range("upper-division", "Upper-division political science courses", { subjects: ["POLI"], from: 100, to: 199 }),
    list("senior-seminar", "Senior seminars", listedUnder("POLI", "Upper-Division Courses: Senior Seminars")),
    list("public-sector-poli", "Public sector POLI courses", codes("POLI", "152 153 154 157 159 160 161 162 163 165 166 168 170 171 172 173 174 175 176 179")),
    list("public-sector-lower", "Public sector lower-division courses", [
      "POLI 45",
      "ACTG 11",
      "ACTG 12",
      "COMM 2",
      "ECON 3",
      "ELSJ 50",
      "ENVS 11A",
      "ENVS 12A",
      "ENVS 50",
      "ETHN 20",
      "MGMT 6",
      ...codes("PHIL", "28 29 30 30H"),
      "PHSC 1",
      "PHSC 2",
      "SOCI 33",
      "SOCI 65",
    ], "Or others as approved by the emphasis advisor."),
    list("public-sector-outside", "Public sector upper-division courses outside political science", [
      "BIOL 171",
      "CHST 106",
      ...codes("COMM", "151 157 158"),
      ...codes("ECON", "111 113 114 115 120 126 129 136 137 150 160 166 173 181 182 185 190"),
      ...codes("ENVS", "120 122 128 147 150"),
      "HIST 176",
      "MGMT 169",
      "MGMT 171",
      ...codes("PHIL", "108 116 117 118"),
      "PHSC 156",
      "PSYC 134",
      ...codes("SOCI", "132 137 138 140 153 159 160 161 165 172 176 180"),
    ], "Or selected courses from the Washington Semester Program or others as approved by the emphasis advisor."),
    list("ir-seminar", "POLI 196 (International Relations) or POLI 192 (Comparative Politics)", ["POLI 196", "POLI 192"]),
    list("ir-courses", "POLI 119, 121, 122, 123, 124, 125, 126, 127, 128, 131; or 116A and 116B combined", codes("POLI", "119 121 122 123 124 125 126 127 128 131 116A 116B"), "POLI 116A and 116B count as one course when combined."),
    list("ir-outside", "International relations-related courses outside political science", [
      "ANTH 159",
      ...codes("COMM", "183 184 187"),
      ...codes("ECON", "3 3H 129 134 135 137 181 182"),
      ...codes("HIST", "102S 116 121 122 131 139 140 141 145 146B 147B 150 151 157 163"),
      "GNSX 126",
      ...codes("SOCI", "133 134 137"),
      "TESP 108",
      "TESP 159",
    ], "HIST 150 is also listed as GNSX 126. Or other courses as approved by the emphasis advisor."),
    list("pre-law-a", "List A", codes("POLI", "45 124 125 159 160 161 167 168 171 174 175 176 195L 198EL"), "Only one internship course may count toward the emphasis, and the internship must be law-related and be approved by the emphasis advisor."),
    list("pre-law-b", "List B", [
      "BUSN 85",
      "CLAS 188",
      "COMM 167",
      "ECON 126",
      "ELSJ 50",
      "ELSJ 51",
      "ENVS 120",
      "ETHN 126",
      "ETHN 127",
      ...codes("PHIL", "30 30H 43 117 118 119 123"),
      ...codes("SOCI", "159 160 161 162"),
      "GNSX 189",
    ]),
    list("pre-law-c", "List C", ["ENGL 115", "PHIL 17"]),
  ),
  sections: [
    section("lower-division", "Lower division", [
      pick("math", "One mathematics course for the Core mathematics requirement", 1, ["math"], "One course from the following list to satisfy the Core mathematics requirement: MATH 8, 11, 30, or 35 (with MATH 8 preferred)."),
      each("poli-core", "POLI 1, 2, 25, 30, 99", codes("POLI", "1 2 25 30 99")),
      oneOf("poli-40", "POLI 40 (ECON 1 or 2 may be substituted)", [
        ["POLI 40", ["POLI 40"]],
        ["ECON 1", ["ECON 1"]],
        ["ECON 2", ["ECON 2"]],
      ]),
    ]),
    section("upper-division", "Seven upper-division courses", [
      pick(
        "subfields",
        "One lecture course from four of the five subfields",
        4,
        ["us-politics", "comparative", "international-relations", "political-philosophy", "quantitative"],
        "One lecture course from four of the following five subfields: United States politics, comparative politics, international relations, political philosophy, and applied quantitative methods.",
        { minDistinctLists: 4 },
      ),
      pick("senior-seminar", "A political science senior seminar", 1, ["senior-seminar"], "A political science senior seminar taken after achieving senior status or with the permission of the instructor."),
      pick("electives", "Two upper-division electives", 2, ["upper-division"], "Two upper-division electives from any political science subfields, one of which may be a 5-unit internship class."),
    ]),

    section("public-sector", "Emphasis in Public Sector Studies", [
      each("public-sector-econ", "ECON 1 and 2", ["ECON 1", "ECON 2"]),
      withNotes(each("public-sector-167", "POLI 167", ["POLI 167"]), "With a grade of C or better."),
      manual("public-sector-internship", "Internship", "POLI 97 and POLI 198 combined, Washington Semester Program internships, or Panetta Congressional Internship."),
      pick("public-sector-poli", "One upper-division POLI course for public sector", 1, ["public-sector-poli"], "One upper-division POLI course for public sector."),
      pick("public-sector-lower", "Two additional lower-division courses", 2, ["public-sector-lower"], "Two additional lower-division courses from the list."),
      pick("public-sector-outside", "Two additional upper-division courses outside political science", 2, ["public-sector-outside"], "Two additional upper-division courses (outside of the political science department)."),
    ], "public-sector"),
    section("international-relations", "Emphasis in International Relations", [
      pick("ir-seminar", "Senior seminar: POLI 196 or POLI 192", 1, ["ir-seminar"], "Senior seminar: POLI 196 (International Relations) or POLI 192 (Comparative Politics)."),
      pick("ir-courses", "Three upper-division international relations courses", 3, ["ir-courses"], "POLI 119, 121, 122, 123, 124, 125, 126, 127, 128, 131; or 116A and 116B combined."),
      pick("ir-outside", "One international relations-related course outside political science", 1, ["ir-outside"], "One course from the list."),
      manual("ir-off-campus", "One off-campus academic experience with an international relations component", "Study Abroad; Washington Semester Program; Arrupe placement; local internship approved by the emphasis advisor; or POLI 116A and 116B combined, if not counted above as an upper-division course."),
    ], "international-relations"),
    section("pre-law", "Emphasis in Pre-Law", [
      pick("pre-law-a", "Three courses from List A", 3, ["pre-law-a"], "Three courses from List A."),
      pick("pre-law-b", "One course from List B", 1, ["pre-law-b"], "One course from List B."),
      pick("pre-law-c", "One course from List C", 1, ["pre-law-c"], "One course from List C."),
      pick("pre-law-bc", "One additional course from either List B or List C", 1, ["pre-law-b", "pre-law-c"], "One additional course from either List B or List C."),
    ], "pre-law"),
  ],
  variants: {
    kind: "emphasis",
    required: false,
    options: [
      { key: "public-sector", label: "Emphasis in Public Sector Studies" },
      { key: "international-relations", label: "Emphasis in International Relations" },
      { key: "pre-law", label: "Emphasis in Pre-Law" },
    ],
    note: "Political science majors may select an emphasis in pre-law, public sector studies, or international relations, which will be noted on the student's transcript.",
  },
  notes: ["Students in the Political Science Honors Program must complete the requirements noted under the Honors Program."],
};

// ---------------------------------------------------------------------------
// Sociology, Anthropology, Child Studies
// ---------------------------------------------------------------------------

export const SOCIOLOGY_STRUCTURE: MajorStructure = {
  ...bulletinSource("SOCI", "Department of Sociology", "Transcribed from the Bulletin's 'Requirements for the Major'."),
  lists: listsOf(
    list("methods", "SOCI 121 or 122", ["SOCI 121", "SOCI 122"]),
    range("upper-division", "Upper-division sociology electives", { subjects: ["SOCI"], from: 100, to: 199 }),
    list("lower-division-elective", "SOCI 26, 30, 33, 49, 60, 65, 91, and 99 (one only)", codes("SOCI", "26 30 33 49 60 65 91 99")),
  ),
  sections: [
    section("core", "Core courses", [
      each("soci-1", "SOCI 1", ["SOCI 1"]),
      each("soci-core", "SOCI 35, 118, 119, 120, 198", codes("SOCI", "35 118 119 120 198")),
      pick("methods", "SOCI 121 or 122", 1, ["methods"], "One of the two."),
    ]),
    section("electives", "Eight electives", [
      pick("electives-upper", "Seven upper-division sociology electives", 7, ["upper-division"], "Choose 8 upper-division sociology electives OR seven upper-division sociology electives and one lower-division elective."),
      pick("electives-eighth", "One more elective (upper-division, or one lower-division elective)", 1, ["upper-division", "lower-division-elective"], "The eighth elective: an upper-division sociology elective or one lower-division elective from among SOCI 26, 30, 33, 49, 60, 65, 91, and 99."),
    ]),
  ],
  notes: [],
};

export const ANTHROPOLOGY_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "ANTH",
    "Department of Anthropology",
    "Transcribed from the Bulletin's 'Requirements for the Major'. The Bulletin's emphasis programs (applied, archaeology, biological) state no course requirements, so they are not modeled.",
  ),
  sourceCorrections: { "BIOL 160": "The Bulletin writes \"BIO 160/ENVS 110\" (BIOL 160 is cross-listed with ENVS 110)." },
  lists: listsOf(
    list("anth-intro", "ANTH 4, 5, 6, 7, or 12A", codes("ANTH", "4 5 6 7 12A")),
    list("statistics", "MATH 8, BIOL 160/ENVS 110, PSYC 105, POLI 101", ["MATH 8", "BIOL 160", "ENVS 110", "PSYC 105", "POLI 101"]),
    list("methods-1", "Methods 1: ANTH 111, 112, 113", codes("ANTH", "111 112 113")),
    list("methods-2", "Methods 2", ["ENVS 116", "ETHN 165", "PHSC 50", "PSYC 105", "BIOL 160", "ENVS 110", "GNSX 102", ...codes("ANTH", "111 112 113")], "BIOL 160/ENVS 110 counts here in addition to MATH 8. ENVS 116 includes 116a. An additional ANTH Methods 1 class also counts."),
    range("archaeology", "Archaeology (ANTH 140–149, 173, 186, 189)", { subjects: ["ANTH"], from: 140, to: 149 }, codes("ANTH", "173 186 189")),
    range("biological", "Biological Anthropology (ANTH 130–139)", { subjects: ["ANTH"], from: 130, to: 139 }),
    range("cultural", "Cultural Anthropology (ANTH 150–179, 184, 185, 187, 188)", { subjects: ["ANTH"], from: 150, to: 179 }, codes("ANTH", "184 185 187 188")),
  ),
  sections: [
    section("foundation", "Foundation", [
      each("anth-1-3", "ANTH 1, 2, 3", codes("ANTH", "1 2 3")),
      pick("anth-intro", "ANTH 4, 5, 6, 7, or 12A", 1, ["anth-intro"], "One of the five."),
      oneOf("anth-50", "ANTH/ENVS 50", [
        ["ANTH 50", ["ANTH 50"]],
        ["ENVS 50", ["ENVS 50"]],
      ]),
      each("anth-110", "ANTH 110", ["ANTH 110"]),
    ]),
    section("methods", "Statistics and methods", [
      pick("statistics", "One statistics course", 1, ["statistics"], "One of the following statistics courses: MATH 8, BIOL 160/ENVS 110, PSYC 105, POLI 101."),
      pick("methods-1", "One Methods 1 course", 1, ["methods-1"], "One of the following Methods 1 courses: ANTH 111, 112, 113."),
      pick("methods-2", "One Methods 2 course", 1, ["methods-2"], "One of the following Methods 2 courses: ENVS 116/116a, ETHN 165, PHSC 50, PSYC 105, BIOL 160/ENVS 110 (in addition to MATH 8), GNSX 102, or an additional ANTH Methods 1 class."),
      each("anth-114-198", "ANTH 114, ANTH 198", ["ANTH 114", "ANTH 198"]),
    ]),
    section("upper-division", "Six upper-division courses", [
      pick("categories", "Six upper-division courses, all three categories represented", 6, ["archaeology", "biological", "cultural"], "Six upper-division courses selected from the following three categories (all three categories must be represented).", {
        minDistinctLists: 3,
      }),
    ]),
  ],
  notes: ["Anthropology majors have the option of completing a special emphasis program (applied anthropology, archaeology, or biological), noted on transcripts with the approval of the department chair."],
};

export const CHILD_STUDIES_STRUCTURE: MajorStructure = {
  ...bulletinSource("CHST", "Child Studies Program", "Transcribed from the Bulletin's 'Requirements for the Major'."),
  lists: listsOf(
    list("elective", "CHST 66, 109, 114, 115, 154Y, 138 (recommended), 190, 199; ENVS 131; PSYC 134, 172", [...codes("CHST", "66 109 114 115 154Y 138 190 199"), "ENVS 131", "PSYC 134", "PSYC 172"], "CHST 138 is recommended."),
  ),
  sections: [
    section("program", "Program requirements", [
      withNotes(each("chst-core", "Child studies core", codes("CHST", "3 4 5 6 11 12 75 100 101 102 104 106 180 181 182")), "CHST 106 is an ELSJ course."),
      withNotes(each("psychology", "PSYC 2, 185", ["PSYC 2", "PSYC 185"]), "PSYC 185 is an ELSJ course."),
      pick("elective", "One elective", 1, ["elective"], "One elective selected from the list."),
    ]),
  ],
  notes: [],
};

// ---------------------------------------------------------------------------
// Philosophy, Religious Studies, Ethnic Studies, Gender and Sexuality Studies
// ---------------------------------------------------------------------------

const phil = (from: number, to: number) => ({ subjects: ["PHIL"], from, to });

export const PHILOSOPHY_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "PHIL",
    "Department of Philosophy",
    "Transcribed from the Bulletin's 'Requirements for the Major' and its emphases. Ranges (PHIL 124–127) are read against the catalog; 141A–151 and 174–181A are read as 141–151 and 174–181.",
  ),
  lists: listsOf(
    range("lower-division", "PHIL 40–45", phil(40, 45)),
    list("logic", "PHIL 17 or 18", ["PHIL 17", "PHIL 18"]),
    range("history-a", "PHIL 124–127", phil(124, 127)),
    range("history-b", "PHIL 141A–151", phil(141, 151)),
    range("history-c", "PHIL 174–181A", phil(174, 181)),
    range("non-western", "PHIL 174–180 (Non-Western Philosophy)", phil(174, 180)),
    range("ethics-a", "PHIL 109–112", phil(109, 112)),
    range("ethics-b", "PHIL 120–129, 152, 154", phil(120, 129), ["PHIL 152", "PHIL 154"]),
    range("metaphysics", "PHIL 150–165 (Metaphysics and Epistemology)", phil(150, 165)),
    range("upper-division", "PHIL 108–199", phil(108, 199), [], "To qualify as an upper-division elective, any PHIL 199 class must be 5 units."),
    range("emphasis-p", "Pre-Law and Justice (P) courses", phil(116, 129), codes("PHIL", "108 110 113 152 156 162 185A 186")),
    range("emphasis-e", "Ethics and Values (E) courses", phil(108, 130), codes("PHIL", "141 146 152 159 165 176 181 183 184 185A 186 187B 188")),
    range("emphasis-s", "Science and Analysis (S) courses", phil(150, 165), ["PHIL 128", "PHIL 130"]),
    {
      key: "emphasis-h",
      label: "History of Philosophy (H) courses",
      courses: codes("PHIL", "150 151 155 184"),
      pattern: phil(124, 127),
    },
    range("emphasis-h-2", "History of Philosophy (H) courses, PHIL 141–145", phil(141, 145)),
    range("emphasis-h-3", "History of Philosophy (H) courses, PHIL 174–181", phil(174, 181)),
    range("emphasis-ip", "International & Comparative Philosophy (IP) courses", phil(173, 180), ["PHIL 141", "PHIL 142", "PHIL 170"], "PHIL 170 is strongly recommended."),
  ),
  sections: [
    section("lower-division", "Lower division", [
      pick("lower-division", "One lower-division course from PHIL 40–45", 1, ["lower-division"], "One lower-division course from PHIL 40–45.", {
        notes: ["Waived for students who completed a Foundations Core sequence in Philosophy (PHIL 1A/2A or PHIL 11A/12A). CampusVal does not apply the waiver; confirm it with your advisor."],
      }),
      each("history-western", "PHIL 14, 15, and 16 (History of Western Philosophy)", codes("PHIL", "14 15 16")),
      pick("logic", "PHIL 17 or 18 (Informal or Formal Logic)", 1, ["logic"], "One of the two."),
      each("phil-19", "PHIL 19 (Knowledge and Reality)", ["PHIL 19"]),
    ]),
    section("upper-division", "Upper division", [
      pick("history", "One course from PHIL 124–127, 141A–151, 174–181A (History of Philosophy)", 1, ["history-a", "history-b", "history-c"], "One course from the ranges.", {
        notes: ["No one class may fulfill both the Non-Western Philosophy and the History of Philosophy requirement."],
      }),
      pick("non-western", "One course from PHIL 174–180 (Non-Western Philosophy)", 1, ["non-western"], "One course from the range."),
      pick("ethical-theory", "One course from PHIL 109–112, 120–129, 152, 154 (Ethical Theory)", 1, ["ethics-a", "ethics-b"], "One course from the ranges."),
      pick("metaphysics", "One course from PHIL 150–165 (Metaphysics and Epistemology)", 1, ["metaphysics"], "One course from the range."),
      pick("electives", "Four additional upper-division courses", 4, ["upper-division"], "Four additional upper-division courses elected from PHIL 108–199."),
    ]),
    section("emphasis-p", "Pre-Law and Justice (P) emphasis", [pick("emphasis-p", "Four upper-division courses from the Pre-Law and Justice list", 4, ["emphasis-p"], "Four upper-division courses (PHIL 108–199) chosen from the approved list.")], "pre-law-justice"),
    section("emphasis-e", "Ethics and Values (E) emphasis", [pick("emphasis-e", "Four upper-division courses from the Ethics and Values list", 4, ["emphasis-e"], "Four upper-division courses (PHIL 108–199) chosen from the approved list.")], "ethics-values"),
    section("emphasis-s", "Science and Analysis (S) emphasis", [pick("emphasis-s", "Four upper-division courses from the Science and Analysis list", 4, ["emphasis-s"], "Four upper-division courses (PHIL 108–199) chosen from the approved list.")], "science-analysis"),
    section("emphasis-h", "History of Philosophy (H) emphasis", [pick("emphasis-h", "Four upper-division courses from the History of Philosophy list", 4, ["emphasis-h", "emphasis-h-2", "emphasis-h-3"], "Four upper-division courses (PHIL 108–199) chosen from the approved list.")], "history-of-philosophy"),
    section("emphasis-ip", "International & Comparative Philosophy (IP) emphasis", [pick("emphasis-ip", "Four upper-division courses from the International & Comparative list", 4, ["emphasis-ip"], "Four upper-division courses (PHIL 108–199) chosen from the approved list.")], "international-comparative"),
  ],
  variants: {
    kind: "emphasis",
    required: false,
    options: [
      { key: "pre-law-justice", label: "Pre-Law and Justice (P)" },
      { key: "ethics-values", label: "Ethics and Values (E)" },
      { key: "science-analysis", label: "Science and Analysis (S)" },
      { key: "history-of-philosophy", label: "History of Philosophy (H)" },
      { key: "international-comparative", label: "International & Comparative Philosophy (IP)" },
    ],
    note: "An emphasis may be taken as part of a philosophy major or minor. Upper-division courses that may be used to fulfill an emphasis requirement are indicated in the course title with a parenthetical letter.",
  },
  notes: [],
};

const RS_SUBJECTS = ["SCTR", "TESP", "RSOC", "RELS"];

export const RELIGIOUS_STUDIES_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "RSOC",
    "Department of Religious Studies",
    "Transcribed from the Bulletin's 'Requirements for the Major'. The three areas are the Bulletin's subjects: scripture and tradition (SCTR); theology, ethics, and spirituality (TESP); religion and society (RSOC). The Bulletin does not mark which courses are seminars, so the three area seminars are shown for the student to track.",
  ),
  lists: listsOf(
    range("scripture-tradition", "Scripture and tradition (SCTR) lower-division", { subjects: ["SCTR"], from: 1, to: 99 }),
    range("theology-ethics", "Theology, ethics, and spirituality (TESP) lower-division", { subjects: ["TESP"], from: 1, to: 99 }),
    range("religion-society", "Religion and society (RSOC) lower-division", { subjects: ["RSOC"], from: 1, to: 99 }),
    range("upper-division", "Upper-division religious studies courses (SCTR, TESP, RSOC, RELS)", { subjects: RS_SUBJECTS, from: 100, to: 199 }),
    list("christian-theology", "Christian Theology", [
      "SCTR 111",
      "SCTR 111R",
      "SCTR 128",
      ...codes("TESP", "119 119R 124 124R 131"),
      "GNSX 149",
      "TESP 131R",
      "GNSX 149R",
      ...codes("TESP", "141 152 185 185R 196 196R"),
    ], "TESP 131 is cross-listed as GNSX 149, and TESP 131R as GNSX 149R."),
  ),
  sections: [
    section("lower-division", "Lower division", [
      pick(
        "lower-division",
        "Three lower-division courses, one from each area",
        3,
        ["scripture-tradition", "theology-ethics", "religion-society"],
        "Three lower-division courses, one from each of the three areas (scripture and tradition; theology, ethics, and spirituality; and religion and society).",
        { minDistinctLists: 3 },
      ),
    ]),
    section("upper-division", "Eight approved upper-division courses", [
      each("rels-190", "RELS 190 Seminar in Interreligious Dialogue", ["RELS 190"]),
      pick("upper-division", "Seven more approved upper-division courses", 7, ["upper-division"], "The rest of the eight approved upper-division courses."),
      manual("area-seminars", "Seminars from each of the three areas (RSOC, SCTR, TESP)", "Four of the eight upper division courses consist of seminars from each of the three areas (RSOC, SCTR, TESP) and RELS 190 Seminar in Interreligious Dialogue."),
      pick("christian-theology", "One course from the approved list in Christian Theology", 1, ["christian-theology"], "One of the eight upper division courses must be from the approved list of classes in Christian Theology.", { overlay: true }),
    ]),
  ],
  notes: [],
};

const ethn = (numbers: string) => codes("ETHN", numbers);

export const ETHNIC_STUDIES_STRUCTURE: MajorStructure = {
  ...bulletinSource("ETHN", "Department of Ethnic Studies", "Transcribed from the Bulletin's 'Requirements for the Major'."),
  lists: listsOf(
    list("introductory", "ETHN 10, 20, 30, 40, 80", ethn("10 20 30 40 80")),
    list("breadth", "Breadth electives", [
      "ANTH 86",
      "ANTH 90",
      "DANC 62",
      ...codes("ENGL", "35 35G 36 37 38 39 69AM"),
      ...ethn("11 13 21 22 25 35 36 38 41 50 51 54A 55 56 58 59 65 69 70 75 81 90 91 95 96"),
      "MUSC 20",
      "TESP 59",
      "THTR 14",
      "THTR 65",
    ]),
    list("community-engagement", "Community Engagement and Social Movements", ethn("112 122 123 125 125A 132 133 138A 142 149 153 160 163 166 171 174 175 196")),
    list("race-law", "Race, Law, Politics and Policy", ethn("100 120 126 127 149 153 155 175 177 178 180")),
    list("intersectionality", "Intersectionality and Hybridity", ethn("102 121 125A 129 141 151 152 154 154A 157 163 167 169 176 196")),
    list("inequality-education", "Inequality and Education", ethn("101 150 157 161 167 174")),
    list("immigration", "Immigration, Transnationalism, and Globalization", ethn("112 120 125A 126 127 138 170 171 172 178")),
    list("social-cultural", "Social and Cultural Analysis", ethn("111 124 128 130 130A 131 132 132A 135 136 137 139 141 144 145 160 162 164 166 168 172 175 176 196 197")),
    list("capstone", "Ethnic Studies Seminar (184, 185, 186, 187, or 188) or ETHN 198", ethn("184 185 186 187 188 198")),
    range("upper-division", "Upper-division ethnic studies courses", { subjects: ["ETHN"], from: 100, to: 199 }),
  ),
  sections: [
    section("lower-division", "Lower division", [
      each("ethn-5", "ETHN 5", ["ETHN 5"]),
      pick("introductory", "Two courses from ETHN 10, 20, 30, 40, 80", 2, ["introductory"], "Two courses from the list."),
      pick("breadth", "One breadth elective", 1, ["breadth"], "One of the following breadth electives."),
    ]),
    section("categories", "Six upper-division courses", [
      pick(
        "categories",
        "Six upper-division courses from at least four of the six categories",
        6,
        ["community-engagement", "race-law", "intersectionality", "inequality-education", "immigration", "social-cultural"],
        "Six upper-division courses selected from at least four of the following six categories.",
        { minDistinctLists: 4, notes: ["No class can be used to fulfill more than one category. Any exception will require the approval of the department chair."] },
      ),
    ]),
    section("capstone", "Capstone", [
      each("ethn-165", "ETHN 165", ["ETHN 165"]),
      pick("capstone", "An Ethnic Studies Seminar or ETHN 198", 1, ["capstone"], "Option 1: ETHN 165 and an Ethnic Studies Seminar course (184, 185, 186, 187, or 188). Option 2: ETHN 165 and ETHN 198 (a research project)."),
    ]),
    section("elective", "Upper-division elective", [
      pick("elective", "An upper-division elective", 1, ["upper-division"], "An upper-division elective that may be completed within ethnic studies or from an approved list within any other department or program.", {
        notes: ["A course from another department's approved list also counts; CampusVal counts ETHN courses only."],
      }),
    ]),
  ],
  notes: [],
};

const gnsx = (numbers: string) => codes("GNSX", numbers);

export const GENDER_SEXUALITY_STUDIES_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "WGST",
    "Department of Gender and Sexuality Studies",
    "Transcribed from the Bulletin's 'Requirements for the Major' (eleven courses). The Bulletin's subject code is GNSX; the three concentration areas are not course lists, so the concentration is shown for the student to track.",
  ),
  lists: listsOf(range("electives", "Gender and sexuality studies courses", { subjects: ["GNSX"], from: 1, to: 199 })),
  sections: [
    section("principles", "Principles", [
      oneOf("principles", "One Principles of GNSX course or sequence", [
        ["GNSX 1A and 2A", gnsx("1A 2A")],
        ["GNSX 11A and 12A", gnsx("11A 12A")],
        ["GNSX 25", ["GNSX 25"]],
        ["GNSX 50", ["GNSX 50"]],
        ["GNSX 51", ["GNSX 51"]],
        ["GNSX 52", ["GNSX 52"]],
        ["GNSX 59 (or ETHN 59)", ["GNSX 59"]],
        ["ETHN 59 (cross-listed with GNSX 59)", ["ETHN 59"]],
        ["GNSX 112 (or ETHN 154)", ["GNSX 112"]],
        ["ETHN 154 (cross-listed with GNSX 112)", ["ETHN 154"]],
      ]),
    ]),
    section("upper-division", "Required upper-division courses", [
      withNotes(each("required", "GNSX 101, 102, 105, 190", gnsx("101 102 105 190")), "GNSX 101 and 102 are advised in the junior year; GNSX 190 in the senior year."),
    ]),
    section("concentration", "Concentration and electives", [
      manual(
        "concentration",
        "A three-course concentration",
        "A three-course concentration in one of three areas: Cultural Politics of Representation; Power, Rights, and Society; or Sexualities, Body Politics, and Social Structures.",
      ),
      pick("electives", "Three electives", 3, ["electives"], "Three electives."),
    ]),
  ],
  notes: [],
};

// ---------------------------------------------------------------------------
// Classics and Ancient Studies, B.A. (three tracks)
// ---------------------------------------------------------------------------

const CLAS_197 = codes("CLAS", "197A 197B 197C");
const clasCapstone = (track: string) =>
  withNotes(
    oneOf(`${track}-capstone`, "CLAS 197A, 197B, and 197C, or two approved M-level language courses with a short comparative paper", [["CLAS 197A, 197B, and 197C", CLAS_197]]),
    "Or two approved M-level language courses (in addition to minimum language requirements) with a short comparative paper. CampusVal counts the CLAS 197A-C path only; confirm the other with your advisor.",
  );

export const CLASSICS_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "CLAS",
    "Department of Classics",
    "Transcribed from the Bulletin's 'Requirements for the Major in Classics and Ancient Studies' (three tracks). Language and course-count requirements depend on course content the catalog does not record, so they are shown for the student to track.",
  ),
  lists: listsOf(list("ancient-intro", "CLAS 5, 60, or 61", codes("CLAS", "5 60 61"))),
  sections: [
    section("languages-literatures", "Classical Languages and Literatures Track", [
      manual("languages-upper-division", "Nine upper-division courses in Greek and/or Latin", "Nine upper-division courses in Greek and/or Latin, including a minimum of two 'M'-level courses."),
      manual("languages-proficiency", "First-year proficiency in both classical languages", "First-year proficiency in both classical languages."),
      clasCapstone("languages"),
    ], "languages-literatures"),
    section("classical-studies", "Classical Studies Track", [
      manual("classical-language", "Six classes in either Latin or Greek", "Six classes in either Latin or Greek, which may include the elementary sequence (but not both sequences)."),
      manual("classical-other", "Six other classics courses", "Six other classics courses, at least four of which must be upper-division."),
      clasCapstone("classical"),
    ], "classical-studies"),
    section("ancient-studies", "Ancient Studies Track", [
      pick("ancient-intro", "CLAS 5, 60, or 61", 1, ["ancient-intro"], "One of the three."),
      manual("ancient-courses", "Eleven non-language classics courses", "Eleven non-language classics courses, at least seven of which must be upper-division."),
      each("ancient-capstone", "CLAS 197A, 197B, and 197C", CLAS_197),
    ], "ancient-studies"),
  ],
  variants: {
    kind: "track",
    required: true,
    options: [
      { key: "languages-literatures", label: "Classical Languages and Literatures Track" },
      { key: "classical-studies", label: "Classical Studies Track" },
      { key: "ancient-studies", label: "Ancient Studies Track" },
    ],
  },
  notes: [],
};

// ---------------------------------------------------------------------------
// Art History, Studio Art, Music, Theatre Arts
// ---------------------------------------------------------------------------

export const ART_HISTORY_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "ARTH",
    "Department of Art and Art History",
    "Transcribed from the Bulletin's 'Major in Art History' (15 courses: 13 ARTH and 2 ARTS) and its optional arts management emphasis.",
  ),
  lists: listsOf(
    range("arth-lower", "Lower-division ARTH courses", { subjects: ["ARTH"], from: 1, to: 99 }),
    range("arts-studio", "Studio ARTS courses", { subjects: ["ARTS"], from: 1, to: 199 }),
    range("arth-upper", "Upper-division ARTH courses", { subjects: ["ARTH"], from: 100, to: 199 }),
    range("arth-any", "ARTH courses (lower- or upper-division)", { subjects: ["ARTH"], from: 1, to: 199 }),
    list("writing", "ENGL 100GR, 101 or 112", ["ENGL 100GR", "ENGL 101", "ENGL 112"]),
    list("management", "MGMT 160, 170, or 174", codes("MGMT", "160 170 174")),
    list("marketing", "MKTG 181, 186, or 190", codes("MKTG", "181 186 190")),
  ),
  sections: [
    section("art-history", "Art history", [
      pick("arth-lower", "Four lower-division ARTH courses", 4, ["arth-lower"], "Four lower-division ARTH courses."),
      pick("arts-studio", "Two studio ARTS courses", 2, ["arts-studio"], "Two studio ARTS courses."),
      withNotes(each("arth-100", "ARTH 100", ["ARTH 100"]), "Preferably at the end of sophomore year."),
      pick("arth-upper", "Four upper-division ARTH courses", 4, ["arth-upper"], "Four upper-division ARTH courses.", {
        notes: ["Only 4 units of ARTH 98/198 or 4 units of ARTH 194 may count toward the major or minor in art history."],
      }),
      manual("advanced-writing", "One ARTH advanced writing course", "One ARTH advanced writing course. CampusVal cannot tell which ARTH course is your advanced writing course, so it may also count it among the other ARTH courses; confirm with your advisor."),
      pick("arth-any", "Two additional ARTH courses", 2, ["arth-any"], "Two additional ARTH courses either lower- or upper-division."),
      withNotes(each("arth-196", "ARTH 196", ["ARTH 196"]), "Taken in senior year."),
    ]),
    section("arts-management", "Arts Management Emphasis", [
      manual("arts-management-courses", "Three designated arts management courses", "3 designated arts management courses, at least one of which must be an upper-division course."),
      pick("arts-management-writing", "One course from ENGL 100GR, 101 or 112", 1, ["writing"], "One of the three."),
      pick("arts-management-mgmt", "Two courses from MGMT 160, 170, or 174", 2, ["management"], "Two of the three."),
      pick("arts-management-mktg", "One course from MKTG 181, 186, or 190", 1, ["marketing"], "One of the three."),
      manual("arts-management-internship", "Internship at an arts organization", "Students must complete an internship at an arts organization, such as the de Saisset Museum, Montalvo Arts Center, Palo Alto Art Center, San Jose Institute of Contemporary Art, San Jose Museum of Art, Art and Art History Gallery, etc."),
      manual("arts-management-event", "Senior year culminating event", "Students must participate in a senior year culminating event, such as the Annual Art History Symposium."),
    ], "arts-management"),
  ],
  variants: {
    kind: "emphasis",
    required: false,
    options: [{ key: "arts-management", label: "Arts Management Emphasis" }],
    note: "Completion of the emphasis will be noted on the student's transcript. The arts management emphasis is for art history majors only.",
  },
  notes: [
    "No more than three transfer credit courses or study abroad courses may be accepted for the art history major or minor. Only one upper-division transfer credit course or study abroad course may be accepted to fulfill the upper-division ARTH course requirement.",
  ],
};

const ARTS_EXCLUDED = codes("ARTS", "100 190 194 196 198");

export const STUDIO_ART_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "ARTS",
    "Department of Art and Art History",
    "Transcribed from the Bulletin's 'Major in Studio Art' (17 courses: 13 ARTS and 4 ARTH) and its two optional emphases, which specify the six studio electives.",
  ),
  lists: listsOf(
    list("two-dimensional", "ARTS 32 or 72", ["ARTS 32", "ARTS 72"]),
    list("three-dimensional", "ARTS 33, 63, or 64", codes("ARTS", "33 63 64")),
    range("studio-upper", "Upper-division studio ARTS electives (excluding ARTS 100, 190, 194, 196 or 198)", { subjects: ["ARTS"], from: 100, to: 199, exclude: ARTS_EXCLUDED }),
    range("studio-any", "Studio ARTS electives (excluding ARTS 100, 190, 194, 196 or 198)", { subjects: ["ARTS"], from: 1, to: 199, exclude: ARTS_EXCLUDED }),
    range("arth-lower", "Lower-division ARTH courses (except ARTH 11A)", { subjects: ["ARTH"], from: 1, to: 99, exclude: ["ARTH 11A"] }),
    list("modern", "ARTH 185 (recommended)", ["ARTH 185"]),
    range("arth-upper", "Upper-division ARTH courses", { subjects: ["ARTH"], from: 100, to: 199 }),
    list("graphic-lower", "ARTS 70 or 75", ["ARTS 70", "ARTS 75"]),
    list("graphic-upper", "ARTS 170, 173, 175, 177, 178 or 180", codes("ARTS", "170 173 175 177 178 180")),
    list("animation", "ARTS 131, 173, 179, 182, COMM 30, or 130", [...codes("ARTS", "131 173 179 182"), "COMM 30", "COMM 130"]),
  ),
  sections: [
    section("foundation", "Four foundation ARTS courses", [
      each("foundation", "ARTS 30 Basic Drawing, ARTS 74 Basic Digital Imaging", ["ARTS 30", "ARTS 74"]),
      pick("two-dimensional", "One two-dimensional foundation course", 1, ["two-dimensional"], "One two-dimensional foundation course from ARTS 32 or 72."),
      pick("three-dimensional", "One three-dimensional foundation course", 1, ["three-dimensional"], "One three-dimensional foundation course from ARTS 33, 63, or 64."),
    ]),
    section("studio-electives", "Six studio ARTS electives", [
      pick("studio-upper", "Three upper-division studio electives", 3, ["studio-upper"], "Six additional studio ARTS elective courses (excluding ARTS 100, 190, 194, 196 or 198), three of the six must be upper division."),
      pick("studio-any", "Three more studio electives", 3, ["studio-any"], "The other three of the six studio ARTS electives."),
    ]),
    section("upper-division", "Three upper-division courses", [
      withNotes(each("seminar-portfolio-exhibit", "ARTS 100, 190, 196", codes("ARTS", "100 190 196")), "ARTS 100 in junior year; ARTS 190 fall of senior year; ARTS 196 senior year, winter and spring quarters."),
    ]),
    section("art-history", "Four ARTH courses", [
      pick("arth-lower", "One lower-division ARTH course (except ARTH 11A)", 1, ["arth-lower"], "One lower-division ARTH course (except ARTH 11A)."),
      manual("arth-global", "One ARTH global course", "One ARTH global course."),
      manual("arth-modern", "One ARTH upper-division modern or contemporary course", "One ARTH upper-division modern or contemporary course (ARTH 185 recommended).", ["modern"]),
      pick("arth-upper", "One additional ARTH upper-division course", 1, ["arth-upper"], "One additional ARTH upper-division course."),
    ]),
    section("graphic-design", "Graphic Design Emphasis", [
      pick("graphic-lower", "One lower-division from ARTS 70 or 75", 1, ["graphic-lower"], "One of the two."),
      pick("graphic-upper", "Two upper-division from ARTS 170, 173, 175, 177, 178 or 180", 2, ["graphic-upper"], "Two of the six."),
    ], "graphic-design"),
    section("animation-illustration", "Animation and Illustration Emphasis", [
      each("animation-core", "ARTS 81, ARTS 181", ["ARTS 81", "ARTS 181"]),
      pick("animation", "One course from ARTS 131, 173, 179, 182, COMM 30, or 130", 1, ["animation"], "One course from the list."),
    ], "animation-illustration"),
  ],
  variants: {
    kind: "emphasis",
    required: false,
    options: [
      { key: "graphic-design", label: "Graphic Design Emphasis" },
      { key: "animation-illustration", label: "Animation and Illustration Emphasis" },
    ],
    note: "Completion of the emphasis will be noted on the student's transcript. The emphasis is for studio art majors only. Students may only complete one emphasis.",
  },
  notes: [
    "No more than half of the requirements may be accepted as transfer credit or study abroad courses for the studio art major. Only one art history transfer credit course or study abroad course may be accepted for the studio art major.",
  ],
};

export const MUSIC_STRUCTURE: MajorStructure = {
  ...bulletinSource("MUSC", "Department of Music", "Transcribed from the Bulletin's 'Requirements for the Major'. Units of applied instruction and ensemble are shown for the student to track."),
  lists: listsOf(
    list("listening", "Introduction to Listening series: MUSC 7, 8, 9, 10", codes("MUSC", "7 8 9 10")),
    list("music-at-noon", "MUSC 16/116", ["MUSC 16", "MUSC 116"]),
    list("ethnomusicology", "Ethnomusicology/Music History list", codes("MUSC", "114 119 128 130 131 132 133 134 135 136 139 189 190 192 194")),
    range("upper-division", "Upper-division music courses", { subjects: ["MUSC"], from: 100, to: 199 }),
    list("electronic", "Electronic Music: MUSC 9, 157, 115, 119", codes("MUSC", "9 157 115 119")),
  ),
  sections: [
    section("foundation", "Foundation", [
      each("theory", "MUSC 1, 2, 3", codes("MUSC", "1 2 3")),
      each("musicianship", "MUSC 1A, 2A, 3A", codes("MUSC", "1A 2A 3A")),
      pick("listening", "Two courses from the Introduction to Listening series", 2, ["listening"], "Two courses from Introduction to Listening series: MUSC 7, 8, 9, 10."),
      pick("music-at-noon", "Music at Noon: one quarter of MUSC 16/116", 1, ["music-at-noon"], "One quarter of MUSC 16 or 116."),
    ]),
    section("upper-division", "Six upper-division electives", [
      pick("ethnomusicology", "One Ethnomusicology/Music History course", 1, ["ethnomusicology"], "Six upper-division electives, including one from the Ethnomusicology/Music History list."),
      pick("upper-division", "Five more upper-division electives", 5, ["upper-division"], "The other five of the six upper-division electives."),
      pick("electronic", "At least one Electronic Music course", 1, ["electronic"], "At least one course (lower or upper division) must be an Electronic Music course: MUSC 9, 157, 115, 119.", { overlay: true }),
    ]),
    section("performance", "Applied instruction and ensemble", [
      manual("applied-instruction", "Six units of applied instruction", "Six units of applied instruction."),
      manual("ensemble", "Twelve units in an approved department ensemble", "Twelve units in an approved department ensemble."),
    ]),
  ],
  notes: [],
};

const THTR_39 = manual("theatre-39", "4 units of THTR 39/139", "4 units of THTR 39/139.", ["practicum"]);

export const THEATRE_STRUCTURE: MajorStructure = {
  ...bulletinSource(
    "THTR",
    "Department of Theatre and Dance",
    "Transcribed from the Bulletin's 'Requirements for the Major' in theatre arts: an Emphasis in Theatre or an Emphasis in Dance.",
  ),
  lists: listsOf(
    list("practicum", "THTR 39/139", ["THTR 39", "THTR 139"]),
    list("theatre-design", "THTR 31, 32, 33", codes("THTR", "31 32 33")),
    list("theatre-dance", "DANC 40, 43, 46", codes("DANC", "40 43 46")),
    list("theatre-history", "THTR 112, 113, 119, 151, 152, 161, 163, 165, 167", codes("THTR", "112 113 119 151 152 161 163 165 167")),
    range("theatre-electives", "Approved 5-unit upper-division theatre or dance electives", { subjects: ["THTR", "DANC"], from: 100, to: 199, minUnits: 5 }),
    list("ballet-jazz", "Level III/IV: DANC 42 or 45", ["DANC 42", "DANC 45"]),
    list("dance-electives", "DANC 140, 142, 148", codes("DANC", "140 142 148")),
  ),
  sections: [
    section("theatre", "Emphasis in Theatre", [
      each("theatre-core", "THTR 8, 9, 10 and 30", codes("THTR", "8 9 10 30")),
      pick("theatre-design", "One course from THTR 31, 32, 33", 1, ["theatre-design"], "One of the three."),
      pick("theatre-dance", "One course from DANC 40, 43, 46", 1, ["theatre-dance"], "One of the three."),
      each("theatre-acting", "THTR 41, 42", ["THTR 41", "THTR 42"]),
      pick("theatre-history", "One course from THTR 112, 113, 119, 151, 152, 161, 163, 165, 167", 1, ["theatre-history"], "One course from the list."),
      oneOf("theatre-159-189", "DANC 159 or THTR 189", [
        ["DANC 159", ["DANC 159"]],
        ["THTR 189", ["THTR 189"]],
      ]),
      each("theatre-185", "THTR 185", ["THTR 185"]),
      pick("theatre-electives", "Three approved 5-unit upper-division theatre or dance electives", 3, ["theatre-electives"], "Three approved 5-unit upper-division theatre or dance electives."),
      THTR_39,
      each("theatre-191", "THTR 191", ["THTR 191"]),
    ], "theatre"),
    section("dance", "Emphasis in Dance", [
      each("dance-theatre", "THTR 9, 10, and 30", codes("THTR", "9 10 30")),
      manual("dance-ballet-jazz", "One course each in Ballet and Jazz", "One course each in Ballet and Jazz (one at Level III/IV: DANC 42 or 45).", ["ballet-jazz"]),
      each("dance-core", "DANC 48, 49, 67, 143 and 146", codes("DANC", "48 49 67 143 146")),
      pick("dance-electives", "Two courses from DANC 140, 142, 148", 2, ["dance-electives"], "Two of the three."),
      oneOf("dance-162-166", "DANC 162 or 166", [
        ["DANC 162", ["DANC 162"]],
        ["DANC 166", ["DANC 166"]],
      ]),
      oneOf("dance-159-189", "DANC 159 or THTR 189", [
        ["DANC 159", ["DANC 159"]],
        ["THTR 189", ["THTR 189"]],
      ]),
      { ...THTR_39, key: "dance-39" },
      each("dance-191", "DANC 191", ["DANC 191"]),
    ], "dance"),
  ],
  variants: {
    kind: "emphasis",
    required: true,
    options: [
      { key: "theatre", label: "Emphasis in Theatre" },
      { key: "dance", label: "Emphasis in Dance" },
    ],
  },
  notes: [],
};

// ---------------------------------------------------------------------------
// Modern Languages and Literatures: French, Italian, Spanish
// ---------------------------------------------------------------------------

const FORTY_UNITS = (language: string, subject: string) =>
  manual(
    "upper-division-units",
    "Upper-division electives to total 40 quarter units",
    `Remaining electives in ${language} to total 40 quarter upper-division units, chosen with the approval of the student's major advisor. At least 20 of these units must be taken at SCU or taught by SCU faculty.`,
    [`${subject.toLowerCase()}-upper`],
  );

export const FRENCH_STRUCTURE: MajorStructure = {
  ...bulletinSource("FREN", "Department of Modern Languages and Literatures", "Transcribed from the Bulletin's 'Major in French and Francophone Studies'. The major is counted in units, so the electives are shown for the student to track."),
  lists: listsOf(range("fren-upper", "Upper-division French courses", { subjects: ["FREN"], from: 100, to: 199 })),
  sections: [
    section("french", "French and Francophone studies", [
      withNotes(each("fren-100-101", "FREN 100, 101", ["FREN 100", "FREN 101"]), "In any order, or department-approved substitutions."),
      manual("literature", "At least one course in French and Francophone literatures", "At least one course in French and Francophone literatures."),
      FORTY_UNITS("French and Francophone studies", "FREN"),
    ]),
  ],
  notes: [],
};

export const ITALIAN_STRUCTURE: MajorStructure = {
  ...bulletinSource("ITAL", "Department of Modern Languages and Literatures", "Transcribed from the Bulletin's 'Major in Italian Studies'. The major is counted in units, so the electives are shown for the student to track."),
  lists: listsOf(range("ital-upper", "Upper-division Italian courses", { subjects: ["ITAL"], from: 100, to: 199 })),
  sections: [
    section("italian", "Italian studies", [
      withNotes(each("ital-100-101", "ITAL 100 and 101", ["ITAL 100", "ITAL 101"]), "Or department-approved substitutions."),
      FORTY_UNITS("Italian language, literature, and culture", "ITAL"),
    ]),
  ],
  notes: [],
};

const span = (from: number, to: number) => ({ subjects: ["SPAN"], from, to });

export const SPANISH_STRUCTURE: MajorStructure = {
  ...bulletinSource("SPAN", "Department of Modern Languages and Literatures", "Transcribed from the Bulletin's 'Major in Spanish Studies' (40 upper-division units). Bare course numbers in the Bulletin's list are Spanish courses."),
  defaultSubject: "SPAN",
  lists: listsOf(
    range("span-100-101", "SPAN 100 or 101 (including courses with a letter suffix)", span(100, 101)),
    range("span-102-103", "SPAN 102 or 103", span(102, 103)),
    range("span-100-110", "SPAN 100 to 110", span(100, 110)),
    list("span-175-177", "SPAN 175, 176, 177", codes("SPAN", "175 176 177"), "Or an advisor-approved equivalent."),
    range("span-above-110", "Spanish courses above 110", span(111, 197)),
    range("span-upper", "Upper-division (100-197) Spanish courses", span(100, 197)),
  ),
  sections: [
    section("spanish", "Spanish studies", [
      pick("span-100-101", "One course from 100 or 101", 1, ["span-100-101"], "One course from 100 or 101 (including courses with a letter suffix, e.g. 101M, 101S)."),
      pick("span-102-103", "One course from 102 or 103", 1, ["span-102-103"], "One course from 102 or 103."),
      pick("span-100-110", "One course from 100 to 110", 1, ["span-100-110"], "One course from 100 to 110 (not taken to fulfill the above two requirements)."),
      pick("span-175-177", "Spanish 175, 176, 177, or an advisor-approved equivalent", 1, ["span-175-177"], "One of the three."),
      manual("literature-culture", "One course in literature and culture studies above 110", "One course in literature and culture studies above 110. CampusVal cannot tell which courses are literature and culture studies, so it may also count this course in the next requirements; confirm with your advisor.", ["span-above-110"]),
      pick("span-above-110", "One additional course above 110", 1, ["span-above-110"], "One additional course above 110 (not taken to fulfill the above requirements)."),
      pick("span-upper", "Any two upper-division (100-197) Spanish courses", 2, ["span-upper"], "Any two upper-division (100-197) Spanish courses not taken to satisfy any of the above requirements."),
    ]),
  ],
  notes: ["The major consists of a total of 40 upper-division units; 20 units must be taken at SCU or taught by SCU faculty."],
};

export const CAS_ARTS_STRUCTURES: Record<string, MajorStructure> = {
  COMM: COMMUNICATION_STRUCTURE,
  ENGL: ENGLISH_STRUCTURE,
  HIST: HISTORY_STRUCTURE,
  POLI: POLITICAL_SCIENCE_STRUCTURE,
  SOCI: SOCIOLOGY_STRUCTURE,
  ANTH: ANTHROPOLOGY_STRUCTURE,
  CHST: CHILD_STUDIES_STRUCTURE,
  PHIL: PHILOSOPHY_STRUCTURE,
  RSOC: RELIGIOUS_STUDIES_STRUCTURE,
  ETHN: ETHNIC_STUDIES_STRUCTURE,
  WGST: GENDER_SEXUALITY_STUDIES_STRUCTURE,
  CLAS: CLASSICS_STRUCTURE,
  ARTH: ART_HISTORY_STRUCTURE,
  ARTS: STUDIO_ART_STRUCTURE,
  MUSC: MUSIC_STRUCTURE,
  THTR: THEATRE_STRUCTURE,
  FREN: FRENCH_STRUCTURE,
  ITAL: ITALIAN_STRUCTURE,
  SPAN: SPANISH_STRUCTURE,
};
