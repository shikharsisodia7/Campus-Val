/**
 * Extracts Department Note CANDIDATES from a department's published
 * Requirements Checklist (a spreadsheet), deterministically.
 *
 * What it reads: a table whose header row has a cell reading "Notes". The
 * table's section name is the header row's first cell; each row under it has a
 * label in the first column and, possibly, text in the Notes column. That text,
 * verbatim, is the candidate. Nothing is paraphrased, summarized or inferred.
 *
 * Where a candidate attaches (the anchor) is decided only by exact rules:
 *   - University Core table (Foundations / Explorations / Integrations): the
 *     row's label must be one of the known Core labels (see CORE_ALIASES) and
 *     the target Core requirement must exist in the program's tree;
 *   - the program's own table (its "<Program> Major Requirements" section): every
 *     course code in the row's label must belong to exactly ONE requirement item
 *     of the program; or, for a label that names no course ("UD BIOL CMB THEME
 *     w/ Lab 1"), the course list the row prints in a column without a heading
 *     must be EXACTLY the courses of one requirement item (the same set, not a
 *     subset: a theme's list is also part of the electives' list).
 * Anything else is "unmapped": the text and the label it sat beside are kept for
 * a person to place; it is never attached to a guess.
 *
 * A candidate is "publishable" only when its anchor is exact AND its text says
 * something in words. A note that is only course codes ("CHEM 14") is anchored
 * but needs a person to say what it means, so it is a draft.
 */
import { COURSES } from "../../data/courses";
import type { AprSheet } from "../apr/workbook-model";
import type { NormalizedGroup } from "../requirements-source/normalize";

export type CandidateStatus = "published" | "draft" | "unmapped";

export interface NoteCandidate {
  /** "Biology!D31": where it sat in the file. */
  sourceReference: string;
  sectionName: string;
  rowLabel: string;
  body: string;
  targetKey: string | null;
  kind: "requirement" | "core_overlap" | "sequence" | "advising" | null;
  status: CandidateStatus;
  /** Why it is not published / not anchored, for the review queue. */
  reason: string | null;
}

/** Core row labels as checklists write them -> the Core requirement id. */
const CORE_ALIASES: Record<string, string> = {
  "critical thinking and writing 1": "ctw1",
  "critical thinking & writing 1": "ctw1",
  "ctw 1": "ctw1",
  "critical thinking and writing 2": "ctw2",
  "critical thinking & writing 2": "ctw2",
  "ctw 2": "ctw2",
  "cultures & ideas 1": "ci1",
  "cultures and ideas 1": "ci1",
  "c&i 1": "ci1",
  "cultures & ideas 2": "ci2",
  "cultures and ideas 2": "ci2",
  "c&i 2": "ci2",
  "cultures & ideas 3": "ci3",
  "cultures and ideas 3": "ci3",
  "c&i 3": "ci3",
  "second language": "lang",
  mathematics: "math",
  "rtc 1": "rtc1",
  "rtc 2": "rtc2",
  "rtc 3": "rtc3",
  ethics: "ethics",
  "civic engagement": "civic",
  diversity: "diversity",
  arts: "arts",
  "natural science": "natsci",
  "social science": "socsci",
  sts: "sts",
  "advanced writing": "advwriting",
  elsj: "elsj",
  "pathway 1": "pathway",
  "pathway 2": "pathway",
  "pathway 3": "pathway",
  "pathway 4": "pathway",
};

const CORE_SECTIONS = new Set(["foundations", "explorations", "integrations"]);
const COURSE_CODE = /\b([A-Z]{2,5})\s?(\d{1,3}[A-Z]{0,2})\b/g;
const CATALOG_SUBJECTS = new Set(COURSES.map((c) => c.department.toUpperCase()));

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();
const colLetter = (c: number): string => String.fromCharCode(65 + c);

/**
 * A catalog subject in any case ("Chem"), or a word written in capitals the way
 * checklists write subjects. "Lab" in "w/ Lab 1" or "Year" in "Year 2" is
 * neither, so it is not read as a course; an unknown capitalized subject still
 * is, and then simply matches no requirement.
 */
