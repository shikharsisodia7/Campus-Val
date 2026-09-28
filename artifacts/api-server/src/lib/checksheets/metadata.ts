/**
 * Cleaning of what a student TYPES about a document: its title, program,
 * version label and where it came from. All of it is descriptive. None of it
 * is checked against anything, and none of it decides anything.
 */
import { CHECKSHEET_LIMITS } from "./limits";
import {
  CHECKSHEET_CATEGORIES,
  CHECKSHEET_PROGRAM_ROLES,
  TRACKING_STATUSES,
  TRACKING_TERMS,
  TRACKING_YEAR_RANGE,
  type ChecksheetCategory,
  type ChecksheetProgramRole,
  type TrackingStatus,
  type TrackingTerm,
} from "./model";

/** Trims, flattens line breaks and drops control characters. Empty becomes null. */
export function cleanLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

/** Like cleanLine, but line breaks are kept: a note may have several lines. */
export function cleanNote(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return text ? text.slice(0, maxLength) : null;
}

export type UrlResult = { ok: true; url: string | null } | { ok: false };

/**
 * A source URL is a convenience link back to where the student found the
 * document. Only plain http(s) addresses are stored; anything that could run
 * (javascript:, data:) or that hides credentials is refused.
 */
export function cleanSourceUrl(value: unknown): UrlResult {
  if (value === null || value === undefined) return { ok: true, url: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, url: null };
  if (trimmed.length > CHECKSHEET_LIMITS.sourceUrlMaxLength) return { ok: false };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false };
  if (url.username || url.password || !url.hostname) return { ok: false };
  return { ok: true, url: url.toString() };
}

export function asCategory(value: unknown): ChecksheetCategory | null {
  return (CHECKSHEET_CATEGORIES as readonly unknown[]).includes(value) ? (value as ChecksheetCategory) : null;
}

export function asProgramRole(value: unknown): ChecksheetProgramRole | null {
  return (CHECKSHEET_PROGRAM_ROLES as readonly unknown[]).includes(value) ? (value as ChecksheetProgramRole) : null;
}

export function asStatus(value: unknown): TrackingStatus | null {
  return (TRACKING_STATUSES as readonly unknown[]).includes(value) ? (value as TrackingStatus) : null;
}

export function asTerm(value: unknown): TrackingTerm | null {
  return (TRACKING_TERMS as readonly unknown[]).includes(value) ? (value as TrackingTerm) : null;
}

export function asTermYear(value: unknown): number | null {
  return Number.isInteger(value) &&
    (value as number) >= TRACKING_YEAR_RANGE.min &&
    (value as number) <= TRACKING_YEAR_RANGE.max
    ? (value as number)
    : null;
}

/**
 * A harmless starting title from a file name: "finance_major-2025.pdf" becomes
 * "finance major 2025". Only tidies the name; it reads nothing from the file
 * and says nothing about what the document is or whom it applies to.
 */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return cleanLine(base.replace(/[_-]+/g, " "), CHECKSHEET_LIMITS.titleMaxLength) ?? "Degree Checksheet";
}
