/**
 * Structured major requirements: every major written in the Bulletin's own
 * shape instead of the recipe's two flat lists (lowerDiv / upperDiv).
 *
 * The recipe system (graduation-paths.ts) described every major as "these
 * lower-division courses, these upper-division courses". That is wrong for a
 * major whose Bulletin entry is built from choices ("one course from each of
 * these themes", "four electives, at least two with laboratory", "PHYS 11-13 or
 * PHYS 31-33"): flattening it invents a fixed course list the Bulletin never
 * states. A major with a `MajorStructure` here is shown exactly as the 2026-27
 * Bulletin structures it. The rules and builders are in data/majors/model.ts;
 * the transcriptions are in data/majors/*.ts, each with the Bulletin's text.
 */
import { COURSES, canonicalCourseCode } from "./courses";
import type { CoursePattern, MajorStructure, StructuredCourseList, StructuredRequirement, StructuredSection } from "./majors/model";
import { BIOLOGY_STRUCTURE } from "./majors/biology";
import { SOE_STRUCTURES } from "./majors/soe";
import { LSB_STRUCTURES } from "./majors/lsb";
import { CAS_SCIENCE_STRUCTURES } from "./majors/cas-sciences";
import { CAS_ARTS_STRUCTURES } from "./majors/cas-arts";

export type {
  CoursePattern,
  MajorStructure,
  StructuredCourseList,
  StructuredRequirement,
  StructuredRule,
  StructuredSection,
  StructureVariants,
} from "./majors/model";
export { BIOLOGY_STRUCTURE };

/** Majors whose Bulletin structure is transcribed. Keyed by the recipe's department code. */
export const MAJOR_STRUCTURES: Readonly<Record<string, MajorStructure>> = {
  BIOL: BIOLOGY_STRUCTURE,
  ...SOE_STRUCTURES,
  ...LSB_STRUCTURES,
  ...CAS_SCIENCE_STRUCTURES,
  ...CAS_ARTS_STRUCTURES,
};

// ---------------------------------------------------------------------------
// Course lists: the codes the Bulletin names, plus a range it states
// ---------------------------------------------------------------------------

const norm = (code: string) => code.trim().toUpperCase().replace(/\s+/g, " ");
const numberOf = (code: string) => Number.parseInt(code.split(" ")[1] ?? "", 10);
export const courseSlug = (code: string) => code.replace(/\s+/g, "-").toLowerCase();

const unitsOf = new Map(COURSES.map((c) => [norm(c.code), c.units]));

/** Whether a code falls in a list's stated range (with its exclusions and unit floor). */
function inPattern(pattern: CoursePattern, code: string): boolean {
  const c = norm(code);
  const [subject] = c.split(" ");
  const n = numberOf(c);
  if (!pattern.subjects.includes(subject!) || !(n >= pattern.from && n <= pattern.to)) return false;
  if ((pattern.exclude ?? []).some((x) => norm(x) === c)) return false;
  const suffix = (c.split(" ")[1] ?? "").replace(/^\d+/, "");
  if (suffix && (pattern.excludeSuffixes ?? []).includes(suffix)) return false;
  if (pattern.minUnits !== undefined) {
    // A course the catalog does not know cannot be shown to meet a unit floor, so it does not count.
    const units = unitsOf.get(c);
    if (units === undefined || units < pattern.minUnits) return false;
  }
  return true;
}

const listCache = new WeakMap<StructuredCourseList, string[]>();

/** Every course a list holds: the codes the Bulletin names, then the catalog courses of its stated range. */
export function coursesOfList(list: StructuredCourseList): string[] {
  const hit = listCache.get(list);
  if (hit) return hit;
  const out = [...list.courses];
  if (list.pattern) {
    const p = list.pattern;
    const fromCatalog = COURSES.map((c) => c.code)
      .filter((code) => inPattern(p, code))
      .sort((a, b) => numberOf(a) - numberOf(b) || a.localeCompare(b));
    out.push(...fromCatalog);
  }
  const result = [...new Set(out)];
  listCache.set(list, result);
  return result;
}

