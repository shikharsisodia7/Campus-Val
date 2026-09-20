/**
 * Parser for the REAL Workday "View My Academic Progress" table layout.
 *
 * Written against an actual SCU APR (PDF, text-extracted). What that document
 * looks like once extracted — and why the simple line-based parser could not
 * read it:
 *
 *   - It is a TABLE (Requirement | Status | Satisfied With | Remaining |
 *     Registrations Used | Academic Period | Units | Grade) flattened to one
 *     cell fragment per line. Requirement names, course titles and the
 *     "Minimum N Course(s)" text all wrap across several lines.
 *   - The status word ("Satisfied" / "Not Satisfied" / "In Progress") sits
 *     right after the name, sometimes on the SAME line as the name and/or the
 *     first course ("Core: LSB: CTW 1 Satisfied ENGL 1A - Critical").
 *   - University Core requirements are ROWS inside a major's block
 *     ("Core: LSB: CTW 1 …"), not a heading of their own. Blocks in the same
 *     school repeat them; a major in another school brings that school's own
 *     set ("Core: CAS: …"). Minor blocks carry none.
 *   - Each program (major, every minor, special programs) is its own block:
 *     "<Program> Requirements" / "Program of Study GPA …" / "Requirements
 *     Effective …" / "Last Evaluated …".
 *   - Every page repeats furniture ("View My Academic Progress 12:37 PM",
 *     "09/08/2026Page 2 of 12Satisfied With", the column headers).
 *   - The "Remaining" column ("Minimum 44 Unit(s)", "Minimum 1 Course(s)",
 *     "Minimum Combination Required", "Minimum Activities: 1") says what is
 *     still needed.
 *
 * Reading is a small state machine over the cleaned lines. It records only what
 * the document states: the status word is Workday's, the remaining text is
 * Workday's, the units/grade are Workday's. Anything it cannot place is counted
 * in `unreadCourseRows` rather than guessed.
 */
import type {
  ParsedGroupKind,
  ParsedRequirement,
  ParsedRequirementCourse,
  ParsedRequirementGroup,
} from "./progress-report-parser";

export interface WorkdayTableParse {
  groups: ParsedRequirementGroup[];
  /** From the page-1 header "(Finance Major/Real Estate Minor/…)". */
  declaredMajors: string[];
  declaredMinors: string[];
  /** ISO dates (YYYY-MM-DD) printed by Workday. */
  reportDate: string | null;
  lastEvaluated: string | null;
  /** Course entries that started but never reached a units/grade line. */
  unreadCourseRows: number;
}

export interface WorkdayTableHooks {
  hasCatalogCode: (code: string) => boolean;
  classifyGroupKind: (heading: string) => ParsedGroupKind;
}

export function looksLikeWorkdayTable(text: string): boolean {
  return /Requirement\s+Status\s+Remaining/i.test(text) && /Program of Study GPA/i.test(text);
}

// --- page furniture ---------------------------------------------------------
const PAGE_PREFIX_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s*Page\s+\d+\s+of\s+\d+/i;
const FURNITURE_LINES = [
  /^View My Academic Progress\b/i,
  /^Satisfied With$/i,
  /^Requirement Status Remaining$/i,
  /^Registrations Used Academic$/i,
  /^Period Units Grade$/i,
];

// Same vocabulary as the line-based reader: Workday also prints "Not Started".
const STATUS_RE = /\b(Not Satisfied|Not Started|Satisfied|In Progress)\b/;
// The title may start on the next line ("ENVS 131 -" / "Environmental Education"), so it is optional.
const COURSE_START_RE = /^([A-Z]{2,5})\s?(\d{1,3}[A-Z]{0,2})\s+-(?:\s+(.*))?$/;
const UNITS_GRADE_RE = /^(\d+(?:\.\d+)?)(?:\s+(A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|P|NP|CR|NC|W|I|AU))?$/;
const PERIOD_RE = /^(Fall|Winter|Spring|Summer)\s+\d{4}$/;

/**
 * The complete forms of the Remaining column. Text after a status word is
 * accumulated (it wraps) until it forms one of these; leftovers belong to the
 * next cell (usually the first course). Matching exact shapes — not "up to the
 * next keyword" — is what stops a wrapped cell from swallowing the next row.
 */
const REMAINING_COMPLETE_RE =
  /^Minimum\s+(?:\d+(?:\.\d+)?\s+(?:Course\(s\)|Unit\(s\)|GPA)|Combination\s+Required|Activities:\s*\d+)/;
