/**
 * Parses pasted text from SCU's Workday "Find Course Sections" view.
 *
 * Workday's copy-paste output is tab/newline-delimited. The exact column
 * order varies by tenant config, so this parser is deliberately tolerant:
 * for each non-empty line it extracts whatever it can (course code,
 * section number, instructor, meeting pattern, seats) and reports the
 * lines it could not parse so the user can fix them.
 *
 * Typical Workday cell content the parser handles:
 *   Course code:   "CSEN 12-01" | "CSEN 0012-01" | "MATH 11-2"
 *   Section #:     "01", "02", "1", "L1"
 *   Meeting:       "MWF | 9:15 AM - 10:20 AM" | "T R 10:00am-11:50am"
 *   Seats:         "12/35" | "Open Seats: 12 of 35" | "0 of 35 (Waitlist 4)"
 *   Instructor:    "Smith, John" | "John Smith" | "Smith, John (Primary)"
 */

export interface ParsedSection {
  courseCode: string;
  sectionNumber: string;
  instructor: string;
  meetingDays: ("M" | "T" | "W" | "R" | "F" | "S" | "U")[];
  startTime: string;
  endTime: string;
  location: string;
  seatsTotal: number;
  seatsOpen: number;
  waitlist: number;
  sourceLine: string;
}

export interface ParseResult {
  parsed: ParsedSection[];
  errors: { line: string; reason: string }[];
}

const COURSE_CODE_RE =
  /\b([A-Z]{2,5})\s*0*(\d{1,4}[A-Z]{0,3})(?:\s*-\s*([A-Z]?\d{1,3}[A-Z]?))?/;
// Match a meeting-pattern segment that precedes a time, allowing spaces
// between day letters ("M W F", "T R") and SCU's "Th" for Thursday.
const MEETING_PATTERN_RE =
  /((?:Th|Tu|Sa|Su|[MTWRFSU])(?:\s*(?:Th|Tu|Sa|Su|[MTWRFSU]))*)\s*[\|\-,–]?\s*(?=\d{1,2}:\d{2})/;
