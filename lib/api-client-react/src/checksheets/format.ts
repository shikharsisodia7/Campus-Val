/**
 * The words, options and checks of Degree Checksheets, the same on every
 * CampusVal client.
 */
import type {
  DegreeChecksheetCategory,
  DegreeChecksheetDocument,
  DegreeChecksheetFormat,
  DegreeChecksheetProgramRole,
  TrackingStatus,
  TrackingTerm,
} from "../generated/api.schemas";

/**
 * Calendar year a quarter falls in, given its academic-year anchor: Fall of
 * 2026-27 is 2026, Winter and Spring of it are 2027. The same conversion the
 * Degree Plan uses.
 */
function calendarYearFor(term: string, anchorYear: number): number {
  return term === "fall" ? anchorYear : anchorYear + 1;
}

/** The official SCU page that lists department checksheets. Linked, never scraped. */
export const SCU_CHECKSHEETS_URL = "https://www.scu.edu/drahmann/advising-toolkit/major-and-minor-checksheets/";

/**
 * What the STUDENT says a document is. Any number of documents may share a
 * category; CampusVal never infers one from the file.
 */
export const CHECKSHEET_CATEGORY_OPTIONS: { value: DegreeChecksheetCategory; label: string; plural: string }[] = [
  { value: "major_checksheet", label: "Major Checksheet", plural: "Major checksheets" },
  { value: "minor_checksheet", label: "Minor Checksheet", plural: "Minor checksheets" },
  { value: "four_year_plan", label: "Four-Year Plan", plural: "Four-year plans" },
  { value: "flowchart", label: "Flowchart", plural: "Flowcharts" },
  { value: "advising_resource", label: "Department Advising Resource", plural: "Advising resources" },
  { value: "other", label: "Other", plural: "Other" },
];

export function checksheetCategoryLabel(category: string): string {
  return CHECKSHEET_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? "Other";
}

export const PROGRAM_ROLE_OPTIONS: { value: DegreeChecksheetProgramRole; label: string }[] = [
  { value: "major", label: "Major" },
  { value: "additional_major", label: "Second / additional major" },
  { value: "minor", label: "Minor" },
  { value: "additional_minor", label: "Additional minor" },
  { value: "general", label: "General planning resource" },
];

export function programRoleLabel(role: string | null | undefined): string | null {
  return PROGRAM_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? null;
}

/** The student's own status for an item. Deliberately has no "official" or "verified" value. */
export const TRACKING_STATUS_OPTIONS: { value: TrackingStatus; label: string; short: string }[] = [
  { value: "not_started", label: "Not Started", short: "Not started" },
  { value: "planned", label: "Planned", short: "Planned" },
  { value: "in_progress", label: "In Progress", short: "In progress" },
  { value: "completed", label: "Completed", short: "Completed" },
];

export function trackingStatusLabel(status: string | null | undefined): string | null {
  return TRACKING_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? null;
}

export const TRACKING_TERM_OPTIONS: { value: TrackingTerm; label: string; letter: string }[] = [
  { value: "fall", label: "Fall", letter: "F" },
  { value: "winter", label: "Winter", letter: "W" },
  { value: "spring", label: "Spring", letter: "Sp" },
  { value: "summer", label: "Summer", letter: "Su" },
];

/** "Fall 2026". The year is the calendar year the quarter falls in. */
export function termLabel(term: string | null | undefined, year: number | null | undefined): string | null {
  const option = TRACKING_TERM_OPTIONS.find((o) => o.value === term);
  return option && year ? `${option.label} ${year}` : null;
}

/** "F26" — for the small markers drawn on a page. */
export function termShortLabel(term: string | null | undefined, year: number | null | undefined): string | null {
  const option = TRACKING_TERM_OPTIONS.find((o) => o.value === term);
  return option && year ? `${option.letter}${String(year).slice(-2)}` : null;
}

