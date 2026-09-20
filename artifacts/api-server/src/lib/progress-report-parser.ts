/**
 * Conservative Academic Progress Report text parser.
 *
 * Extracts ONLY what can be reliably identified from the report text:
 * SCU course codes (e.g. "CSCI 61", "MATH 11L") optionally followed on the
 * same line by a units value and/or a letter grade. Anything ambiguous is
 * skipped, and honest notes describe what was left out. Nothing is invented.
 */

import { COURSES } from "../data/courses";
import { looksLikeWorkdayTable, parseWorkdayTable } from "./progress-report-workday-table";
import {
  classifySectionHeader,
  classifyRowStatusText,
  classifyAcademicRecordCompletion,
  KNOWN_GRADE_TOKEN,
  type ReportSectionStatus,
} from "./academic-record-status";

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

export interface ParsedCompletedCourse {
  code: string;
  title: string;
  units: number;
  confidence: "high";
}

/**
 * Try to detect a program/major line from plain text.
 * Looks for lines containing common program keywords near the text "major" or "program".
 */
const PROGRAM_KEYWORD_RE = /\b(major|program|degree)\b/i;

function extractProgram(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    if (!PROGRAM_KEYWORD_RE.test(rawLine)) continue;
    // Collapse xlsx-CSV cell separators (commas/tabs left by empty cells)
    // into single spaces so a spreadsheet-sourced program line reads like
    // prose instead of leaking raw delimiters, e.g. "Program:,Computer
    // Science and Engineering,,Expected Grad:,Spring 2026,,," from
    // sheet_to_csv. No-op for PDF-extracted text, which has no such commas.
    const trimmed = rawLine
      .replace(/[,\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (trimmed.length === 0 || trimmed.length >= 160) continue;
    // Return the trimmed line if it looks like a header line (not a sentence)
    if (!/[.!?]$/.test(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Parse an Excel (.xlsx) file buffer and extract course data.
 * Uses the xlsx package for parsing.
 */
export async function parseXlsxBuffer(buf: Buffer): Promise<ParsedProgressReport> {
  let text = "";
  try {
    const XLSX = await import("xlsx");
    const XLSXmod = (XLSX as any).default ?? XLSX;
    const workbook = XLSXmod.read(buf, { type: "buffer" });
    const textParts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSXmod.utils.sheet_to_csv(sheet);
      textParts.push(csv);
    }
    text = textParts.join("\n");
  } catch {
    return {
      completedCourses: [],
      possibleCourses: [],
      notes: ["Excel file parsing failed or file is corrupted."],
    };
  }

  if (!text || text.trim().length < 10) {
    return {
      completedCourses: [],
      possibleCourses: [],
      notes: ["No readable data found in Excel file."],
    };
  }

  return buildParsedReport(text, "No course codes were detected in the spreadsheet.");
}

/**
 * Parser/schema version for the structured hierarchy (`groups`). Bumped
 * whenever the shape of `groups` changes in a way that would make an
 * already-stored parse stale. The route layer reparses on read when a
 * stored report's version doesn't match this.
 */
export const APR_PARSER_VERSION = "hierarchical-v4";

/** A single course row nested under a requirement. */
export interface ParsedRequirementCourse {
  code: string;
  title: string;
  units: number | null;
  grade: string | null;
  /** false when the code doesn't match the SCU catalog — title/units are then the raw extracted text, never invented. */
  inCatalog: boolean;
  /** The row said "(In Progress)": enrolled, not finished. */
  inProgress?: boolean;
  /** The row said "(Transfer Credit)": accepted credit, not an SCU term. */
  transfer?: boolean;
  /** Workday's "Academic Period" text (e.g. "Fall 2025"), when the row has one. */
  period?: string;
}

/**
 * One requirement row within a group (e.g. "University Requirement: Must
 * have a minimum 2.000 Cumulative GPA", or a named major/minor requirement).
 * Real SCU Workday APRs use "Satisfied" / "In Progress" as row statuses —
 * never invent a status this file didn't state.
 */
export interface ParsedRequirement {
  name: string;
  status: "completed" | "in_progress" | "remaining" | "needs_review";
  courses: ParsedRequirementCourse[];
  /** Position in the source document (0-based, increasing across the whole report). */
  order?: number;
  /**
   * "university" for the university-wide rows Workday repeats under every
   * program ("University Requirement: ..."), "program" for the program's own.
   */
  scope?: "university" | "program";
  /**
   * Set only when the row itself states a unit requirement: a total-units
   * row or an upper-division-units row. Never inferred from anything else.
   */
  unit?: "total" | "upper_division";
  /** The number in "Must complete N units", when the row states one. */
  requiredUnits?: number | null;
  /**
   * Text Workday printed after the status word (e.g. "Minimum 40.0 Unit(s)").
   * Kept verbatim and NOT interpreted — its exact meaning is Workday's.
   */
  detail?: string | null;
  /**
   * The row's "Remaining" column, verbatim ("Minimum 1 Course(s)",
   * "Minimum 44 Unit(s)", "Minimum Combination Required"). Present only when
   * Workday printed one — never computed.
   */
  remaining?: string;
  /**
   * "core" for University Core rows ("Core: LSB: CTW 1"), "college" for a
   * school's own Core rows ("Leavey School of Business Core Knowledge: ...").
   * Workday places these rows inside a program block: blocks in the same school
   * repeat them, and a major in another school brings that school's own set
   * ("Core: CAS: ...").
   */
  category?: "core" | "college";
  /**
   * The source line this row was read from, whitespace-collapsed and length
   * capped. Present so a "Verify in Workday" item can be compared to the
   * original. Stripped from planning-view projections.
   */
  sourceText?: string;
}

/** What kind of program a group's heading names. Drives display order only. */
export type ParsedGroupKind = "core" | "major" | "minor" | "other";

/**
 * A top-level requirement group. Real Workday APRs group by the student's
 * actual declared program name (e.g. "Finance Major Requirements",
 * "Economics (BS) Major Requirements") rather than a fixed Core/College/
 * Major/Minor taxonomy, so group names are whatever the document says —
 * never hardcoded categories.
 */
export interface ParsedRequirementGroup {
  name: string;
  requirements: ParsedRequirement[];
  /** Classified from the heading text; `name` stays the document's own wording. */
  kind?: ParsedGroupKind;
  /** Position of the heading in the source document (0-based). */
  order?: number;
}

/** A unit-based requirement the APR states explicitly, in Workday's own words. */
export interface ParsedUnitRequirement {
  name: string;
  status: ParsedRequirement["status"];
  requiredUnits: number | null;
  detail: string | null;
  order: number;
}

/**
 * Totals the APR itself states. Every field is optional: a report that does
 * not print a total-units or upper-division row simply has no such summary —
 * CampusVal never computes one.
 */
export interface ParsedReportSummary {
  totalUnits?: ParsedUnitRequirement;
  upperDivisionUnits?: ParsedUnitRequirement;
  /** "Cumulative Credits Earned: N" when the report prints exactly that label. */
  creditsEarned?: number;
}

/** A line that is itself a group heading: "<Program Name> Requirements". */
const GROUP_HEADING_RE = /\bRequirements$/;
/** Status vocabulary as it actually appears on Workday APRs — never invented. */
const STATUS_WORD_RE = /\b(Satisfied|In Progress|Not Satisfied|Not Started)\b/i;
const NOT_SATISFIED_RE = /\bNot Satisfied\b/i;
const NOT_STARTED_RE = /\bNot Started\b/i;
const IN_PROGRESS_WORD_RE = /\bIn Progress\b/i;
const SATISFIED_WORD_RE = /(?:^|\s)Satisfied(?:\s|$)/i;
const REQUIREMENT_PREFIX_RE = /^(University|College|School|Major|Minor|Program)\s+Requirement:/i;

/**
 * Classify a group heading for DISPLAY ORDER ONLY (Core → Major → Minor →
 * Other). The heading text itself is never rewritten. "Minor" is checked
 * before "Major" so "Mathematics Minor Requirements" can't be misread.
 */
export function classifyGroupKind(heading: string): ParsedGroupKind {
  if (/\bcore\b/i.test(heading)) return "core";
  if (/\bminor\b/i.test(heading)) return "minor";
  if (/\bmajor\b/i.test(heading)) return "major";
  return "other";
}

const UNIVERSITY_ROW_RE = /^University\s+Requirement:/i;
const UPPER_DIVISION_RE = /\bupper[\s-]?division\b/i;
const MUST_COMPLETE_UNITS_RE = /\b(?:must\s+complete|minimum\s+of|at\s+least)\s+(\d+(?:\.\d+)?)\s+(?:upper[\s-]?division\s+)?units?\b/i;
const UNITS_WORD_RE = /\bunits?\b/i;
/** Whatever Workday printed after the status word, e.g. "Minimum 40.0 Unit(s)". */
const AFTER_STATUS_RE = /\b(?:Satisfied|In Progress|Not Satisfied|Not Started)\b\s*(.*)$/i;

function collapse(line: string, max = 200): string {
  const one = line.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function classifyRequirementStatus(line: string): ParsedRequirement["status"] {
  if (NOT_SATISFIED_RE.test(line) || NOT_STARTED_RE.test(line)) return "remaining";
  if (IN_PROGRESS_WORD_RE.test(line)) return "in_progress";
  if (SATISFIED_WORD_RE.test(line)) return "completed";
  return "needs_review";
}

/**
 * Unit fields for a requirement row — only when the ROW ITSELF is about
 * units. An upper-division row must say "upper division" and "unit(s)"; a
 * total row must state a "Must complete N units" quantity. Anything else
 * (GPA rows, course rows, vague rows) gets no unit fields.
 */
function unitFieldsFor(
  line: string,
  detail: string | null,
): Pick<ParsedRequirement, "unit" | "requiredUnits" | "detail"> | Record<string, never> {
  if (!UNITS_WORD_RE.test(line)) return {};
  const m = MUST_COMPLETE_UNITS_RE.exec(line);
  const requiredUnits = m ? Number(m[1]) : null;
  if (UPPER_DIVISION_RE.test(line)) {
    return { unit: "upper_division", requiredUnits, detail };
  }
  if (m) return { unit: "total", requiredUnits, detail };
  return {};
}

/** Lift the unit rows the APR states into a small summary — first row of each kind wins. */
export function buildReportSummary(
  groups: ParsedRequirementGroup[],
  text: string,
): ParsedReportSummary | undefined {
  const summary: ParsedReportSummary = {};
  for (const g of groups) {
    for (const r of g.requirements) {
      if (!r.unit) continue;
      // Label = the row's own words BEFORE the status word (the words after it
      // are kept separately in `detail`).
      const src = r.sourceText ?? r.name;
      const at = src.search(STATUS_WORD_RE);
      const unitReq: ParsedUnitRequirement = {
        name: at > 0 ? src.slice(0, at).trim() : r.name,
        status: r.status,
        requiredUnits: r.requiredUnits ?? null,
        detail: r.detail ?? null,
        order: r.order ?? 0,
      };
      if (r.unit === "total" && !summary.totalUnits) summary.totalUnits = unitReq;
      if (r.unit === "upper_division" && !summary.upperDivisionUnits) summary.upperDivisionUnits = unitReq;
    }
  }
  const earned = /Cumulative\s+Credits?\s+Earned:?\s*(\d+(?:\.\d+)?)/i.exec(text);
  if (earned) summary.creditsEarned = Number(earned[1]);
  return Object.keys(summary).length > 0 ? summary : undefined;
}

/**
 * Structural, section-aware pass that mirrors the real Workday APR layout:
 * group headings ("<Program> Requirements"), requirement rows carrying a
 * status word, and course rows nested under the requirement that precedes
 * them until the next requirement or group boundary. Courses that appear
 * before any requirement row in a group land under an honest "Other courses
 * in this section" bucket rather than being silently dropped.
 */
export function extractRequirementGroups(text: string): ParsedRequirementGroup[] {
  const groups: ParsedRequirementGroup[] = [];
  let currentGroup: ParsedRequirementGroup | null = null;
  let currentRequirement: ParsedRequirement | null = null;

  const codeRe = new RegExp(SCU_CODE_PATTERN.source);
  let order = 0; // document position of each heading / requirement row

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length > 200) continue;

    const hasStatusWord = STATUS_WORD_RE.test(line);
    const codeMatch = codeRe.exec(line);
    codeRe.lastIndex = 0;
    const startsWithCode = codeMatch !== null && codeMatch.index <= 2;

    // Group heading: short line ending in "Requirements", not itself a
    // requirement/course row (no status word, doesn't start with a code).
    if (
      GROUP_HEADING_RE.test(line) &&
      line.length < 80 &&
      !hasStatusWord &&
      !startsWithCode
    ) {
      currentGroup = { name: line, requirements: [], kind: classifyGroupKind(line), order: order++ };
      groups.push(currentGroup);
      currentRequirement = null;
      continue;
    }

    if (!currentGroup) continue; // Nothing before the first real group heading.

    // Requirement row: carries a status word, or an explicit "X Requirement:" prefix.
    if ((hasStatusWord && !startsWithCode) || REQUIREMENT_PREFIX_RE.test(line)) {
      const name = line.replace(STATUS_WORD_RE, "").trim().replace(/\s{2,}/g, " ");
      const detailRaw = AFTER_STATUS_RE.exec(line)?.[1]?.trim() || null;
      currentRequirement = {
        name: name || line,
        status: classifyRequirementStatus(line),
        courses: [],
        order: order++,
        scope: UNIVERSITY_ROW_RE.test(line) ? "university" : "program",
        sourceText: collapse(line),
        ...unitFieldsFor(line, detailRaw),
      };
      currentGroup.requirements.push(currentRequirement);
      continue;
    }

    // Course row: a catalog-code-like token near the start of the line.
    if (startsWithCode && codeMatch) {
      const normalized = normalizeCode(codeMatch[0]);
      const catalogCourse = catalogMap.get(normalized);
      const rest = line.slice(codeMatch.index + codeMatch[0].length).trim();
      // Grade is the LAST token, never the first standalone match — a title
      // like "Geometry I" contains a Roman numeral that isn't a grade.
      const restTokens = rest.replace(/\(In Progress\)/i, "").trim().split(/\s+/);
      const lastToken = restTokens[restTokens.length - 1] ?? "";
      const grade = KNOWN_GRADE_TOKEN.test(lastToken) ? lastToken : null;

      const course: ParsedRequirementCourse = catalogCourse
        ? {
            code: catalogCourse.code,
            title: catalogCourse.title,
            units: catalogCourse.units,
            grade,
            inCatalog: true,
          }
        : {
            code: normalized,
            title: rest.replace(/\(In Progress\)/i, "").trim() || normalized,
            units: null,
            grade,
            inCatalog: false,
          };

      if (!currentRequirement) {
        currentRequirement = {
          name: "Other courses in this section",
          status: "needs_review",
          courses: [],
          order: order++,
          scope: "program",
        };
        currentGroup.requirements.push(currentRequirement);
      }
      currentRequirement.courses.push(course);
    }
  }

  return groups;
}

/** Shared assembly of a ParsedProgressReport from extracted text. */
function buildParsedReport(text: string, emptyNote: string): ParsedProgressReport {
  // The real Workday table layout is read structurally; the line-based readers
  // below handle simpler exports (and spreadsheets).
  const table = looksLikeWorkdayTable(text)
    ? parseWorkdayTable(text, { hasCatalogCode: (c) => catalogMap.has(normalizeCode(c)), classifyGroupKind })
    : null;
  const tableUsable = table !== null && table.groups.length > 0;

  const { catalogMatches, nonCompletedMatches, unknownTokens } = tableUsable
    ? extractCoursesFromGroups(table.groups)
    : extractCodesFromText(text);
  const program = tableUsable && table.declaredMajors.length > 0
    ? table.declaredMajors.join(" / ")
    : extractProgram(text);
  const reportStudentId = extractStudentId(text);
  const groups = tableUsable ? table.groups : extractRequirementGroups(text);
  const summary = buildReportSummary(groups, text);

  const notes: string[] = [];
  if (catalogMatches.length === 0 && unknownTokens.length === 0 && nonCompletedMatches.length === 0) {
    notes.push(emptyNote);
  }
  if (nonCompletedMatches.length > 0) {
    notes.push(
      `${nonCompletedMatches.length} course(s) appear in the report as in-progress, withdrawn, or otherwise not completed; they were NOT counted as completed coursework.`,
    );
  }
  if (!reportStudentId) {
    notes.push("Identity could not be verified automatically (no student ID found in the document).");
  }
  if (tableUsable && table.unreadCourseRows > 0) {
    notes.push(
      `${table.unreadCourseRows} course row(s) could not be read completely (no units or grade found); they are shown without them rather than guessed.`,
    );
  }

  return {
    completedCourses: catalogMatches,
    ...(nonCompletedMatches.length > 0 ? { nonCompletedCourses: nonCompletedMatches } : {}),
    possibleCourses: unknownTokens,
    ...(program ? { program } : {}),
    ...(reportStudentId ? { reportStudentId } : {}),
    ...(groups.length > 0 ? { groups } : {}),
    ...(summary ? { summary } : {}),
    ...(tableUsable && table.declaredMajors.length > 0 ? { declaredMajors: table.declaredMajors } : {}),
    ...(tableUsable && table.declaredMinors.length > 0 ? { declaredMinors: table.declaredMinors } : {}),
    ...(tableUsable && table.reportDate ? { reportDate: table.reportDate } : {}),
    ...(tableUsable && table.lastEvaluated ? { lastEvaluated: table.lastEvaluated } : {}),
    parserVersion: APR_PARSER_VERSION,
    notes,
  };
}

/**
 * Course lists derived from the structured requirement rows of a Workday
 * table report. Same central completion rule as the line-based reader
 * (`classifyAcademicRecordCompletion`); a code is listed once, and a
 * completed record wins over an in-progress repeat of the same code.
 * Transfer-credit entries with no SCU catalog match (TRCR 1 ...) are accepted
 * credit, not courses to plan, so they never become "possible courses".
 */
export function extractCoursesFromGroups(groups: ParsedRequirementGroup[]): {
  catalogMatches: ParsedCompletedCourse[];
  nonCompletedMatches: ParsedNonCompletedCourse[];
  unknownTokens: ParsedPossibleCourse[];
} {
  const rank = (c: ParsedRequirementCourse) => (c.inProgress ? 0 : 1);
  const best = new Map<string, ParsedRequirementCourse>();
  for (const g of groups) {
    for (const r of g.requirements) {
      for (const c of r.courses) {
        const prev = best.get(c.code);
        if (!prev || rank(c) > rank(prev)) best.set(c.code, c);
      }
    }
  }

  const catalogMatches: ParsedCompletedCourse[] = [];
  const nonCompletedMatches: ParsedNonCompletedCourse[] = [];
  const unknownTokens: ParsedPossibleCourse[] = [];
  for (const [code, c] of best) {
    const catalogCourse = catalogMap.get(normalizeCode(code));
    if (!catalogCourse) {
      if (!c.transfer) unknownTokens.push({ raw: code });
      continue;
    }
    const sectionStatus: ReportSectionStatus = c.inProgress
      ? "in_progress"
      : c.transfer
        ? "transfer_credit"
        : "unknown";
    const completion = classifyAcademicRecordCompletion({ sectionStatus, grade: c.grade });
    if (completion === "completed") {
      catalogMatches.push({
        code: catalogCourse.code,
        title: catalogCourse.title,
        units: catalogCourse.units,
        confidence: "high",
      });
    } else {
      nonCompletedMatches.push({
        code: catalogCourse.code,
        title: catalogCourse.title,
        units: catalogCourse.units,
        status: c.inProgress ? "in_progress" : completion === "not_completed" ? "not_completed" : "needs_review",
      });
    }
  }
  return { catalogMatches, nonCompletedMatches, unknownTokens };
}

/**
 * Parse already-extracted report text. Exported so tests can exercise the
 * whole text-to-report pipeline with anonymized fixtures, without a PDF.
 */
export function parseReportText(text: string): ParsedProgressReport {
  return buildParsedReport(text, "No course codes were detected in the document.");
}

/** A catalog-matched course row that is NOT completed (or needs review). */
export interface ParsedNonCompletedCourse {
  code: string;
  title: string;
  units: number;
  status: "in_progress" | "not_completed" | "needs_review";
}

export interface ParsedProgressReport {
  completedCourses: ParsedCompletedCourse[];
  /** Catalog courses found in the report that must NOT be treated as completed. */
  nonCompletedCourses?: ParsedNonCompletedCourse[];
  possibleCourses: ParsedPossibleCourse[];
  program?: string;
  /** Student identifier extracted from the document, when confidently present. */
  reportStudentId?: string;
  /** Requirement-group hierarchy, when the document's structure supports it. */
  groups?: ParsedRequirementGroup[];
  /** Unit totals, only when the APR states them. */
  summary?: ParsedReportSummary;
  /** Majors and minors named in the report header - Workday's own list, never inferred. */
  declaredMajors?: string[];
  declaredMinors?: string[];
  /** ISO date printed on the report page ("09/08/2026"). */
  reportDate?: string;
  /** Most recent "Last Evaluated" date across the program blocks (ISO). */
  lastEvaluated?: string;
  /** Present once a report has been parsed by the hierarchical parser; absent on older stored reports. */
  parserVersion?: string;
  notes: string[];
}

export interface ParsedPossibleCourse {
  raw: string;
}

/**
 * Main parse entry point. Dispatches based on content type.
 * Returns { result, status } where status is the parse_status value.
 */
export async function parseProgressReport(
  buf: Buffer,
  contentType: string,
  fileName: string,
): Promise<{ result: ParsedProgressReport; status: "parsed" | "unsupported" | "failed" }> {
  const isPdf =
    contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isXlsx =
    contentType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileName.toLowerCase().endsWith(".xlsx");

  try {
    let result: ParsedProgressReport;
    if (isPdf) {
      result = await parsePdfBuffer(buf);
    } else if (isXlsx) {
      result = await parseXlsxBuffer(buf);
    } else {
      return {
        result: {
          completedCourses: [],
          possibleCourses: [],
          notes: [`Unsupported file type: ${contentType}. Only PDF and Excel (.xlsx) are supported.`],
        },
        status: "unsupported",
      };
    }

    // If text extraction yielded nothing usable
    if (
      result.completedCourses.length === 0 &&
      result.possibleCourses.length === 0 &&
      result.notes.some(
        (n) =>
          n.includes("No readable") ||
          n.includes("extraction failed") ||
          n.includes("not available"),
      )
    ) {
      return { result, status: "unsupported" };
    }

    return { result, status: "parsed" };
  } catch {
    return {
      result: {
        completedCourses: [],
        possibleCourses: [],
        notes: ["An unexpected error occurred during parsing."],
      },
      status: "failed",
    };
  }
}

/** SCU course code pattern: 2-5 uppercase letters, optional space, 1-3 digits, optional 0-2 letters */
const SCU_CODE_PATTERN = /\b([A-Z]{2,5})\s?(\d{1,3}[A-Z]{0,2})\b/g;

/**
 * Parse a PDF file buffer into plain text and extract course data.
 *
 * Uses `unpdf`, which (unlike `pdf-parse`) bundles cleanly with esbuild, so
 * it ships inside dist/**. `pdf-parse` required a runtime node_modules
 * lookup that Vercel's file tracer drops the pnpm symlink for — that's what
 * produced "PDF parser not available in this environment" in production.
 */
export async function parsePdfBuffer(buf: Buffer): Promise<ParsedProgressReport> {
  let text = "";
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const result = await extractText(pdf, { mergePages: true });
    text = result.text ?? "";
  } catch {
    return {
      completedCourses: [],
      possibleCourses: [],
      notes: ["PDF text extraction failed. The file may be scanned or encrypted."],
    };
  }

  if (!text || text.trim().length < 10) {
    return {
      completedCourses: [],
      possibleCourses: [],
      notes: ["No readable text found in PDF. The file may be a scanned image or encrypted."],
    };
  }

  return buildParsedReport(text, "No course codes were detected in the document.");
}

const catalogMap = new Map<string, (typeof COURSES)[0]>();
for (const c of COURSES) {
  catalogMap.set(c.code.toUpperCase().replace(/\s+/g, " ").trim(), c);
}

/** Confident student-ID line, e.g. "Student ID: 00000000" / "Student ID W1234567". */
const STUDENT_ID_RE = /\bSTUDENT\s*ID\b\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,19})\b/;