/** Give up on a Remaining buffer that never completes (keeps what was read; never swallows more). */
const REMAINING_MAX_CHARS = 70;

const BLOCK_STAT_RES = [
  /^Program of Study GPA\b/i,
  /^Requirements Effective\b/i,
  /^Requirements Not Assigned\b/i,
];

const MUST_COMPLETE_UNITS_RE =
  /must\s+complete\s+(?:a\s+minimum\s+)?(\d+(?:\.\d+)?)\s+(?:upper[\s-]?division\s+)?units?\b/i;
const UPPER_DIVISION_RE = /\bupper[\s-]?division\b/i;

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function isoFromMDY(m: string, d: string, y: string): string {
  return `${y}-${m}-${d}`;
}

/** "Finance Major" → majors, "Real Estate Minor" → minors; anything else (a special program) is ignored here. */
function parseDeclaredPrograms(header: string): { majors: string[]; minors: string[] } {
  const open = header.indexOf("(");
  const close = header.lastIndexOf(")");
  if (open < 0 || close <= open) return { majors: [], minors: [] };
  const majors: string[] = [];
  const minors: string[] = [];
  for (const raw of header.slice(open + 1, close).split("/")) {
    const item = norm(raw);
    if (/\bMajor$/i.test(item)) majors.push(item.replace(/\s+Major$/i, ""));
    else if (/\bMinor$/i.test(item)) minors.push(item.replace(/\s+Minor$/i, ""));
  }
  return { majors, minors };
}

interface CourseDraft {
  code: string;
  titleParts: string[];
  period: string | null;
}

