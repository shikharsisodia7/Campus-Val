/**
 * Conservative Academic Progress Report text parser.
 *
 * Extracts ONLY what can be reliably identified from the report text:
 * SCU course codes (e.g. "CSCI 61", "MATH 11L") optionally followed on the
 * same line by a units value and/or a letter grade. Anything ambiguous is
 * skipped, and honest notes describe what was left out. Nothing is invented.
 */

export interface ExtractedCourse {
  code: string;
  title: string | null;
  units: number | null;
  grade: string | null;
}

export interface ProgressReportExtract {
  courses: ExtractedCourse[];
  notes: string[];
}

// SCU subject prefixes are 2–4 uppercase letters; numbers are 1–3 digits
// with an optional letter suffix (11L, 60A). Require word boundaries.
const COURSE_RE = /\b([A-Z]{2,4})\s?(\d{1,3}[A-Z]?)\b/g;

// Letter grades as they appear on Workday progress reports.
const GRADE_RE = /(?:^|\s)(A|A-|B\+|B|B-|C\+|C|C-|D\+|D|D-|F|P|NP|W|I|CR|NC|AU)(?:\s|$)/;

// Units: a standalone number 0.5–7 with optional decimal, commonly its own column.
const UNITS_RE = /(?:^|\s)([0-7](?:\.\d{1,2})?)(?:\s|$)/;

// Words that regex-match the course pattern but are not course subjects.
const NOT_SUBJECTS = new Set([
  "GPA",
  "AP",
  "IB",
  "PDF",
  "PAGE",
  "FALL",
  "YEAR",
  "UNIT",
  "TERM",
  "ID",
  "SCU",
]);

export function parseProgressReportText(text: string): ProgressReportExtract {
  const notes: string[] = [];
  const courses = new Map<string, ExtractedCourse>();

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    COURSE_RE.lastIndex = 0;
    const m = COURSE_RE.exec(line);
    if (!m) continue;
    const subject = m[1]!;
    if (NOT_SUBJECTS.has(subject)) continue;
    const code = `${subject} ${m[2]}`;

    const rest = line.slice(m.index + m[0].length);
    const gradeMatch = GRADE_RE.exec(rest);
    const grade = gradeMatch ? gradeMatch[1]! : null;
    // Look for units only in the trailing part, after removing the grade
    // token so "4.0" units isn't confused with grade text.
    const restNoGrade = gradeMatch ? rest.replace(gradeMatch[0], " ") : rest;
    const unitsMatch = UNITS_RE.exec(restNoGrade);
    const units = unitsMatch ? Number(unitsMatch[1]) : null;

    // Title: text between code and the first recognized numeric/grade
    // token, if it looks like words (letters + spaces). Otherwise null.
    let title: string | null = null;
    const titleCandidate = rest
      .trim()
      .split(/\s{2,}|\t/)[0]
      ?.trim()
      .replace(/[-–—:]\s*$/, "")
      .trim();
    if (
      titleCandidate &&
      /^[A-Za-z][A-Za-z0-9&,'()/. -]{3,80}$/.test(titleCandidate) &&
      !GRADE_RE.test(` ${titleCandidate} `)
    ) {
      title = titleCandidate;
    }

    const existing = courses.get(code);
    if (!existing) {
      courses.set(code, { code, title, units, grade });
    } else {
      // Keep the most complete record; never overwrite known with unknown.
      courses.set(code, {
        code,
        title: existing.title ?? title,
        units: existing.units ?? units,
        grade: existing.grade ?? grade,
      });
    }
  }

  if (courses.size === 0) {
    notes.push(
      "No course rows could be reliably identified in this file. The original report is stored unchanged — refer to it directly.",
    );
  } else {
    const missingUnits = [...courses.values()].filter(
      (c) => c.units === null,
    ).length;
    const missingGrades = [...courses.values()].filter(
      (c) => c.grade === null,
    ).length;
    if (missingUnits > 0) {
      notes.push(
        `${missingUnits} course(s) had no clearly identifiable unit value; units were left blank rather than guessed.`,
      );
    }
    if (missingGrades > 0) {
      notes.push(
        `${missingGrades} course(s) had no clearly identifiable grade; grades were left blank rather than guessed.`,
      );
    }
    notes.push(
      "Extraction is conservative and may be incomplete. Your official Workday Academic Progress Report remains the source of truth.",
    );
  }

  return { courses: [...courses.values()], notes };
}