/** Whether a course belongs to a list: named by it, or (in the catalog or not) inside its stated range. */
function listHas(list: StructuredCourseList, code: string): boolean {
  const c = norm(code);
  return list.courses.some((x) => norm(x) === c) || (!!list.pattern && inPattern(list.pattern, c));
}

// ---------------------------------------------------------------------------
// Resolution: which requirement each completed / planned course counts toward
// ---------------------------------------------------------------------------

export type StructuredStatus = "completed" | "planned" | "open";

export interface StructuredChoice {
  kind: "choose" | "alternatives";
  /** choose: how many courses the rule needs. Null for alternatives and for a manual requirement's browse lists. */
  minimum: number | null;
  /** "from at least K of these lists", when the Bulletin says so. */
  minDistinctLists: number | null;
  /** Courses CampusVal counted toward this requirement (each course counts once in the whole major). */
  completedCount: number;
  plannedCount: number;
  lists: { key: string; label: string; note: string | null; courses: string[]; max: number | null }[];
  alternatives: { label: string; courses: string[]; recommended: boolean }[];
}

export interface ResolvedStructuredItem {
  /** The course slug ("biol-1a") for an "each" item; the requirement key otherwise. */
  key: string;
  sectionKey: string;
  section: string;
  /** The track / emphasis / concentration the item belongs to, when only one does. */
  variant: string | null;
  /** The course code for an "each" item, else null. */
  course: string | null;
  label: string;
  description: string;
  /** Every course that can satisfy the item (or, for a manual one, the courses it lets the student browse). */
  courses: string[];
  satisfiedBy: string[];
  plannedBy: string[];
  status: StructuredStatus;
  choice: StructuredChoice | null;
  /** True for a requirement CampusVal cannot count from courses: the student tracks it. */
  manual: boolean;
  notes: string[];
}

export interface ResolveOptions {
  /** The student's track / emphasis / concentration of this major, when they chose one. */
  variant?: string | null;
  /** Resolve every track (a reference listing, not one student's progress). */
  allVariants?: boolean;
}

function unique(codes: string[]): string[] {
  return [...new Set(codes)];
}

function namedLists(structure: MajorStructure, keys: string[], requirement: string): StructuredCourseList[] {
  return keys.map((k) => {
    const l = structure.lists[k];
    if (!l) throw new Error(`Structured requirement "${requirement}" names an unknown course list "${k}".`);
    return l;
  });
}

function choiceLists(lists: StructuredCourseList[], max: Record<string, number> = {}) {
  return lists.map((l) => ({ key: l.key, label: l.label, note: l.note ?? null, courses: coursesOfList(l), max: max[l.key] ?? null }));
}

/**
 * Pick up to `count` courses from `candidates`, in order, honouring "at most N from this list" caps
 * (`charged` carries the counts between calls). With `distinct`, first take courses that cover lists
 * not yet covered, so "one from at least K areas" is met whenever the courses allow it.
 */
function take(
  candidates: string[],
  count: number,
  listsOf: (c: string) => string[],
  caps: Record<string, number>,
  charged: Map<string, number>,
  covered: Set<string>,
  distinct: boolean,
): string[] {
  const chosen: string[] = [];
  const room = (k: string) => caps[k] === undefined || (charged.get(k) ?? 0) < caps[k]!;
  const accept = (c: string, freshOnly: boolean) => {
    const open = listsOf(c).filter(room);
    const pool = freshOnly ? open.filter((k) => !covered.has(k)) : open;
    if (pool.length === 0) return;
    const k = pool.find((x) => caps[x] === undefined) ?? pool[0]!;
    // A capped list is charged only when the course belongs to no uncapped list of the rule.
    if (!listsOf(c).some((x) => caps[x] === undefined)) charged.set(k, (charged.get(k) ?? 0) + 1);
    covered.add(k);
    chosen.push(c);
  };
  if (distinct) for (const c of candidates) if (chosen.length < count && !chosen.includes(c)) accept(c, true);
  for (const c of candidates) if (chosen.length < count && !chosen.includes(c)) accept(c, false);
  return chosen;
}

