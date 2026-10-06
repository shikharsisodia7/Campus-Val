/**
 * Imports Department Note candidates from department Requirements Checklists.
 *
 *   pnpm --filter @workspace/api-server run import:department-notes -- --dir <folder of .xlsx>
 *        [--apply] [--actor <email>] [--out <report.json>]
 *
 * Dry run unless --apply. Reads only the files in --dir (published department
 * checklists, never a student's upload). Each file is matched to a CampusVal
 * program by the exact title in its "<Program> Major Requirements" table; a
 * file that does not match exactly one program is reported and skipped.
 *
 * Deterministic anchors become published notes (flagged "imported, not yet
 * reviewed" to students); anchored notes that say nothing in words become
 * drafts; everything else lands in the unmapped queue. Re-running is safe: a
 * note is keyed by its file and cell and is never duplicated.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, departmentRequirementNotesTable, pool } from "@workspace/db";
// The checksheet reader also copes with a department named "History" (a sheet name Excel reserves).
import { readModernWorkbook } from "../src/lib/checksheets/render.ts";
import { extractChecklistNotes, type NoteCandidate } from "../src/lib/department/checklist-notes.ts";
import { listPrograms, programTree } from "../src/lib/department/programs.ts";
import { latestBulletinEdition } from "../src/lib/requirements-source/editions.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = arg("--dir");
if (!dir) {
  console.error("Pass --dir <folder containing the checklist .xlsx files>");
  process.exit(2);
}
const apply = args.includes("--apply");
const actor = (arg("--actor") ?? "importer@campusval.local").toLowerCase();
const edition = latestBulletinEdition().id;
const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\b(b\.?[as]\.?|bachelor of (arts|science))\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Files whose own title does not equal a CampusVal program title, matched by name with the evidence for each.
// A name is only listed when it is the same program: the department renamed it, or only the punctuation differs.
const FILE_ALIASES: { file: RegExp; programKey: string; why: string }[] = [
  { file: /^Studio Art Checklist/i, programKey: "major:studio-art", why: 'the checklist says "Studio Arts"; the program is Studio Art' },
  { file: /^French and Francophone Studies Checklist/i, programKey: "major:french-francophone-studies", why: '"and" and "&" only' },
  { file: /^Gender and Sexuality Studies Checklist/i, programKey: "major:women-s-gender-studies", why: "SCU Bulletin 2026-27: Gender and Sexuality Studies, formerly Women's and Gender Studies" },
  { file: /^BA in Chemistry Checklist/i, programKey: "major:chemistry-b-a", why: "BA in Chemistry is the Chemistry (B.A.) major" },
  { file: /^Public Health - Health Science Checklist/i, programKey: "major:public-health-science", why: "the Health Science emphasis of the Public Health Science major" },
];

const majors = listPrograms().filter((p) => p.type === "major" && p.college === "CAS");
const report = { edition, files: [] as unknown[], totals: { published: 0, draft: 0, unmapped: 0, skippedFiles: 0, written: 0 } };

for (const file of readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xlsx")).sort()) {
  const label = file.replace(/\.xlsx$/i, "");
  // An older curriculum's checklist is not the current Bulletin's: never imported onto the current program.
  if (/\bprior to\b/i.test(file)) {
    report.files.push({ file, skipped: "checklist for an earlier curriculum (\"Prior to ...\")" });
    report.totals.skippedFiles += 1;
    continue;
  }
  let workbook;
  try {
    workbook = await readModernWorkbook(readFileSync(path.join(dir, file)));
  } catch (error) {
    report.files.push({ file, skipped: `unreadable: ${(error as Error).message}` });
    report.totals.skippedFiles += 1;
    continue;
  }
  const sheet = workbook.sheets.find((s) => s.visibility === "visible" && s.rows.length > 0);
  // The program is named by the table that holds the major's courses: "<Program> Major Requirements".
  const titleCell = sheet?.rows.flatMap((r) => r.cells.filter((c) => c.c === 0)).map((c) => c.text.trim()).find((t) => /\bMajor Requirements$/i.test(t));
  const named = titleCell?.replace(/\s*Major Requirements$/i, "");
  const alias = FILE_ALIASES.find((a) => a.file.test(file));
  const match = alias ? listPrograms().filter((m) => m.programKey === alias.programKey) : named ? majors.filter((m) => norm(m.title) === norm(named)) : [];
  if (!sheet || match.length !== 1) {
    report.files.push({ file, skipped: named ? `"${named}" matches ${match.length} CampusVal majors` : "no \"<Program> Major Requirements\" table" });
    report.totals.skippedFiles += 1;
    continue;
  }
  const program = match[0]!;
  const tree = programTree(program.programKey)!;
  const programGroup = tree.tree.find((g) => g.stableKey === program.programKey)!;
  const candidates: NoteCandidate[] = extractChecklistNotes(sheet, program.title, programGroup, tree.tree, { everyTableIsProgram: !!alias });
  const counts = { published: 0, draft: 0, unmapped: 0 };
  for (const c of candidates) counts[c.status] += 1;
  report.totals.published += counts.published;
  report.totals.draft += counts.draft;
  report.totals.unmapped += counts.unmapped;
  report.files.push({ file, program: program.programKey, ...counts, candidates: candidates.map((c) => ({ at: c.sourceReference, status: c.status, target: c.targetKey, body: c.body, why: c.reason })), unmappedRows: candidates.filter((c) => c.status === "unmapped").map((c) => ({ at: c.sourceReference, label: c.rowLabel, why: c.reason })) });

  if (!apply) continue;
  for (const c of candidates) {
    const importKey = `${label}|${c.sourceReference}`;
    const values = {
      programKey: program.programKey,
      programType: "major",
      targetKey: c.targetKey,
      bulletinEdition: edition,
      body: c.body,
      noteKind: c.kind,
      status: c.status,
      origin: "imported",
      sourceType: "checklist",
      sourceLabel: `${program.title} Requirements Checklist (College of Arts and Sciences)`,
      sourceReference: c.sourceReference,
      sourceAnchorText: c.rowLabel,
      importKey,
      updatedBy: actor,
    };
    // A note a person has since edited, reviewed or archived is never overwritten by a re-import.
    const [existing] = await db.select().from(departmentRequirementNotesTable).where(eq(departmentRequirementNotesTable.importKey, importKey)).limit(1);
    if (existing) continue;
    await db.insert(departmentRequirementNotesTable).values({ ...values, createdBy: actor });
    report.totals.written += 1;
  }
}

console.log(JSON.stringify(report.totals), apply ? "(applied)" : "(dry run — pass --apply to write)");
for (const f of report.files as any[]) console.log(f.skipped ? `  skip  ${f.file}: ${f.skipped}` : `  ${f.program}: ${f.published} published, ${f.draft} draft, ${f.unmapped} unmapped`);
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
await pool.end();