const TIME_RE =
  /(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*[-–to]+\s*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/;
const SEATS_SLASH_RE = /\b(\d{1,3})\s*\/\s*(\d{1,3})\b/;
const SEATS_OF_RE = /\b(\d{1,3})\s+of\s+(\d{1,3})\b/i;
const WAITLIST_RE = /waitlist[^\d]*(\d{1,3})/i;
const INSTRUCTOR_LASTFIRST_RE = /\b([A-Z][a-zA-Z\-']+),\s*([A-Z][a-zA-Z\-'.]+)/;

function normalizeTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return raw.trim();
  let h = parseInt(m[1]!, 10);
  const min = m[2]!;
  const mer = m[3]?.toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${min}`;
}

function parseDays(
  raw: string,
): ("M" | "T" | "W" | "R" | "F" | "S" | "U")[] {
  // Normalize multi-char day tokens first so "Th"->R, "Tu"->T, "Sa"->S, "Su"->U
  const norm = raw
    .replace(/Th/gi, "R")
    .replace(/Tu/gi, "T")
    .replace(/Sa/gi, "S")
    .replace(/Su/gi, "U")
    .toUpperCase();
  const valid = new Set(["M", "T", "W", "R", "F", "S", "U"]);
  const out: ("M" | "T" | "W" | "R" | "F" | "S" | "U")[] = [];
  const seen = new Set<string>();
  for (const ch of norm) {
    if (valid.has(ch) && !seen.has(ch)) {
      seen.add(ch);
      out.push(ch as "M" | "T" | "W" | "R" | "F" | "S" | "U");
    }
  }
  return out;
}

function extractInstructor(line: string): string {
  // Try "Last, First" first
  const lf = line.match(INSTRUCTOR_LASTFIRST_RE);
  if (lf) return `${lf[2]} ${lf[1]}`.trim();
  // Fallback: scan tab-separated fields for one that looks like a person
  const fields = line.split(/\t+/).map((f) => f.trim());
  for (const f of fields) {
    if (
      /^[A-Z][a-zA-Z\-']+\s+[A-Z][a-zA-Z\-']+$/.test(f) &&
      !/(course|section|class|fall|winter|spring|summer)/i.test(f)
    ) {
      return f;
    }
  }
  return "Unknown Instructor";
}

/**
 * Workday cells often contain newlines, so a single section can span many
 * lines like "CSEN 12-01\nLecture\nMWF | 9:15 AM - 10:20 AM\nSmith, Alice".
 *
 * We first try line-based parsing (each line = one section). If that yields
 * meaningfully fewer sections than the number of distinct course codes we
 * can spot in the text, we fall back to "block" mode: group consecutive
 * lines under whichever course code they appear after, then run the same
 * field extractors on the joined block.
 */
function buildBlocks(lines: string[]): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (COURSE_CODE_RE.test(line) && current.length > 0) {
      blocks.push(current.join(" \t "));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join(" \t "));
  // Filter blocks that don't contain a course code at all
  return blocks.filter((b) => COURSE_CODE_RE.test(b));
}

export function parseWorkdaySections(rawText: string): ParseResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Decide between line-mode and block-mode by counting distinct course
  // codes vs lines that look like complete sections (have both a code AND
  // a meeting pattern OR seats info on the same line).
  const linesWithCode = lines.filter((l) => COURSE_CODE_RE.test(l));
  const completeLines = lines.filter(
    (l) =>
      COURSE_CODE_RE.test(l) &&
      (TIME_RE.test(l) ||
        SEATS_SLASH_RE.test(l) ||
        SEATS_OF_RE.test(l)),
  );

  // If most code-bearing lines are incomplete, switch to block mode
  const useBlocks =
    linesWithCode.length > 0 &&
    completeLines.length / linesWithCode.length < 0.5;

  const units = useBlocks ? buildBlocks(lines) : lines;
  const result = parseUnits(units);

  // If line mode produced too few results, retry as blocks once.
  if (!useBlocks && result.parsed.length === 0 && linesWithCode.length > 0) {
    return parseUnits(buildBlocks(lines));
  }
  return result;
}

function parseUnits(units: string[]): ParseResult {
  const parsed: ParsedSection[] = [];
  const errors: { line: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const rawLine of units) {
    if (seen.has(rawLine)) continue;
    seen.add(rawLine);

    const line = rawLine;
    const codeMatch = line.match(COURSE_CODE_RE);
    if (!codeMatch) {
      // Not a section line — skip silently if it's clearly a header/total
      if (
        /^(course|section|listing|find course|results|total|of\s+\d+|^\d+\s+items?$)/i.test(
          line,
        )
      ) {
        continue;
      }
      errors.push({ line, reason: "no course code found" });
      continue;
    }

    const dept = codeMatch[1]!;
    const num = codeMatch[2]!;
    const sec = codeMatch[3] ?? "";
    const courseCode = `${dept} ${num.replace(/^0+(?=\d)/, "")}`;
    const sectionNumber = sec || "01";

    let meetingDays: ParsedSection["meetingDays"] = [];
    let startTime = "";
    let endTime = "";
    const patMatch = line.match(MEETING_PATTERN_RE);
    if (patMatch) meetingDays = parseDays(patMatch[1]!);
    const timeMatch = line.match(TIME_RE);
    if (timeMatch) {
      startTime = normalizeTime(timeMatch[1]!);
      endTime = normalizeTime(timeMatch[2]!);
    }

    let seatsTotal = 0;
    let seatsOpen = 0;
    const slash = line.match(SEATS_SLASH_RE);
    const ofMatch = line.match(SEATS_OF_RE);
    if (slash) {
      seatsOpen = parseInt(slash[1]!, 10);
      seatsTotal = parseInt(slash[2]!, 10);
    } else if (ofMatch) {
      seatsOpen = parseInt(ofMatch[1]!, 10);
      seatsTotal = parseInt(ofMatch[2]!, 10);
    }

    let waitlist = 0;
    const wl = line.match(WAITLIST_RE);
    if (wl) waitlist = parseInt(wl[1]!, 10);

    const instructor = extractInstructor(line);

    // Best-effort location: a tab field that contains "Hall", "Room",
    // a building code, or a number-letter pattern
    let location = "";
    for (const f of line.split(/\t+/)) {
      const t = f.trim();
      if (
        /(Hall|Center|Building|Room|Bldg|Lab|Online|Remote)\b/i.test(t) ||
        /^[A-Z]{2,5}\s*\d{1,4}[A-Z]?$/.test(t)
      ) {
        location = t;
        break;
      }
    }

    parsed.push({
      courseCode,
      sectionNumber,
      instructor,
      meetingDays,
      startTime,
      endTime,
      location,
      seatsTotal,
      seatsOpen,
      waitlist,
      sourceLine: line,
    });
  }

  return { parsed, errors };
}
