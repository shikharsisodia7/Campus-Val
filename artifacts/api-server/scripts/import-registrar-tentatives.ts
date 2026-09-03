/**
 * Deterministic importer for SCU Registrar TENTATIVE schedule spreadsheets
 * (professor-supplied Excel conversions of the Registrar's tentative-schedule
 * PDFs). Regenerates the winter/spring 2027 rows of
 * src/data/offered-sections.json from the source workbooks — every other
 * term/year in that file (e.g. the Fall 2026 published schedule) is left
 * untouched.
 *
 * Usage:
 *   tsx scripts/import-registrar-tentatives.ts \
 *     --winter <path-to-Winter-2027-Tentatives.xlsx> \
 *     --spring <path-to-Spring-2027-Tentatives.xlsx> \
 *     [--apply]
 *
 * Without --apply this is a dry run: it parses, validates, and prints the
 * report below without touching offered-sections.json. Pass --apply to
 * write the result.
 *
 * Source columns (row 1 header, data from row 2):
 *   Subject | Cat Nbr | Title | Topic | Days | Start time | End time
 *
 * The source spreadsheets do NOT contain instructor, room/location, or an
 * official section number — this importer never invents them. Rows are
 * deduplicated only when they are IDENTICAL across
 * (courseCode, topic, days, startTime, endTime); the deduplicated rows are
 * then given sequential, deterministic sectionNumbers per course — never
 * displayed to students as an "official section", see
 * QuickAddSearch.tsx's `sec.tentative` branch.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as XLSX from "xlsx";
import { normalizeTime, parseDays, type MeetingDay } from "../src/lib/schedule-text.ts";

interface SourceRow {
  subject: unknown;
  catNbr: unknown;
  title: unknown;
  topic: unknown;
  days: unknown;
  startTime: unknown;
  endTime: unknown;
}

interface NormalizedOffering {
  courseCode: string;
  sectionNumber: string;
  term: "winter" | "spring";
  year: number;
  instructor: string;
  meetingDays: MeetingDay[];
  startTime: string;
  endTime: string;
  location: string;
  seatsTotal: number;
  seatsOpen: number;
  waitlist: number;
}

interface RejectedRow {
  row: number;
  reason: string;
  raw: SourceRow;
}

/** "36" / 36 -> "36"; "1a" -> "1A"; "TBA" -> "TBA". Never truncates a suffix. */
function normalizeCatalogNumber(raw: unknown): string {
  return String(raw).trim().toUpperCase();
}

function normalizeSubject(raw: unknown): string {
  return String(raw).trim().toUpperCase();
}

function readWorkbook(filePath: string): SourceRow[] {
  const buf = readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0]!;
  const sheet = wb.Sheets[sheetName]!;
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const [, ...dataRows] = rows;
  return dataRows
    .filter((r) => r.some((cell) => cell !== null && cell !== ""))
    .map((r) => ({
      subject: r[0],
      catNbr: r[1],
      title: r[2],
      topic: r[3],
      days: r[4],
      startTime: r[5],
      endTime: r[6],
    }));
}

interface ImportReport {
  term: "winter" | "spring";
  rawRows: number;
  validRows: number;
  invalidRows: RejectedRow[];
  tbaMeetingRows: number;
  exactDuplicatesCollapsed: number;
  finalOfferings: number;
}