const isCourseSubject = (written: string): boolean => CATALOG_SUBJECTS.has(written.toUpperCase()) || written === written.toUpperCase();

/** "PHYS 11/31" -> ["PHYS 11","PHYS 31"]; "CHEM 11" -> ["CHEM 11"]; "w/ Lab 1" -> []. */
export function courseCodesIn(label: string): string[] {
  const out: string[] = [];
  const slash = label.match(/\b([A-Za-z]{2,5})\s?(\d{1,3}[A-Za-z]{0,2}(?:\/\d{1,3}[A-Za-z]{0,2})+)\b/);
  if (slash && isCourseSubject(slash[1]!)) for (const n of slash[2]!.split("/")) out.push(`${slash[1]!.toUpperCase()} ${n.toUpperCase()}`);
  for (const m of label.matchAll(/\b([A-Za-z]{2,5})\s?(\d{1,3}[A-Za-z]{0,2})\b/g)) {
    if (!isCourseSubject(m[1]!)) continue;
    const code = `${m[1]!.toUpperCase()} ${m[2]!.toUpperCase()}`;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * "BIOL 110, 112, 113" -> ["BIOL 110","BIOL 112","BIOL 113"]: a subject carries
 * to the bare numbers after it. Null unless EVERY word is a subject, a course
 * number, "and" or "or", so a sentence is never read as a list.
 */
export function courseListIn(text: string): string[] | null {
  const out: string[] = [];
  let subject: string | null = null;
  for (const token of text.split(/[\s,;.&]+/).filter(Boolean)) {
    if (/^(?:and|or)$/i.test(token)) continue;
    if (/^[A-Za-z]{2,5}$/.test(token) && isCourseSubject(token)) subject = token.toUpperCase();
    else if (subject && /^\d{1,3}[A-Za-z]{0,2}$/.test(token)) {
      const code = `${subject} ${token.toUpperCase()}`;
      if (!out.includes(code)) out.push(code);
    } else return null;
  }
  return out.length > 0 ? out : null;
}

const normCode = (code: string): string => code.toUpperCase().replace(/\s+/g, " ");
const sameCourses = (a: readonly string[], b: readonly string[]): boolean => {
  const left = new Set(a.map(normCode));
  const right = new Set(b.map(normCode));
  return left.size === right.size && [...left].every((code) => right.has(code));
};

/** True when the text is only course codes and joining punctuation: it needs a person to say what it means. */
export function isCodesOnly(text: string): boolean {
  const rest = text.toUpperCase().replace(COURSE_CODE, " ").replace(/[\s,;/&+()\-–.]|\b(AND|OR)\b/g, "");
  return rest === "";
}

function kindOf(text: string): NoteCandidate["kind"] {
  if (/\boverlap|also (?:satisfies|counts)|double.?count/i.test(text)) return "core_overlap";
  if (/\b(year \d|first year|second year|take (?:before|after|during|in)|concurrent|recommend|sequence)\b/i.test(text)) return "sequence";
  return null;
}

/** Historical qualifiers are useful context, but must be reviewed before publication. */
function hasHistoricalQualifier(text: string): boolean {
  return /\bas of\s+\d{1,2}\/\d{2}(?:\/\d{2,4})?\b/i.test(text);
}

export function extractChecklistNotes(
  sheet: AprSheet,
  programTitle: string,
  programGroup: NormalizedGroup,
  tree: NormalizedGroup[],
  /** For a file matched to its program by a named alias: every table that is not University Core is the program's. */
  options: { everyTableIsProgram?: boolean } = {},
): NoteCandidate[] {
  const candidates: NoteCandidate[] = [];
  const core = tree.find((g) => g.group.kind === "university_core");
  const coreKeys = new Set(core?.items.map((i) => i.stableKey) ?? []);

  let notesCol = -1;
  /** Columns the table's header row names ("Quarter", "Prerequisites", "Notes"); a course list sits in one it does not. */
  let headedCols = new Set<number>();
  let section: { name: string; kind: "core" | "program" | "other" } | null = null;

  for (const row of sheet.rows) {
    const text = (c: number) => clean(row.cells.find((cell) => cell.c === c)?.text ?? "");
    const headerNotes = row.cells.find((cell) => /^notes$/i.test(clean(cell.text)));
    if (headerNotes) {
      notesCol = headerNotes.c;
      headedCols = new Set(row.cells.filter((cell) => clean(cell.text)).map((cell) => cell.c));
      const name = text(0);
      const lower = name.toLowerCase();
      section = {
        name,
        kind: CORE_SECTIONS.has(lower)
          ? "core"
          : options.everyTableIsProgram || (/requirements?$/.test(lower) && lower.includes(programTitle.toLowerCase()))
            ? "program"
            : "other",
      };
      continue;
    }
    if (!section || notesCol < 0) continue;
    const label = text(0);
    const body = text(notesCol);
    if (!label || !body || label === section.name) continue;

    const at = `${sheet.name}!${colLetter(notesCol)}${row.r + 1}`;
    const base = { sourceReference: at, sectionName: section.name, rowLabel: label, body };

    if (section.kind === "core") {
      const id = CORE_ALIASES[label.toLowerCase()];
      const targetKey = id && core ? `${core.stableKey}#${id}` : null;
      if (!targetKey || !coreKeys.has(targetKey)) {
        candidates.push({ ...base, targetKey: null, kind: null, status: "unmapped", reason: "The row label is not a University Core requirement CampusVal recognizes." });
        continue;
      }
      // The Core item is shared by every program, so the note keeps the row label that gives it meaning.
      const text2 = `${label}: ${body}`;
      const historical = hasHistoricalQualifier(body);
      candidates.push({
        ...base,
        body: text2,
        targetKey,
        kind: kindOf(body) ?? "requirement",
        status: historical ? "draft" : "published",
        reason: historical
          ? "The note contains a dated historical qualifier; review it against the current Bulletin before publishing."
          : null,
      });
      continue;
    }

    if (section.kind === "program") {
      const codes = courseCodesIn(label);
      // A label without a course may sit beside the list of courses it means, in a column the
      // header does not name. Only a complete list is read, and it must equal one requirement.
      const listed =
        codes.length > 0
          ? null
          : (row.cells
              .filter((cell) => cell.c !== 0 && !headedCols.has(cell.c))
              .map((cell) => courseListIn(clean(cell.text)))
              .find((list) => list !== null) ?? null);
      // EVERY code in the label must be one of the requirement's own courses. A row that lists
      // alternatives the requirement does not (PHYS 11/31 against an item for PHYS 31) is not
      // matched: the note may be about the alternative.
      const matches =
        codes.length > 0
          ? programGroup.items.filter((i) => {
              const own = i.item.courses.map(normCode);
              return codes.every((code) => own.includes(code));
            })
          : listed
            ? programGroup.items.filter((i) => sameCourses(i.item.courses, listed))
            : [];
      if (matches.length !== 1) {
        const named = codes.length > 0 ? codes.join(" / ") : (listed ?? []).join(", ");
        candidates.push({
          ...base,
          targetKey: null,
          kind: null,
          status: "unmapped",
          reason:
            codes.length === 0 && !listed
              ? "The row names no course and lists none, so it cannot be matched to a requirement."
              : matches.length === 0
                ? listed
                  ? `No requirement of this program has exactly the courses the row lists (${named}).`
                  : `No requirement of this program lists ${named}.`
                : `${named} matches ${matches.length} requirements.`,
        });
        continue;
      }
      candidates.push({
        ...base,
        targetKey: matches[0]!.stableKey,
        kind: kindOf(body) ?? "requirement",
        status: isCodesOnly(body) ? "draft" : "published",
        reason: isCodesOnly(body) ? "The note is only course codes; a person should confirm what it means before students see it." : null,
      });
      continue;
    }

    candidates.push({ ...base, targetKey: null, kind: null, status: "unmapped", reason: `The "${section.name}" table is not one CampusVal maps notes from.` });
  }
  return candidates;
}
