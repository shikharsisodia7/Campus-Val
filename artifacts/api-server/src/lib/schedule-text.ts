/**
 * Shared day-of-week and clock-time text parsing, used by both the Workday
 * paste-in parser and the Registrar tentative-schedule (Excel) importer.
 * Kept in one place so "Th means Thursday" and "9:15 AM -> 09:15" are never
 * defined two different ways in the codebase.
 */

export type MeetingDay = "M" | "T" | "W" | "R" | "F" | "S" | "U";

/** "9:15 AM" -> "09:15". Leaves an already-24h or unparseable string as-is. */
export function normalizeTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return raw.trim();
  let h = parseInt(m[1]!, 10);
  const min = m[2]!;
  const mer = m[3]?.toUpperCase();
  if (mer === "PM" && h < 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return `${h.toString().padStart(2, "0")}:${min}`;
}

const VALID_DAYS = new Set<MeetingDay>(["M", "T", "W", "R", "F", "S", "U"]);

/**
 * "MWF" / "TR" / "Th" / "TH" / "Sa" / "M W F" -> distinct MeetingDay codes.
 * "Th"/"TH" and a lone "R" both mean Thursday; "Tu"/"T" mean Tuesday;
 * "Sa"/"S" mean Saturday; "Su"/"U" mean Sunday. Multi-char tokens are
 * consumed first so "Th" never gets misread as Tuesday + Thursday.
 */
export function parseDays(raw: string): MeetingDay[] {
  const norm = raw
    .replace(/Th/gi, "R")
    .replace(/Tu/gi, "T")
    .replace(/Sa/gi, "S")
    .replace(/Su/gi, "U")
    .toUpperCase();
  const out: MeetingDay[] = [];
  const seen = new Set<string>();
  for (const ch of norm) {
    if (VALID_DAYS.has(ch as MeetingDay) && !seen.has(ch)) {
      seen.add(ch);
      out.push(ch as MeetingDay);
    }
  }
  return out;
}