interface Pass {
  structure: MajorStructure;
  completed: ReadonlySet<string>;
  planned: ReadonlySet<string>;
  /** Courses an "each" rule requires: never taken by a choice ("additional electives" are additional). */
  reserved: ReadonlySet<string>;
  /** Courses a choice or an option already counted in this pass. */
  consumed: Set<string>;
  usedKeys: Map<string, number>;
}

function resolveRequirement(pass: Pass, section: StructuredSection, req: StructuredRequirement): ResolvedStructuredItem[] {
  const { structure, completed, planned, reserved, consumed, usedKeys } = pass;
  const base = { sectionKey: section.key, section: section.label, variant: section.variant ?? null, notes: req.notes ?? [] };
  const rule = req.rule;
  if (rule.kind === "each") {
    return rule.courses.map((course) => {
      const c = norm(course);
      const done = completed.has(c);
      const isPlanned = !done && planned.has(c);
      // A track's course keeps the track's prefix; a course required twice keeps one key per occurrence.
      const slug = section.variant ? `${section.key}-${courseSlug(course)}` : courseSlug(course);
      const n = (usedKeys.get(slug) ?? 0) + 1;
      usedKeys.set(slug, n);
      return {
        ...base,
        key: n === 1 ? slug : `${slug}-${n}`,
        course,
        label: course,
        description: req.description,
        courses: [course],
        satisfiedBy: done ? [course] : [],
        plannedBy: isPlanned ? [course] : [],
        status: done ? "completed" : isPlanned ? "planned" : "open",
        choice: null,
        manual: false,
      };
    });
  }

  if (rule.kind === "manual") {
    const lists = namedLists(structure, rule.lists ?? [], req.key);
    return [
      {
        ...base,
        key: req.key,
        course: null,
        label: req.label,
        description: req.description,
        courses: unique(lists.flatMap(coursesOfList)),
        satisfiedBy: [],
        plannedBy: [],
        status: "open",
        choice: lists.length
          ? { kind: "choose", minimum: null, minDistinctLists: null, completedCount: 0, plannedCount: 0, lists: choiceLists(lists), alternatives: [] }
          : null,
        manual: true,
      },
    ];
  }

  if (rule.kind === "alternatives") {
    const all = unique(rule.options.flatMap((o) => o.courses));
    // An option may name a course another rule requires (the Bulletin states both); it may not take one a choice counted.
    const free = (c: string) => !consumed.has(norm(c));
    const finished = rule.options.find((o) => o.courses.every((c) => completed.has(norm(c)) && free(c)));
    const onTrack = finished ?? rule.options.find((o) => o.courses.every((c) => (completed.has(norm(c)) || planned.has(norm(c))) && free(c)));
    // Count only the chosen option's courses when one is complete or on track; otherwise show what the
    // student has toward any option, without taking it from another requirement.
    if (onTrack) for (const c of onTrack.courses) consumed.add(norm(c));
    const shown = onTrack ? onTrack.courses : all.filter(free);
    const satisfiedBy = shown.filter((c) => completed.has(norm(c)));
    const plannedBy = shown.filter((c) => !completed.has(norm(c)) && planned.has(norm(c)));
    return [
      {
        ...base,
        key: req.key,
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
          minDistinctLists: null,
          completedCount: satisfiedBy.length,
          plannedCount: plannedBy.length,
          lists: [],
          alternatives: rule.options.map((o) => ({ label: o.label, courses: o.courses, recommended: !!o.recommended })),
        },
        manual: false,
      },
    ];
  }

  // choose N from the named lists
  const lists = namedLists(structure, rule.lists, req.key);
  const eligibleListed = unique(lists.flatMap(coursesOfList));
  const listedSet = new Set(eligibleListed.map(norm));
  const listsOf = (c: string) => lists.filter((l) => listHas(l, c)).map((l) => l.key);
  // The student's own courses inside a stated range count even when the catalog lacks them.
  const theirs = (set: ReadonlySet<string>) => [
    ...eligibleListed.filter((c) => set.has(norm(c))),
    ...[...set].filter((c) => !listedSet.has(c) && listsOf(c).length > 0).sort(),
  ];
  const usable = (c: string) => !!rule.overlay || (!reserved.has(norm(c)) && !consumed.has(norm(c)));
  const caps = rule.maxPerList ?? {};
  const charged = new Map<string, number>();
  const covered = new Set<string>();
  const distinct = !!rule.minDistinctLists;
  const takenDone = take(theirs(completed).filter(usable), rule.count, listsOf, caps, charged, covered, distinct);
  const doneCovered = covered.size;
  const takenPlanned = take(
    theirs(planned).filter((c) => usable(c) && !completed.has(norm(c))),
    Math.max(0, rule.count - takenDone.length),
    listsOf,
    caps,
    charged,
    covered,
    distinct,
  );
  if (!rule.overlay) for (const c of [...takenDone, ...takenPlanned]) consumed.add(norm(c));
  const spread = (n: number) => !rule.minDistinctLists || n >= rule.minDistinctLists;
  const complete = takenDone.length >= rule.count && spread(doneCovered);
  const onTrack = takenDone.length + takenPlanned.length >= rule.count && spread(covered.size);
  return [
    {
      ...base,
      key: req.key,
      course: null,
      label: req.label,
      description: req.description,
      courses: eligibleListed,
      satisfiedBy: takenDone,
      plannedBy: takenPlanned,
      status: complete ? "completed" : onTrack ? "planned" : "open",
      choice: {
        kind: "choose",
        minimum: rule.count,
        minDistinctLists: rule.minDistinctLists ?? null,
        completedCount: takenDone.length,
        plannedCount: takenPlanned.length,
        lists: choiceLists(lists, caps),
        alternatives: [],
      },
      manual: false,
    },
  ];
}

