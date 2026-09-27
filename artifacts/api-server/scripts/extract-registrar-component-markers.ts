/**
 * Reads the SCU Registrar schedule workbooks and records which courses the
 * REGISTRAR ITSELF labels as lecture-and-lab: a schedule title ending in
 * "L&L" ("General Chemistry I  L&L", "Information and Evolution L&L").
 *
 * This is the strongest component evidence SCU publishes. The schedules carry
 * no per-section component column, so which individual section is the lab is
 * still derived from the meeting pattern (see src/lib/course-components.ts) —
 * but WHETHER a course has a lab no longer depends on how the bulletin happens
 * to phrase its description.
 *
 * Usage:
 *   tsx scripts/extract-registrar-component-markers.ts <schedule.xlsx> [<schedule.xlsx> …] [--apply]
 *
 * Output: src/data/registrar-component-markers.json, sorted, so re-running on
 * the same sources is a no-op. Without --apply it only prints what it found.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ExcelJS from "exceljs";
import { cellDisplayText } from "../src/lib/apr/cell-text.ts";

export interface RegistrarComponentMarker {
  courseCode: string;
  /** The Registrar's title, as printed. */
  title: string;
  components: ("lecture" | "lab")[];
  /** The marker text found in the title. */
  marker: string;
}

const LAB_MARKER_RE = /\bL\s?&\s?L\s*$/i;

const cellText = (v: ExcelJS.CellValue): string => cellDisplayText({ value: v }).text;

async function read(filePath: string): Promise<RegistrarComponentMarker[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(filePath) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: RegistrarComponentMarker[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return; // header: Subject | Cat Nbr | Title | …
    const subject = cellText(row.getCell(1).value).trim().toUpperCase();
    const number = cellText(row.getCell(2).value).trim().toUpperCase();
    const title = cellText(row.getCell(3).value).replace(/\s+/g, " ").trim();
    const hit = LAB_MARKER_RE.exec(title);
    if (!subject || !number || !hit) return;
    out.push({ courseCode: `${subject} ${number}`, title, components: ["lecture", "lab"], marker: "L&L" });
  });
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const files = args.filter((a) => a !== "--apply");
  if (files.length === 0) {
    console.error("Usage: tsx scripts/extract-registrar-component-markers.ts <schedule.xlsx> … [--apply]");
    process.exit(1);
  }

  const dataPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "src",
    "data",
    "registrar-component-markers.json",
  );
  const byCode = new Map<string, RegistrarComponentMarker>();
  for (const file of files) {
    for (const marker of await read(file)) if (!byCode.has(marker.courseCode)) byCode.set(marker.courseCode, marker);
  }
  const markers = [...byCode.values()].sort((a, b) => a.courseCode.localeCompare(b.courseCode, "en", { numeric: true }));

  console.log(`${markers.length} course(s) carry the Registrar's L&L marker across ${files.length} schedule file(s).`);
  for (const m of markers) console.log(`  ${m.courseCode.padEnd(10)} ${m.title}`);
  if (!apply) {
    console.log("\nDry run only — pass --apply to write registrar-component-markers.json");
    return;
  }
  writeFileSync(dataPath, `${JSON.stringify(markers, null, 2)}\n`);
  console.log(`\nWrote ${dataPath}`);
}

void main();