/** The academic year in progress: 2026 for July 2026 through June 2027. */
export function currentAcademicYearAnchor(now: Date = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * The year offered first when a student picks a quarter: that quarter's year
 * within the academic year in progress (Fall -> 2026, Winter -> 2027 during
 * 2026-27). Uses the same conversion as the Degree Plan, so "Winter 2027" here
 * is the Winter 2027 shown there.
 */
export function defaultYearForTerm(term: TrackingTerm, now: Date = new Date()): number {
  return calendarYearFor(term, currentAcademicYearAnchor(now));
}

/** Years a student can choose: past coursework back 12 years, plans 8 years ahead. */
export function trackingYearOptions(now: Date = new Date(), selected?: number | null): number[] {
  const current = currentAcademicYearAnchor(now);
  const years: number[] = [];
  for (let y = current + 8; y >= current - 12; y--) years.push(y);
  if (selected && !years.includes(selected)) years.push(selected);
  return years.sort((a, b) => b - a);
}

/**
 * "Uploaded Sep 28, 2026". This is when the file was added to CampusVal —
 * never worded as a department or "official version" date, which CampusVal
 * does not know.
 */
export function formatUploadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Upload date unavailable";
  return `Uploaded ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const FORMAT_LABEL: Record<DegreeChecksheetFormat, string> = {
  pdf: "PDF",
  xlsx: "Excel workbook",
  xls: "Excel workbook (older .xls)",
  docx: "Word document",
  png: "PNG image",
  jpg: "JPEG image",
};

/** The technical state of the FILE — never an academic statement. */
export function renderStatusLabel(document: Pick<DegreeChecksheetDocument, "renderStatus">): string {
  switch (document.renderStatus) {
    case "ready":
      return "Ready";
    case "original_only":
      return "Stored, no preview";
    default:
      return "Preview unavailable";
  }
}

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export const CHECKSHEET_ACCEPT = [...Object.keys(MIME), ...new Set(Object.values(MIME))].join(",");
export const SUPPORTED_FORMATS_TEXT = "PDF, Excel (.xlsx, .xls), Word (.docx), PNG or JPEG";

/**
 * Checked again, authoritatively, on the server (which also reads the file's
 * first bytes). This is only so a student learns about a wrong file before
 * waiting for an upload.
 */
export function validateChecksheetFile(
  file: { name: string; size: number },
  maxBytes: number,
): { contentType: string } | { error: string } {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  const contentType = MIME[ext];
  if (!contentType) {
    if (ext === ".doc") {
      return { error: "This is the older Word format (.doc). Save it as .docx or PDF and upload that file." };
    }
    if (ext === ".gdoc" || ext === ".gsheet") {
      return {
        error:
          "This is a shortcut to a Google file, not the document itself. In Google Docs or Sheets choose File, Download, then PDF, Word or Excel, and upload that file.",
      };
    }
    return { error: `This file type isn't supported. Upload a ${SUPPORTED_FORMATS_TEXT} file.` };
  }
  if (file.size === 0) return { error: "This file is empty." };
  if (file.size > maxBytes) {
    return { error: `File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.` };
  }
  return { contentType };
}

/**
 * A harmless starting title from a file name. It only tidies the name; it says
 * nothing about what the document is or whether it applies to the student.
 */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base.slice(0, 120);
}

/** Only plain web addresses are shown as links. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}


/** What a student column holds; "both" when it is the table's only student column. */
type ColumnField = "status" | "term" | "both";

/**
 * Whether a student column can hold what an entry carries. A Status column
 * holds a status, a Quarter column a quarter, and a table's only student column
 * holds both. An entry is never put where part of it would be lost.
 */
export function canHold(field: ColumnField, entry: { status: string | null; term: string | null }): boolean {
  if (field === "both") return true;
  if (field === "status") return !entry.term;
  return !entry.status;
}

/** What an entry says, in a few words: "Completed, Fall 2025". */
export function entrySummary(entry: { status: string | null; term: string | null; termYear: number | null }): string {
  return [trackingStatusLabel(entry.status), termLabel(entry.term, entry.termYear)].filter(Boolean).join(", ") || "no status yet";
}

/** What a replacement did with the student's tracking. */
export interface ReplacementResult {
  kept: number;
  detached: number;
  /** Of the kept entries, markers that followed their page to a new page number. */
  moved?: number;
}

const entries = (n: number) => `${n} tracking ${n === 1 ? "entry" : "entries"}`;

/** In words: what stayed, what followed its page, what needs the student. */
export function replacementSummary({ kept, detached, moved = 0 }: ReplacementResult): string {
  if (kept + detached === 0) return "There was no tracking to carry over.";
  const followed =
    moved > 0
      ? ` ${moved === kept ? (moved === 1 ? "It" : "They") : `${moved} of them`} followed ${moved === 1 ? "its page" : "their pages"} to a new page number.`
      : "";
  if (detached === 0) {
    return `All ${kept} of your tracking ${kept === 1 ? "entry is" : "entries are"} still in place.${followed}`;
  }
  const aside = `${detached} of your tracking ${detached === 1 ? "entry" : "entries"} could not be matched to the new file and ${detached === 1 ? "is" : "are"} listed under My Tracking, so nothing is shown against the wrong requirement. You can place ${detached === 1 ? "it" : "them"} on the new document yourself.`;
  return kept > 0 ? `${aside} ${entries(kept)} stayed in place.${followed}` : aside;
}

interface NamedCell {
  c: number;
  text: string;
}

/**
 * What a row of a worksheet is about, in the department's own words: the text
 * in the columns that belong to a student column, which are the ones between
 * the previous student column and it. (A sheet may hold two tables side by side.)
 */
export function sheetRowName(cells: readonly NamedCell[], r: number, column: number, studentColumns: readonly number[]): string {
  const previous = [...studentColumns].sort((a, b) => a - b).reverse().find((c) => c < column) ?? -1;
  const filled = cells.filter((cell) => !studentColumns.includes(cell.c) && cell.text.trim() !== "");
  const own = filled.filter((cell) => cell.c > previous && cell.c < column);
  const name = (own.length > 0 ? own : filled)
    .slice(0, 2)
    .map((cell) => cell.text.trim())
    .join(", ");
  return name ? name.slice(0, 120) : `row ${r + 1}`;
}