function eachCourses(sections: StructuredSection[]): string[] {
  return sections.flatMap((s) => s.requirements.flatMap((r) => (r.rule.kind === "each" ? r.rule.courses.map(norm) : [])));
}

/** The variant a student chose, when it is one of the structure's. */
export function validVariant(structure: MajorStructure, variant: string | null | undefined): string | null {
  return variant && structure.variants?.options.some((o) => o.key === variant) ? variant : null;
}

/**
 * Resolve a structure against a student's completed and planned courses.
 *
 * Requirements are resolved in Bulletin order and a course counts toward ONE requirement only: the
 * first that can use it (a second CMB course becomes an elective; an elective list never re-counts the
 * theme course). A course an "each" rule requires is never taken by a choice ("three additional
 * electives" are additional). Completed courses are taken before planned ones, in list order. An
 * overlay requirement ("at least one must be an Electronic Music course") reads courses without taking
 * them. The student's track / emphasis is resolved after the shared sections, starting again from the
 * courses the shared sections REQUIRE (an emphasis's "specifications" can be the same electives). A
 * planned course is never reported as completed.
 */
export function resolveMajorStructure(
  structure: MajorStructure,
  completedCodes: Iterable<string>,
  plannedCodes: Iterable<string> = [],
  options: ResolveOptions = {},
): ResolvedStructuredItem[] {
  // A code saved under a stale subject ("RSOC 15") counts as the Bulletin's code ("SCTR 15").
  const completed = new Set([...completedCodes].map(canonicalCourseCode));
  const planned = new Set([...plannedCodes].map(canonicalCourseCode).filter((c) => !completed.has(c)));
  const shared = structure.sections.filter((s) => !s.variant);
  const usedKeys = new Map<string, number>();
  const sharedEach = eachCourses(shared);
  const sharedPass: Pass = { structure, completed, planned, reserved: new Set(sharedEach), consumed: new Set(), usedKeys };
  const out = shared.flatMap((s) => s.requirements.flatMap((r) => resolveRequirement(sharedPass, s, r)));

  const variants = structure.variants;
  if (!variants) return out;
  const chosen = validVariant(structure, options.variant);
  const keys = options.allVariants ? variants.options.map((o) => o.key) : chosen ? [chosen] : [];
  if (keys.length === 0 && variants.required) {
    const names = variants.options.map((o) => o.label);
    out.push({
      key: `choose-${variants.kind}`,
      sectionKey: `choose-${variants.kind}`,
      section: `Your ${variants.kind}`,
      variant: null,
      course: null,
      label: `Choose your ${variants.kind}`,
      description: `The Bulletin requires one ${variants.kind}: ${names.slice(0, -1).join(", ")}${names.length > 1 ? " or " : ""}${names.at(-1)}. Choose yours to see its requirements.`,
      courses: [],
      satisfiedBy: [],
      plannedBy: [],
      status: "open",
      choice: null,
      manual: true,
      notes: variants.note ? [variants.note] : [],
    });
  }
  for (const key of keys) {
    const sections = structure.sections.filter((s) => s.variant === key);
    const pass: Pass = { structure, completed, planned, reserved: new Set([...sharedEach, ...eachCourses(sections)]), consumed: new Set(), usedKeys };
    out.push(...sections.flatMap((s) => s.requirements.flatMap((r) => resolveRequirement(pass, s, r))));
  }
  return out;
}

