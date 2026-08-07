/**
 * Conservative Academic Progress Report text parser.
 *
 * Extracts ONLY what can be reliably identified from the report text:
 * SCU course codes (e.g. "CSCI 61", "MATH 11L") optionally followed on the
 * same line by a units value and/or a letter grade. Anything ambiguous is
 * skipped, and honest notes describe what was left out. Nothing is invented.
 */

import { COURSES } from "../data/courses";

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
function extractProgram(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      (lower.includes("major") || lower.includes("program") || lower.includes("degree")) &&
      line.trim().length > 0 &&
      line.trim().length < 100
    ) {
      // Return the trimmed line if it looks like a header line (not a sentence)
      const trimmed = line.trim();
      if (!/[.!?]$/.test(trimmed)) {
        return trimmed;
      }
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

  const { catalogMatches, unknownTokens } = extractCodesFromText(text);
  const program = extractProgram(text);

  const notes: string[] = [];
  if (catalogMatches.length === 0 && unknownTokens.length === 0) {
    notes.push("No course codes were detected in the spreadsheet.");
  }

  return {
    completedCourses: catalogMatches,
    possibleCourses: unknownTokens,
    ...(program ? { program } : {}),
    notes,
  };
}

export interface ParsedProgressReport {
  completedCourses: ParsedCompletedCourse[];
  possibleCourses: ParsedPossibleCourse[];
  program?: string;
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
 * Uses pdf-parse for text extraction.
 */
export async function parsePdfBuffer(buf: Buffer): Promise<ParsedProgressReport> {
  let text = "";
  try {
    // Dynamic import to avoid issues if module not present in test env
    const pdfParse = await import("pdf-parse").catch(() => null);
    if (!pdfParse) {
      return {
        completedCourses: [],
        possibleCourses: [],
        notes: ["PDF parser not available in this environment."],
      };
    }
    const mod = pdfParse as any;
    if (typeof mod.PDFParse === "function") {
      // pdf-parse v2 API: class-based
      const parser = new mod.PDFParse({ data: new Uint8Array(buf) });
      try {
        const result = await parser.getText();
        text = result?.text ?? "";
      } finally {
        try { await parser.destroy?.(); } catch { /* ignore */ }
      }
    } else {
      // pdf-parse v1 API: callable default export
      const fn = mod.default ?? mod;
      const result = await fn(buf);
      text = result.text ?? "";
    }
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

  const { catalogMatches, unknownTokens } = extractCodesFromText(text);
  const program = extractProgram(text);

  const notes: string[] = [];
  if (catalogMatches.length === 0 && unknownTokens.length === 0) {
    notes.push("No course codes were detected in the document.");
  }

  return {
    completedCourses: catalogMatches,
    possibleCourses: unknownTokens,
    ...(program ? { program } : {}),
    notes,
  };
}

const catalogMap = new Map<string, (typeof COURSES)[0]>();
for (const c of COURSES) {
  catalogMap.set(c.code.toUpperCase().replace(/\s+/g, " ").trim(), c);
}

/**
 * Exported for direct testing with anonymized golden-text fixtures that
 * represent actual pdf-parse / xlsx extraction output from Workday APR files.
 */
export function extractCodesFromText(text: string): {
  catalogMatches: ParsedCompletedCourse[];
  unknownTokens: ParsedPossibleCourse[];
} {
  const catalogMatches: ParsedCompletedCourse[] = [];
  const unknownTokens: ParsedPossibleCourse[] = [];
  const seenCodes = new Set<string>();

  const upper = text.toUpperCase();
  let match: RegExpExecArray | null;
  const re = new RegExp(SCU_CODE_PATTERN.source, "g");

  while ((match = re.exec(upper)) !== null) {
    const raw = match[0];
    const normalized = normalizeCode(raw);
    if (seenCodes.has(normalized)) continue;
    seenCodes.add(normalized);

    const course = catalogMap.get(normalized);
    if (course) {
      catalogMatches.push({
        code: course.code,
        title: course.title,
        units: course.units,
        confidence: "high",
      });
    } else {
      unknownTokens.push({ raw });
    }
  }

  return { catalogMatches, unknownTokens };
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