/**
 * Extract a student identifier from report text ONLY when it appears in an
 * unambiguous "Student ID: <value>" form. Returns undefined otherwise —
 * never guessed from loose digits.
 */
export function extractStudentId(text: string): string | undefined {
  const m = STUDENT_ID_RE.exec(text.toUpperCase());
  return m ? m[1] : undefined;
}

/**
 * Section-aware extraction. Walks the report line by line, tracking the
 * current section (completed term, transfer credit, in progress, withdrawn…)
 * and classifying every catalog-matched course row through the single
 * central rule in academic-record-status.ts. Only affirmatively completed
 * records land in catalogMatches; everything else is reported separately so
 * downstream import paths cannot mistake it for completed coursework.
 *
 * Exported for direct testing with anonymized golden-text fixtures that
 * represent actual pdf-parse / xlsx extraction output from Workday APR files.
 */
/** Words that match the course-code shape on an APR but are never course subjects. */
const NON_COURSE_SUBJECTS = new Set([
  "OF", "GPA", "CGPA", "UNIT", "UNITS", "TERM", "PAGE", "YEAR", "ID", "SCU", "PDF",
  "TOTAL", "MIN", "MAX", "AVG", "CUM", "GRADE", "CREDIT", "CREDITS",
]);

export function extractCodesFromText(text: string): {
  catalogMatches: ParsedCompletedCourse[];
  nonCompletedMatches: ParsedNonCompletedCourse[];
  unknownTokens: ParsedPossibleCourse[];
} {
  const catalogMatches: ParsedCompletedCourse[] = [];
  const nonCompletedMatches: ParsedNonCompletedCourse[] = [];
  const unknownTokens: ParsedPossibleCourse[] = [];
  const seenCodes = new Set<string>();

  let section: ReportSectionStatus = "unknown";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const upperLine = line.toUpperCase();

    // Normalize CSV/tab separators so xlsx-exported rows and headers
    // ("FALL 2022-2023,,,,") classify the same way as PDF text lines.
    const normalizedLine = upperLine.replace(/[,\t]+/g, " ").trim();

    const re = new RegExp(SCU_CODE_PATTERN.source, "g");

    // Does this line contain a catalog course or any code-like token besides
    // a season+year ("FALL 2022")? Season tokens match the code pattern but
    // belong to term headers, never course rows.
    const SEASONS = new Set(["FALL", "WINTER", "SPRING", "SUMMER"]);
    let lineHasCatalogCode = false;
    let lineHasNonTermToken = false;
    {
      const scan = new RegExp(SCU_CODE_PATTERN.source, "g");
      let m: RegExpExecArray | null;
      while ((m = scan.exec(normalizedLine)) !== null) {
        if (catalogMap.has(normalizeCode(m[0]))) lineHasCatalogCode = true;
        const prefix = m[0].match(/^[A-Z]+/)?.[0] ?? "";
        if (!SEASONS.has(prefix)) lineHasNonTermToken = true;
      }
    }

    // Pure header lines (no course rows) switch the current section.
    if (!lineHasCatalogCode && !lineHasNonTermToken) {
      const headerStatus = classifySectionHeader(normalizedLine);
      if (headerStatus !== null) {
        section = headerStatus;
        continue;
      }
    }

    // A row-level status column ("In Progress", "Withdrawn", "Registered"…)
    // overrides the section for this row only — never counted as completed.
    const rowStatus = classifyRowStatusText(upperLine);
    const effectiveSection = rowStatus ?? section;

    let match: RegExpExecArray | null;
    while ((match = re.exec(normalizedLine)) !== null) {
      const raw = match[0];
      // "Cumulative GPA 3.412" matches the code pattern as "GPA 3" — a decimal
      // is never a course number, and GPA/UNIT/TERM… are never subjects.
      // Flagging them would put a false "verify in Workday" alarm on almost
      // every report and teach students to ignore the real ones.
      if (/^\.\d/.test(normalizedLine.slice(match.index + raw.length))) continue;
      if (NON_COURSE_SUBJECTS.has(raw.match(/^[A-Z]+/)?.[0] ?? "")) continue;
      const normalized = normalizeCode(raw);
      if (seenCodes.has(normalized)) continue;
      seenCodes.add(normalized);

      const course = catalogMap.get(normalized);
      if (!course) {
        unknownTokens.push({ raw });
        continue;
      }

      // Grade: last known grade token between this course code and the NEXT
      // code-like token (collapsed PDF extraction can put several course rows
      // on one line — never read another course's grade column).
      const rest = normalizedLine.slice(match.index + match[0].length);
      const nextCode = new RegExp(SCU_CODE_PATTERN.source).exec(rest);
      const segment = nextCode ? rest.slice(0, nextCode.index) : rest;
      const tokens = segment.trim().split(/\s+/);
      // Workday's grade column is at the END of the row (possibly followed by
      // status text). Walk backwards, skipping status/filler tokens, and take
      // a grade only from that final position — NEVER from mid-title text
      // (e.g. the Roman numeral "I" in "Writing I and II" is not an
      // Incomplete grade).
      const SKIP_TOKEN = /^(COMPLETED|IN|PROGRESS|WITHDRAWN|DROPPED|REGISTERED|PLANNED|TRANSFER|CREDIT|FALL|WINTER|SPRING|SUMMER|-+|–|—|\d+(\.\d+)?|\d{4}[-–/]\d{2,4})$/;
      let grade: string | null = null;
      for (let t = tokens.length - 1; t >= 0; t--) {
        const tok = tokens[t]!;
        if (SKIP_TOKEN.test(tok)) continue;
        if (KNOWN_GRADE_TOKEN.test(tok)) grade = tok;
        break;
      }

      const completion = classifyAcademicRecordCompletion({ sectionStatus: effectiveSection, grade });
      if (completion === "completed") {
        catalogMatches.push({
          code: course.code,
          title: course.title,
          units: course.units,
          confidence: "high",
        });
      } else {
        nonCompletedMatches.push({
          code: course.code,
          title: course.title,
          units: course.units,
          status:
            effectiveSection === "in_progress"
              ? "in_progress"
              : completion === "not_completed"
                ? "not_completed"
                : "needs_review",
        });
      }
    }
  }

  return { catalogMatches, nonCompletedMatches, unknownTokens };
}

/** The catalog course for a code as an APR (or a student) typed it, or undefined. */
export function findCatalogCourse(code: string): (typeof COURSES)[0] | undefined {
  return catalogMap.get(normalizeCode(code));
}

/** Codes of the shape an APR prints: 2–5 letters, then digits with an optional letter suffix. */
const REPORT_CODE_SHAPE = /^[A-Z]{2,5} \d{1,3}[A-Z]{0,2}$/;

/** Normalized report code ("engl2a" → "ENGL 2A"), or null when it is not code-shaped. */
export function normalizeReportCode(raw: string): string | null {
  const code = normalizeCode(raw);
  return REPORT_CODE_SHAPE.test(code) ? code : null;
}

function normalizeCode(raw: string): string {
  // Always insert exactly one space between the letter prefix and the digit
  // suffix. PDF text extraction sometimes omits the space (e.g. "ACTG11"),
  // while the catalog map always stores codes with a space ("ACTG 11").
  // This prevents catalog-matched courses from silently falling through to
  // possibleCourses when PDF extraction drops the inter-field spacing.
  return raw
    .toUpperCase()
    .replace(/^([A-Z]{2,5})\s?(\d)/, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