export function parseWorkdayTable(text: string, hooks: WorkdayTableHooks): WorkdayTableParse {
  let reportDate: string | null = null;
  let lastEvaluated: string | null = null;

  // 1. Strip the page furniture, keeping any real text that shares a line with it.
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = norm(raw);
    if (!line) continue;
    const pm = PAGE_PREFIX_RE.exec(line);
    if (pm) {
      reportDate ??= isoFromMDY(pm[1]!, pm[2]!, pm[3]!);
      line = norm(line.slice(pm[0].length));
      if (!line) continue;
    }
    if (FURNITURE_LINES.some((re) => re.test(line))) continue;
    lines.push(line);
  }

  // 2. Page-1 header: everything before "Cumulative GPA" carries the declared programs.
  const headerEnd = lines.findIndex((l) => /^Cumulative GPA\b/i.test(l));
  const { majors, minors } = parseDeclaredPrograms(
    headerEnd > 0 ? lines.slice(0, headerEnd).join(" ") : "",
  );

  // 3. Walk the blocks.
  const groups: ParsedRequirementGroup[] = [];
  let unreadCourseRows = 0;
  let order = 0;

  let current: ParsedRequirementGroup | null = null;
  let nameLines: string[] = [];
  let status: ParsedRequirement["status"] | null = null;
  let statusWord = "";
  let remaining = "";
  let remainingOpen = false;
  let courses: ParsedRequirementCourse[] = [];
  let draft: CourseDraft | null = null;
  let state: "name" | "after" | "course" = "name";

  const statusOf = (w: string): ParsedRequirement["status"] =>
    w === "Satisfied" ? "completed" : w === "In Progress" ? "in_progress" : "remaining";

  const finishCourse = (
    d: CourseDraft,
    units: number | null,
    grade: string | null,
  ): ParsedRequirementCourse => {
    const full = norm(d.titleParts.join(" "));
    const transfer = /\(Transfer Credit\)/i.test(full);
    const inProgress = /\(In Progress\)/i.test(full);
    const title = norm(full.replace(/\((?:In Progress|Transfer Credit)\)/gi, "")) || d.code;
    return {
      code: d.code,
      title,
      units,
      grade,
      inCatalog: hooks.hasCatalogCode(d.code),
      ...(inProgress ? { inProgress: true } : {}),
      ...(transfer ? { transfer: true } : {}),
      ...(d.period ? { period: d.period } : {}),
    };
  };

  const flushRow = () => {
    if (draft) {
      // A course entry that never reached its units/grade line.
      unreadCourseRows += 1;
      courses.push(finishCourse(draft, null, null));
      draft = null;
    }
    if (current && status) {
      const name = norm(nameLines.join(" "));
      if (name) {
        const unit = MUST_COMPLETE_UNITS_RE.exec(name);
        const rem = norm(remaining);
        const requirement: ParsedRequirement = {
          name,
          status,
          courses,
          order: order++,
          scope: /^University Requirement:/i.test(name) ? "university" : "program",
          sourceText: norm(`${name} ${statusWord} ${rem}`).slice(0, 240),
          ...(rem ? { remaining: rem } : {}),
          ...(/^Core:/i.test(name)
            ? { category: "core" as const }
            : /\b(?:School|College)\b[^:]*\bCore\b/i.test(name)
              ? { category: "college" as const }
              : {}),
          ...(unit
            ? {
                unit: UPPER_DIVISION_RE.test(name) ? ("upper_division" as const) : ("total" as const),
                requiredUnits: Number(unit[1]),
                detail: rem || null,
              }
            : {}),
        };
        current.requirements.push(requirement);
      }
    }
    nameLines = [];
    status = null;
    statusWord = "";
    remaining = "";
    remainingOpen = false;
    courses = [];
    state = "name";
  };

  /** Consume text that follows a status word (the Remaining column, then course entries). */
  const consumeAfter = (t: string) => {
    let rest = t.trim();
    while (rest) {
      if (remainingOpen || /^Minimum\b/.test(rest)) {
        remainingOpen = true;
        const buffer = norm(`${remaining} ${rest}`);
        const m = REMAINING_COMPLETE_RE.exec(buffer);
        if (m) {
          remaining = m[0];
          remainingOpen = false;
          rest = buffer.slice(m[0].length).trim();
          continue;
        }
        if (buffer.length <= REMAINING_MAX_CHARS) {
          remaining = buffer; // wraps onto the next line
          return;
        }
        // Never completed: keep what was read, stop accumulating, reinterpret the rest as content.
        remaining = buffer.slice(0, REMAINING_MAX_CHARS);
        remainingOpen = false;
        rest = buffer.slice(REMAINING_MAX_CHARS).trim();
        continue;
      }
      const cs = COURSE_START_RE.exec(rest);
      if (cs) {
        draft = { code: `${cs[1]} ${cs[2]}`, titleParts: cs[3] ? [cs[3]] : [], period: null };
        state = "course";
        return;
      }
      // Neither remaining text nor a course: this starts the NEXT requirement's name.
      flushRow();
      handleName(rest);
      return;
    }
  };

  const handleName = (t: string) => {
    const sm = STATUS_RE.exec(t);
    if (sm) {
      const before = t.slice(0, sm.index).trim();
      if (before) nameLines.push(before);
      statusWord = sm[1]!;
      status = statusOf(statusWord);
      state = "after";
      consumeAfter(t.slice(sm.index + sm[0].length));
    } else {
      nameLines.push(t);
    }
  };

  const handleCourseLine = (t: string) => {
    const ug = UNITS_GRADE_RE.exec(t);
    if (ug && draft) {
      courses.push(finishCourse(draft, Number(ug[1]), ug[2] ?? null));
      draft = null;
      state = "after";
      return;
    }
    if (PERIOD_RE.test(t) && draft) {
      draft.period = t;
      return;
    }
    if (t === "Quarter") return;
    // A new requirement row began before this course reached its units line.
    if (STATUS_RE.test(t) && /^[A-Z][A-Za-z]+.*:/.test(t)) {
      flushRow();
      handleName(t);
      return;
    }
    draft?.titleParts.push(t);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Block heading: a line ending in "Requirements" followed by "Program of Study GPA".
    if (/Requirements$/.test(line) && BLOCK_STAT_RES[0]!.test(lines[i + 1] ?? "")) {
      flushRow();
      current = {
        name: norm(line),
        requirements: [],
        kind: hooks.classifyGroupKind(line),
        order: order++,
      };
      groups.push(current);
      continue;
    }
    if (!current) continue; // still in the page-1 header

    // Block statistics lines.
    const le = /^Last Evaluated\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(line);
    if (le) {
      const iso = isoFromMDY(le[1]!, le[2]!, le[3]!);
      if (!lastEvaluated || iso > lastEvaluated) lastEvaluated = iso;
      continue;
    }
    if (BLOCK_STAT_RES.some((re) => re.test(line))) continue;

    if (state === "name") handleName(line);
    else if (state === "after") consumeAfter(line);
    else handleCourseLine(line);
  }
  flushRow();

  return {
    groups: groups.filter((g) => g.requirements.length > 0),
    declaredMajors: majors,
    declaredMinors: minors,
    reportDate,
    lastEvaluated,
    unreadCourseRows,
  };
}
