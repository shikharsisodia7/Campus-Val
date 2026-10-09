/**
 * Structured major requirements: a major written in the Bulletin's own shape
 * instead of the recipe's two flat lists (lowerDiv / upperDiv).
 *
 * The recipe system (graduation-paths.ts) describes most majors as "these
 * lower-division courses, these upper-division courses". That is wrong for a
 * major whose Bulletin entry is built from choices — "one course from each of
 * these themes", "four electives, at least two with laboratory", "PHYS 11-13 or
 * PHYS 31-33". Flattening such a major invents a fixed course list the Bulletin
 * never states (Biology listed BIOL 184 and 188, which no Biology requirement
 * names). A major that carries a `MajorStructure` is shown exactly as the
 * Bulletin structures it; every other major keeps its recipe, unchanged.
 *
 * Three rules cover what the Bulletin writes:
 *   - each:         every listed course is required (one requirement per course);
 *   - choose:       N courses from one or more named course lists;
 *   - alternatives: complete ONE of the listed course sets.
 *
 * Course lists are named once and shared, so "Theme courses" read the same
 * wherever a requirement draws on them. Nothing here is a student's data.
 */

export interface StructuredCourseList {
  key: string;
  /** The Bulletin's own name for the list, e.g. "Cell and Molecular Biology (CMB)". */
  label: string;
  courses: string[];
  /** Verbatim qualifications the Bulletin attaches to the list ("*Requires faculty mentor"). */
  note?: string;
}

export type StructuredRule =
  | { kind: "each"; courses: string[] }
  | { kind: "choose"; count: number; lists: string[] }
  | {
      kind: "alternatives";
      options: { label: string; courses: string[]; recommended?: boolean }[];
    };

export interface StructuredRequirement {
  /** Stable within the major ("theme-cmb"). "each" rules key their items by course code instead. */
  key: string;
  label: string;
  /** Static text describing the rule. Never status-dependent: it is part of the requirement's fingerprint. */
  description: string;
  rule: StructuredRule;
  notes?: string[];
}

export interface StructuredSection {
  key: string;
  label: string;
  requirements: StructuredRequirement[];
}

export interface MajorStructure {
  sourceUrl: string;
  sourceLabel: string;
  /** The Bulletin edition the structure was transcribed from. */
  catalogYear: string;
  /** When a person last compared this structure against the source (ISO date). */
  lastVerified: string;
  verificationNote: string;
  /** The Bulletin's requirement paragraph, word for word, for proofreading. */
  sourceText: string[];
  lists: Record<string, StructuredCourseList>;
  sections: StructuredSection[];
  notes: string[];
}

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
    cmb: { key: "cmb", label: "Theme: Cell and Molecular Biology (CMB)", courses: BIOLOGY_THEME_CMB },
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

/** Majors whose Bulletin structure is transcribed. Keyed by the recipe's department code. */
export const MAJOR_STRUCTURES: Readonly<Record<string, MajorStructure>> = {
  BIOL: BIOLOGY_STRUCTURE,
};

// ---------------------------------------------------------------------------
// Resolution: which requirement each completed / planned course counts toward
// ---------------------------------------------------------------------------

export type StructuredStatus = "completed" | "planned" | "open";

export interface StructuredChoice {
  kind: "choose" | "alternatives";
  /** choose: how many courses the rule needs. Null for alternatives. */
  minimum: number | null;
  /** Courses CampusVal counted toward this requirement (each course counts once in the whole major). */
  completedCount: number;
  plannedCount: number;
  lists: { key: string; label: string; note: string | null; courses: string[] }[];
  alternatives: { label: string; courses: string[]; recommended: boolean }[];
}

export interface ResolvedStructuredItem {
  /** "biol-1a" for a course of an "each" rule; the requirement key otherwise. */
  key: string;
  sectionKey: string;
  section: string;
  /** The course code for an "each" item, else null. */
  course: string | null;
  label: string;
  description: string;
  /** Every course that can satisfy the item. */
  courses: string[];
  satisfiedBy: string[];
  plannedBy: string[];
  status: StructuredStatus;
  choice: StructuredChoice | null;
  notes: string[];
}

const norm = (code: string) => code.trim().toUpperCase().replace(/\s+/g, " ");
export const courseSlug = (code: string) => code.replace(/\s+/g, "-").toLowerCase();

function unique(codes: string[]): string[] {
  return [...new Set(codes)];
}

/**
 * Resolve a structure against a student's completed and planned courses.
 *
 * Requirements are resolved in Bulletin order and a course counts toward ONE
 * requirement only: the first that can use it. So a second CMB course becomes
 * an elective, and an elective list never re-counts the theme course. Within a
 * choose rule completed courses are taken before planned ones, in list order.
 * A planned course is never reported as completed.
 */