function importTerm(
  filePath: string,
  term: "winter" | "spring",
  year: number,
): { offerings: NormalizedOffering[]; report: ImportReport } {
  const rawRows = readWorkbook(filePath);
  const invalidRows: RejectedRow[] = [];
  let tbaMeetingRows = 0;

  type MeetingKey = string;
  interface Candidate {
    courseCode: string;
    topic: string;
    meetingDays: MeetingDay[];
    startTime: string;
    endTime: string;
    isTba: boolean;
    sortKey: string;
  }
  const seen = new Map<MeetingKey, Candidate>();
  let duplicatesCollapsed = 0;

  rawRows.forEach((r, idx) => {
    const rowNum = idx + 2; // +1 header, +1 to 1-index
    const subject = normalizeSubject(r.subject);
    const catNbr = normalizeCatalogNumber(r.catNbr);
    const title = typeof r.title === "string" ? r.title.trim() : "";

    if (!subject) {
      invalidRows.push({ row: rowNum, reason: "missing Subject", raw: r });
      return;
    }
    if (!catNbr) {
      invalidRows.push({ row: rowNum, reason: "missing Cat Nbr", raw: r });
      return;
    }
    if (!title) {
      invalidRows.push({ row: rowNum, reason: "missing Title", raw: r });
      return;
    }

    const daysRaw = r.days === null ? "" : String(r.days).trim();
    const startRaw = r.startTime === null ? "" : String(r.startTime).trim();
    const endRaw = r.endTime === null ? "" : String(r.endTime).trim();

    const daysIsTba = daysRaw.toUpperCase() === "TBA";
    const startIsTba = startRaw.toUpperCase() === "TBA" || startRaw === "";
    const endIsTba = endRaw.toUpperCase() === "TBA" || endRaw === "";
    const isTba = daysIsTba || startIsTba || endIsTba;

    const meetingDays = daysIsTba || !daysRaw ? [] : parseDays(daysRaw);
    if (!daysIsTba && daysRaw && meetingDays.length === 0) {
      invalidRows.push({
        row: rowNum,
        reason: `unrecognized Days value "${daysRaw}"`,
        raw: r,
      });
      return;
    }
    const startTime = startIsTba ? "" : normalizeTime(startRaw);
    const endTime = endIsTba ? "" : normalizeTime(endRaw);

    if (isTba) tbaMeetingRows++;

    const courseCode = `${subject} ${catNbr}`;
    const topic = typeof r.topic === "string" ? r.topic.trim() : "";

    // Exact-duplicate key: source has no section numbers, so identical rows
    // are truthfully indistinguishable and collapse into one meeting option.
    const dedupeKey = [
      courseCode,
      topic,
      meetingDays.join(""),
      startTime,
      endTime,
    ].join("|");

    if (seen.has(dedupeKey)) {
      duplicatesCollapsed++;
      return;
    }
    seen.set(dedupeKey, {
      courseCode,
      topic,
      meetingDays,
      startTime,
      endTime,
      isTba,
      sortKey: `${topic}|${meetingDays.join("")}|${startTime}|${endTime}`,
    });
  });

  // Group by courseCode, assign deterministic sequential sectionNumbers in a
  // stable sort order so re-running the import on the same source is
  // idempotent.
  const byCourse = new Map<string, Candidate[]>();
  for (const c of seen.values()) {
    const list = byCourse.get(c.courseCode) ?? [];
    list.push(c);
    byCourse.set(c.courseCode, list);
  }

  const offerings: NormalizedOffering[] = [];
  for (const [courseCode, candidates] of byCourse) {
    candidates.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    candidates.forEach((c, i) => {
      offerings.push({
        courseCode,
        sectionNumber: String(i + 1),
        term,
        year,
        instructor: "TBA",
        meetingDays: c.meetingDays,
        startTime: c.startTime,
        endTime: c.endTime,
        location: "",
        seatsTotal: 0,
        seatsOpen: 0,
        waitlist: 0,
      });
    });
  }

  return {
    offerings,
    report: {
      term,
      rawRows: rawRows.length,
      validRows: rawRows.length - invalidRows.length,
      invalidRows,
      tbaMeetingRows,
      exactDuplicatesCollapsed: duplicatesCollapsed,
      finalOfferings: offerings.length,
    },
  };
}

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--winter") out.winter = argv[++i]!;
    else if (a === "--spring") out.spring = argv[++i]!;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.winter || !args.spring) {
    console.error(
      "Usage: tsx scripts/import-registrar-tentatives.ts --winter <path> --spring <path> [--apply]",
    );
    process.exit(1);
  }

  const winter = importTerm(args.winter as string, "winter", 2027);
  const spring = importTerm(args.spring as string, "spring", 2027);

  for (const { report } of [winter, spring]) {
    console.log(`\n=== ${report.term.toUpperCase()} 2027 ===`);
    console.log(`raw rows:                 ${report.rawRows}`);
    console.log(`valid rows:                ${report.validRows}`);
    console.log(`invalid rows:              ${report.invalidRows.length}`);
    console.log(`TBA meeting rows:          ${report.tbaMeetingRows}`);
    console.log(`exact duplicates collapsed:${report.exactDuplicatesCollapsed}`);
    console.log(`final normalized offerings:${report.finalOfferings}`);
    if (report.invalidRows.length > 0) {
      console.log("invalid row detail:");
      for (const inv of report.invalidRows) {
        console.log(`  row ${inv.row}: ${inv.reason} — ${JSON.stringify(inv.raw)}`);
      }
    }
  }

  if (!args.apply) {
    console.log("\nDry run only — pass --apply to write offered-sections.json");
    return;
  }

  const dataPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "data",
    "offered-sections.json",
  );
  const existing: NormalizedOffering[] = JSON.parse(
    readFileSync(dataPath, "utf-8"),
  );
  const kept = existing.filter(
    (o) => !((o.term === "winter" || o.term === "spring") && o.year === 2027),
  );
  const merged = [...kept, ...winter.offerings, ...spring.offerings];
  writeFileSync(dataPath, JSON.stringify(merged));
  console.log(
    `\nWrote ${merged.length} total offerings to ${dataPath} (${kept.length} preserved from other terms, ${winter.offerings.length} winter 2027, ${spring.offerings.length} spring 2027).`,
  );
}

main();
