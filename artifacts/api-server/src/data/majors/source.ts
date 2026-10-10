/**
 * The 2026-27 Undergraduate Bulletin's requirement text for every major, word for word, as read from
 * https://www.scu.edu/bulletin/undergraduate/ on 2026-10-09 (bulletin-text-2026-27.json). Each structure
 * keeps it beside its rules so a person can proofread one against the other, and a test checks that every
 * course a structure names is named by this text.
 */
import TEXT from "./bulletin-text-2026-27.json";
import type { MajorStructure } from "./model";

interface StoredText {
  url: string;
  lines: string[];
  /** Course numbers under each course-listing heading of the page, in the Bulletin's order. */
  listings?: { heading: string; subject: string; numbers: string[] }[];
}

const BULLETIN_TEXT: Record<string, StoredText> = TEXT;

export const CATALOG_YEAR = "2026-27";
export const LAST_VERIFIED = "2026-10-09";

/** The provenance fields of a structure, from the Bulletin text stored under `key`. */
export function bulletinSource(
  key: string,
  department: string,
  verificationNote: string,
): Pick<MajorStructure, "sourceUrl" | "sourceLabel" | "catalogYear" | "lastVerified" | "verificationNote" | "sourceText" | "listingText"> {
  const text = BULLETIN_TEXT[key];
  if (!text) throw new Error(`No Bulletin text stored for "${key}".`);
  return {
    sourceUrl: text.url,
    sourceLabel: `SCU ${CATALOG_YEAR} Undergraduate Bulletin — ${department}, Requirements for the Major`,
    catalogYear: CATALOG_YEAR,
    lastVerified: LAST_VERIFIED,
    verificationNote,
    sourceText: text.lines,
    ...(text.listings ? { listingText: text.listings.map((g) => `${g.heading}: ${g.subject} ${g.numbers.join(", ")}`) } : {}),
  };
}

/** The courses the Bulletin lists under the named course-listing heading(s) of `key`'s page. */
export function listedUnder(key: string, ...headings: string[]): string[] {
  const groups = BULLETIN_TEXT[key]?.listings ?? [];
  const found = groups.filter((g) => headings.includes(g.heading));
  if (found.length !== headings.length) throw new Error(`Course-listing heading not found for "${key}": ${headings.join(" | ")}`);
  return found.flatMap((g) => g.numbers.map((n) => `${g.subject} ${n}`));
}

/** The stored Bulletin text for a school-level block (the Leavey School of Business core). */
export function bulletinLines(key: string): { url: string; lines: string[] } {
  const text = BULLETIN_TEXT[key];
  if (!text) throw new Error(`No Bulletin text stored for "${key}".`);
  return text;
}