export function resolveMajorStructure(
  structure: MajorStructure,
  completedCodes: Iterable<string>,
  plannedCodes: Iterable<string> = [],
): ResolvedStructuredItem[] {
  const completed = new Set([...completedCodes].map(norm));
  const planned = new Set([...plannedCodes].map(norm).filter((c) => !completed.has(c)));
  const used = new Set<string>();
  const out: ResolvedStructuredItem[] = [];

  for (const section of structure.sections) {
    for (const req of section.requirements) {
      const rule = req.rule;
      if (rule.kind === "each") {
        for (const course of rule.courses) {
          const c = norm(course);
          used.add(c);
          const done = completed.has(c);
          const isPlanned = !done && planned.has(c);
          out.push({
            key: courseSlug(course),
            sectionKey: section.key,
            section: section.label,
            course,
            label: course,
            description: req.description,
            courses: [course],
            satisfiedBy: done ? [course] : [],
            plannedBy: isPlanned ? [course] : [],
            status: done ? "completed" : isPlanned ? "planned" : "open",
            choice: null,
            notes: req.notes ?? [],
          });
        }
        continue;
      }

      if (rule.kind === "alternatives") {
        const all = unique(rule.options.flatMap((o) => o.courses));
        const free = all.filter((c) => !used.has(norm(c)));
        const done = (o: { courses: string[] }) => o.courses.every((c) => completed.has(norm(c)) && !used.has(norm(c)));
        const reachable = (o: { courses: string[] }) =>
          o.courses.every((c) => (completed.has(norm(c)) || planned.has(norm(c))) && !used.has(norm(c)));
        const finished = rule.options.find(done);
        const onTrack = finished ?? rule.options.find(reachable);
        // Count only the chosen option's courses when one is complete or on track;
        // otherwise show what the student has toward any option, without consuming it.
        const counted = onTrack ? onTrack.courses : [];
        for (const c of counted) used.add(norm(c));
        const satisfiedBy = (onTrack ? onTrack.courses : free).filter((c) => completed.has(norm(c)));
        const plannedBy = (onTrack ? onTrack.courses : free).filter((c) => planned.has(norm(c)));
        out.push({
          key: req.key,
          sectionKey: section.key,
          section: section.label,
          course: null,
          label: req.label,
          description: req.description,
          courses: all,
          satisfiedBy,
          plannedBy,
          status: finished ? "completed" : onTrack ? "planned" : "open",
          choice: {
            kind: "alternatives",
            minimum: null,
            completedCount: satisfiedBy.length,
            plannedCount: plannedBy.length,
            lists: [],
            alternatives: rule.options.map((o) => ({ label: o.label, courses: o.courses, recommended: !!o.recommended })),
          },
          notes: req.notes ?? [],
        });
        continue;
      }

      // choose N from the named lists
      const lists = rule.lists.map((k) => {
        const list = structure.lists[k];
        if (!list) throw new Error(`Structured requirement "${req.key}" names an unknown course list "${k}".`);
        return list;
      });
      const eligible = unique(lists.flatMap((l) => l.courses));
      const takenDone = eligible.filter((c) => completed.has(norm(c)) && !used.has(norm(c))).slice(0, rule.count);
      const takenPlanned = eligible
        .filter((c) => planned.has(norm(c)) && !used.has(norm(c)))
        .slice(0, Math.max(0, rule.count - takenDone.length));
      for (const c of [...takenDone, ...takenPlanned]) used.add(norm(c));
      out.push({
        key: req.key,
        sectionKey: section.key,
        section: section.label,
        course: null,
        label: req.label,
        description: req.description,
        courses: eligible,
        satisfiedBy: takenDone,
        plannedBy: takenPlanned,
        status:
          takenDone.length >= rule.count
            ? "completed"
            : takenDone.length + takenPlanned.length >= rule.count
              ? "planned"
              : "open",
        choice: {
          kind: "choose",
          minimum: rule.count,
          completedCount: takenDone.length,
          plannedCount: takenPlanned.length,
          lists: lists.map((l) => ({ key: l.key, label: l.label, note: l.note ?? null, courses: l.courses })),
          alternatives: [],
        },
        notes: req.notes ?? [],
      });
    }
  }
  return out;
}

/** Every course code the structure names, in order (for catalog checks and audits). */
export function structureCourses(structure: MajorStructure): string[] {
  const codes: string[] = [];
  for (const section of structure.sections) {
    for (const req of section.requirements) {
      const rule = req.rule;
      if (rule.kind === "each") codes.push(...rule.courses);
      else if (rule.kind === "alternatives") codes.push(...rule.options.flatMap((o) => o.courses));
      else codes.push(...rule.lists.flatMap((k) => structure.lists[k]?.courses ?? []));
    }
  }
  return unique(codes);
}

/** How many courses the structure requires in total (each course + each choice count + the longest-free option). */
export function structureRequiredCount(structure: MajorStructure): number {
  let n = 0;
  for (const section of structure.sections) {
    for (const req of section.requirements) {
      const rule = req.rule;
      if (rule.kind === "each") n += rule.courses.length;
      else if (rule.kind === "choose") n += rule.count;
      else n += Math.min(...rule.options.map((o) => o.courses.length));
    }
  }
  return n;
}