/** Every course code the structure NAMES (explicit codes; ranges are not expanded), in order. */
export function structureCourses(structure: MajorStructure): string[] {
  const named: string[] = [];
  for (const section of structure.sections) {
    for (const req of section.requirements) {
      const rule = req.rule;
      if (rule.kind === "each") named.push(...rule.courses);
      else if (rule.kind === "alternatives") named.push(...rule.options.flatMap((o) => o.courses));
      else named.push(...(rule.lists ?? []).flatMap((k) => structure.lists[k]?.courses ?? []));
    }
  }
  return unique(named);
}

/** How many courses the shared sections require (each, choose counts, the shortest option; overlays and manual items add none). */
export function structureRequiredCount(structure: MajorStructure): number {
  let n = 0;
  for (const section of structure.sections) {
    if (section.variant) continue;
    for (const req of section.requirements) {
      const rule = req.rule;
      if (rule.kind === "each") n += rule.courses.length;
      else if (rule.kind === "choose" && !rule.overlay) n += rule.count;
      else if (rule.kind === "alternatives") n += Math.min(...rule.options.map((o) => o.courses.length));
    }
  }
  return n;
}

/**
 * One way to satisfy the requirements, for the illustrative four-year example: every required course,
 * the recommended (else first) option, and the first catalog courses of each choice, spread across its
 * lists. Only courses the catalog has, and never one the Bulletin does not name or range.
 */
export function exampleSelection(structure: MajorStructure, variant?: string | null): { lowerDiv: string[]; upperDiv: string[] } {
  const known = new Set(COURSES.map((c) => norm(c.code)));
  const chosenVariant = validVariant(structure, variant) ?? (structure.variants?.required ? structure.variants.options[0]!.key : null);
  const sections = structure.sections.filter((s) => !s.variant || s.variant === chosenVariant);
  const reserved = new Set(eachCourses(sections));
  const picked: string[] = [];
  for (const section of sections) {
    for (const req of section.requirements) {
      const rule = req.rule;
      if (rule.kind === "each") picked.push(...rule.courses.filter((c) => known.has(norm(c))));
      else if (rule.kind === "alternatives") {
        const option = rule.options.find((o) => o.recommended) ?? rule.options[0]!;
        picked.push(...option.courses.filter((c) => known.has(norm(c))));
      } else if (rule.kind === "choose" && !rule.overlay) {
        const pools = namedLists(structure, rule.lists, req.key).map((l) =>
          coursesOfList(l).filter((c) => known.has(norm(c)) && !reserved.has(norm(c)) && !picked.includes(c)),
        );
        // Round-robin over the lists so a "from at least K areas" rule is met by the example.
        const chosen: string[] = [];
        for (let progress = true; chosen.length < rule.count && progress; ) {
          progress = false;
          for (const pool of pools) {
            const c = pool.find((x) => !chosen.includes(x));
            if (c && chosen.length < rule.count) {
              chosen.push(c);
              progress = true;
            }
          }
        }
        picked.push(...chosen);
      }
    }
  }
  const all = unique(picked);
  return { lowerDiv: all.filter((c) => numberOf(c) < 100), upperDiv: all.filter((c) => numberOf(c) >= 100) };
}
