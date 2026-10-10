/**
 * The shape a major's Bulletin requirements are transcribed into (see
 * data/major-structures.ts for the engine and the registry).
 *
 * Rules cover what the 2026-27 Bulletin writes in "Requirements for the Major":
 *   - each:         every listed course is required (one requirement per course);
 *   - choose:       N courses from one or more named course lists, optionally
 *                   "from at least K of these lists";
 *   - alternatives: complete ONE of the listed course sets ("PHYS 11-13 or PHYS 31-33");
 *   - manual:       a requirement CampusVal cannot count from courses (a department's
 *                   approved list the Bulletin does not print, units of ensemble,
 *                   an internship, a course attribute the catalog does not record).
 *                   Shown in the Bulletin's words for the student to track; it may
 *                   carry course lists to browse, never counted.
 *
 * A list is either explicit (the Bulletin names its courses) or a pattern the
 * Bulletin states ("ANTH 140-149", "any upper-division PHIL course"), resolved
 * against the course catalog. Nothing is invented: every explicit code must be
 * named by the Bulletin text kept beside the structure (tested).
 */

export interface CoursePattern {
  subjects: string[];
  /** Inclusive number range of the course number's digits ("114AW" -> 114). */
  from: number;
  to: number;
  /** Codes the Bulletin excludes from the range ("ECEN 188 and 189 may not be used"). */
  exclude?: string[];
  /** Number suffixes the Bulletin excludes ("Advanced Topics courses may NOT be used": "AT"). */
  excludeSuffixes?: string[];
  /** Only catalog courses of at least this many units ("any upper-division chemistry course of 3 units or more"). */
  minUnits?: number;
}

export interface StructuredCourseList {
  key: string;
  /** The Bulletin's own name for the list, e.g. "Cell and Molecular Biology (CMB)". */
  label: string;
  /** Codes the Bulletin names. */
  courses: string[];
  /** A range the Bulletin states; its catalog courses are added to `courses`. */
  pattern?: CoursePattern;
  /** Verbatim qualifications the Bulletin attaches to the list ("*Requires faculty mentor"). */
  note?: string;
}

export type StructuredRule =
  | { kind: "each"; courses: string[] }
  | {
      kind: "choose";
      count: number;
      lists: string[];
      /** "from at least K of these lists" (each course covers one list). */
      minDistinctLists?: number;
      /** "at most N from this list" ("up to two courses from the approved list of elective courses"). */
      maxPerList?: Record<string, number>;
      /**
       * A requirement a course meets IN ADDITION to the one it counts for ("at least one course must be an
       * Electronic Music course"; "this course may also be used to meet another requirement"). It never
       * takes a course away from another requirement.
       */
      overlay?: boolean;
    }
  | { kind: "alternatives"; options: { label: string; courses: string[]; recommended?: boolean }[] }
  | { kind: "manual"; lists?: string[] };

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
  /**
   * The key of the track / emphasis / concentration (see `MajorStructure.variants`) the section belongs to.
   * Only the student's own choice is resolved, after the shared sections.
   */
  variant?: string;
}

/**
 * Tracks, emphases or concentrations the Bulletin defines inside a major. `required`: the student must
 * follow one (Bioengineering's tracks); otherwise they are optional additions (Mathematics' emphases).
 */
export interface StructureVariants {
  kind: "track" | "emphasis" | "concentration";
  required: boolean;
  options: { key: string; label: string }[];
  /** The Bulletin's own words about choosing one, verbatim. */
  note?: string;
}

export interface MajorStructure {
  sourceUrl: string;
  sourceLabel: string;
  /** The Bulletin edition the structure was transcribed from. */
  catalogYear: string;
  /** When a person last compared this structure against the source (ISO date). */
  lastVerified: string;
  verificationNote: string;
  /** The Bulletin's requirement text, word for word, for proofreading (each explicit code must appear in it). */
  sourceText: string[];
  /** Subject assumed for a bare-number list in the source text ("CMB: 110, 112"). */
  defaultSubject?: string;
  /**
   * Courses the Bulletin lists under a course-listing heading ("Upper-Division Courses: Comparative
   * Politics"), as "Heading: SUBJ n, n". Used where a requirement names those headings ("one lecture
   * course from four of the following five subfields").
   */
  listingText?: string[];
  /** A code transcribed differently from the Bulletin's spelling, and why ("BIOL 160": the Bulletin writes "BIO 160"). */
  sourceCorrections?: Record<string, string>;
  lists: Record<string, StructuredCourseList>;
  sections: StructuredSection[];
  variants?: StructureVariants;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Builders: keep the transcriptions short and close to the Bulletin's wording.
// ---------------------------------------------------------------------------

/** codes("ECEN", "20 21 50 100") -> ["ECEN 20", "ECEN 21", "ECEN 50", "ECEN 100"]. */
export const codes = (subject: string, numbers: string): string[] =>
  numbers
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((n) => `${subject} ${n}`);

export const each = (key: string, label: string, courses: string[], description = courses.join(", ")): StructuredRequirement => ({
  key,
  label,
  description,
  rule: { kind: "each", courses },
});

export const pick = (
  key: string,
  label: string,
  count: number,
  lists: string[],
  description: string,
  extra: { minDistinctLists?: number; maxPerList?: Record<string, number>; overlay?: boolean; notes?: string[] } = {},
): StructuredRequirement => ({
  key,
  label,
  description,
  rule: {
    kind: "choose",
    count,
    lists,
    ...(extra.minDistinctLists ? { minDistinctLists: extra.minDistinctLists } : {}),
    ...(extra.maxPerList ? { maxPerList: extra.maxPerList } : {}),
    ...(extra.overlay ? { overlay: true } : {}),
  },
  ...(extra.notes ? { notes: extra.notes } : {}),
});

export const oneOf = (
  key: string,
  label: string,
  options: [label: string, courses: string[], recommended?: boolean][],
  description = "Complete one of the options.",
): StructuredRequirement => ({
  key,
  label,
  description,
  rule: { kind: "alternatives", options: options.map(([l, c, r]) => ({ label: l, courses: c, ...(r ? { recommended: true } : {}) })) },
});

export const manual = (key: string, label: string, description: string, lists?: string[], notes?: string[]): StructuredRequirement => ({
  key,
  label,
  description,
  rule: { kind: "manual", ...(lists ? { lists } : {}) },
  ...(notes ? { notes } : {}),
});

/** Attach notes to a requirement (the Bulletin's qualifications, verbatim where possible). */
export const withNotes = (req: StructuredRequirement, ...notes: string[]): StructuredRequirement => ({
  ...req,
  notes: [...(req.notes ?? []), ...notes],
});

export const list = (key: string, label: string, courses: string[], note?: string): StructuredCourseList => ({
  key,
  label,
  courses,
  ...(note ? { note } : {}),
});

export const range = (key: string, label: string, pattern: CoursePattern, courses: string[] = [], note?: string): StructuredCourseList => ({
  key,
  label,
  courses,
  pattern,
  ...(note ? { note } : {}),
});

export const section = (key: string, label: string, requirements: StructuredRequirement[], variant?: string): StructuredSection => ({
  key,
  label,
  requirements,
  ...(variant ? { variant } : {}),
});

export const listsOf = (...items: StructuredCourseList[]): Record<string, StructuredCourseList> =>
  Object.fromEntries(items.map((l) => [l.key, l]));
