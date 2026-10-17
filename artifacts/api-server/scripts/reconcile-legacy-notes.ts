/**
 * Re-applies the current deterministic checklist extractor to notes a LEGACY
 * import (before the canonical-resource registry) made from the same file.
 *
 *   pnpm --filter @workspace/api-server run reconcile:legacy-notes -- --file <checklist.xlsx>
 *        --program <program key> --legacy-source "<document title the legacy import used>"
 *        [--apply] [--actor <email>] [--out <report.json>]
 *
 * Dry run unless --apply. A legacy note is matched by its import key
 * ("<document title>|<Sheet!Cell>") and changed only when the importer still
 * owns it and the cell still says the same thing (see legacy-reconcile.ts).
 * Status, anchor and kind follow the extractor; the text is never rewritten and
 * no reviewer is recorded, so students keep seeing "imported, not yet reviewed".
 * Every change is written to the department audit log.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db, departmentRequirementNotesTable, pool } from "@workspace/db";
import { readModernWorkbook } from "../src/lib/checksheets/render.ts";
import { extractChecklistNotes } from "../src/lib/department/checklist-notes.ts";
import { reconcileLegacyNote } from "../src/lib/department/legacy-reconcile.ts";
import { findProgram, programTree } from "../src/lib/department/programs.ts";
import { reconcileLegacyImportedNote } from "../src/lib/department/service.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const file = arg("--file");
const programKey = arg("--program");
const legacySource = arg("--legacy-source");
if (!file || !programKey || !legacySource) {
  console.error('Pass --file <checklist.xlsx> --program <program key> --legacy-source "<document title>"');
  process.exit(2);
}
const apply = args.includes("--apply");
const actor = { email: (arg("--actor") ?? "importer@campusval.local").toLowerCase(), userId: "script:reconcile-legacy-notes" };

const program = findProgram(programKey);
if (!program) {
  console.error(`No program ${programKey}.`);
  process.exit(2);
}
const workbook = await readModernWorkbook(readFileSync(file));
const sheet = workbook.sheets.find((s) => s.visibility === "visible" && s.rows.length > 0);
if (!sheet) {
  console.error(`${path.basename(file)} has no visible worksheet.`);
  process.exit(2);
}
const tree = programTree(program.programKey)!;
const programGroup = tree.tree.find((g) => g.stableKey === program.programKey)!;
const candidates = extractChecklistNotes(sheet, program.title, programGroup, tree.tree, { everyTableIsProgram: true });

const rows = await db
  .select()
  .from(departmentRequirementNotesTable)
  .where(and(eq(departmentRequirementNotesTable.programKey, program.programKey), isNull(departmentRequirementNotesTable.canonicalResourceId)));
const byImportKey = new Map(rows.filter((r) => r.importKey).map((r) => [r.importKey!, r]));

const report = { file: path.basename(file), program: program.programKey, legacySource, apply, changes: [] as unknown[], skipped: [] as unknown[], unchanged: 0, notImported: 0 };
for (const c of candidates) {
  const row = byImportKey.get(`${legacySource}|${c.sourceReference}`);
  if (!row) {
    report.notImported += 1;
    continue;
  }
  const decision = reconcileLegacyNote(row, c);
  if (decision.action === "unchanged") {
    report.unchanged += 1;
    continue;
  }
  if (decision.action === "skip") {
    report.skipped.push({ id: row.id, at: c.sourceReference, why: decision.why });
    continue;
  }
  const before = { status: row.status, targetKey: row.targetKey, kind: row.noteKind };
  const after = { status: decision.next.status, targetKey: decision.next.targetKey, kind: decision.next.noteKind };
  report.changes.push({ id: row.id, at: c.sourceReference, label: c.rowLabel, body: c.body, before, after, why: c.reason });
  if (!apply) continue;
  // Someone changed it since it was read: theirs now, left alone.
  if (!(await reconcileLegacyImportedNote(actor, row, decision.next))) {
    report.skipped.push({ id: row.id, at: c.sourceReference, why: "changed by a person while this ran" });
  }
}

console.log(`${report.program}: ${report.changes.length} to change, ${report.unchanged} unchanged, ${report.skipped.length} skipped, ${report.notImported} cells with no legacy note`, apply ? "(applied)" : "(dry run — pass --apply to write)");
for (const ch of report.changes as any[]) console.log(`  #${ch.id} ${ch.at} ${ch.before.status}${ch.before.targetKey ? ` @${ch.before.targetKey}` : ""} -> ${ch.after.status}${ch.after.targetKey ? ` @${ch.after.targetKey}` : ""}`);
for (const s of report.skipped as any[]) console.log(`  skip #${s.id} ${s.at}: ${s.why}`);
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
await pool.end();
