/**
 * Imports Department Note candidates from department Requirements Checklists.
 *
 *   pnpm --filter @workspace/api-server run import:department-notes -- --dir <folder of .xlsx>
 *        [--apply] [--actor <email>] [--out <report.json>]
 *
 * Dry run unless --apply. Reads only an offline package of canonical files;
 * every file must already have one active row in department_canonical_resources
 * with its program, school, public source URL, document version, provenance,
 * review and publication status recorded. It never reads degree-checksheet
 * uploads or their object store.
 *
 * Deterministic anchors become published notes (flagged "imported, not yet
 * reviewed" to students); anchored notes that say nothing in words become
 * drafts; everything else lands in the unmapped queue. Re-running is safe: a
 * note is keyed by its file and cell and is never duplicated. A file whose
 * cells a legacy import (before this registry) already turned into notes is not
 * applied until those notes are archived, so students never see a note twice.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db, departmentCanonicalResourcesTable, departmentRequirementNotesTable, pool } from "@workspace/db";
// The checksheet reader also copes with a department named "History" (a sheet name Excel reserves).
import { readModernWorkbook } from "../src/lib/checksheets/render.ts";
import { canonicalResourceBlocker, selectCanonicalResourceForFile } from "../src/lib/department/canonical-resources.ts";
import { extractChecklistNotes, type NoteCandidate } from "../src/lib/department/checklist-notes.ts";
import { findProgram, programTree } from "../src/lib/department/programs.ts";
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
// The registry is the trust boundary: a directory is merely an offline copy of
// those specific documents.  Keep archived versions in the audit trail, but do
// not let them compete with the current package file.
const resourceRows = await db.select().from(departmentCanonicalResourcesTable);
// Notes from before the registry, still live or waiting for review: the same cells must not be imported again.
const legacyNotes = await db
  .select({ id: departmentRequirementNotesTable.id, programKey: departmentRequirementNotesTable.programKey, sourceReference: departmentRequirementNotesTable.sourceReference })
  .from(departmentRequirementNotesTable)
  .where(and(isNull(departmentRequirementNotesTable.canonicalResourceId), ne(departmentRequirementNotesTable.status, "archived")));

const report = {
  edition,
  files: [] as unknown[],
  totals: { published: 0, draft: 0, unmapped: 0, skippedFiles: 0, blockedResources: 0, written: 0 },
};

for (const file of readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xlsx")).sort()) {
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
  const selection = selectCanonicalResourceForFile(resourceRows, file);
  if (!sheet || !selection.resource) {
    report.files.push({
      file,
      skipped: !sheet ? "no visible worksheet" : selection.error!,
    });
    report.totals.skippedFiles += 1;
    continue;
  }
  const resource = selection.resource;
  const program = findProgram(resource.programKey);
  if (!program || program.type !== resource.programType || program.college !== resource.school) {
    report.files.push({ file, skipped: "canonical resource program or school no longer matches CampusVal" });
    report.totals.skippedFiles += 1;
    continue;
  }
  const blocked = canonicalResourceBlocker(resource);
  if (blocked) {
    report.files.push({ file, program: resource.programKey, resourceId: resource.id, skipped: `canonical resource blocked: ${blocked}` });
    report.totals.skippedFiles += 1;
    report.totals.blockedResources += 1;
    continue;
  }
  const tree = programTree(program.programKey)!;
  const programGroup = tree.tree.find((g) => g.stableKey === program.programKey)!;
  // The registry's program association was reviewed by an administrator. This
  // permits published names that differ from CampusVal's display title and
  // works for CAS, LSB, SOE, majors, and minors without a hard-coded alias
  // list. The extractor still anchors only exact course/core matches.
  const candidates: NoteCandidate[] = extractChecklistNotes(sheet, program.title, programGroup, tree.tree, { everyTableIsProgram: true });
  const refs = new Set(candidates.map((c) => c.sourceReference));
  const legacyDuplicates = legacyNotes.filter((n) => n.programKey === program.programKey && n.sourceReference && refs.has(n.sourceReference)).map((n) => n.id);
  const counts = { published: 0, draft: 0, unmapped: 0 };
  for (const c of candidates) counts[c.status] += 1;
  report.totals.published += counts.published;
  report.totals.draft += counts.draft;
  report.totals.unmapped += counts.unmapped;
  report.files.push({
    file,
    program: program.programKey,
    school: resource.school,
    resourceId: resource.id,
    sourceUrl: resource.sourceUrl,
    academicYear: resource.academicYear,
    documentVersion: resource.documentVersion,
    ...counts,
    legacyDuplicates,
    candidates: candidates.map((c) => ({ at: c.sourceReference, status: c.status, target: c.targetKey, body: c.body, why: c.reason })),
    unmappedRows: candidates.filter((c) => c.status === "unmapped").map((c) => ({ at: c.sourceReference, label: c.rowLabel, why: c.reason })),
  });

  if (!apply) continue;
  if (legacyDuplicates.length > 0) {
    (report.files.at(-1) as Record<string, unknown>).skipped =
      `${legacyDuplicates.length} of its cells are already legacy notes (ids ${legacyDuplicates.join(", ")}); archive those first so students never see a note twice`;
    report.totals.skippedFiles += 1;
    continue;
  }
  for (const c of candidates) {
    const importKey = `canonical:${resource.id}:${c.sourceReference}`;
    const values = {
      programKey: program.programKey,
      programType: resource.programType,
      targetKey: c.targetKey,
      bulletinEdition: edition,
      body: c.body,
      noteKind: c.kind,
      status: c.status,
      origin: "imported",
      sourceType: "canonical_resource",
      canonicalResourceId: resource.id,
      sourceLabel: resource.documentTitle,
      sourceUrl: resource.sourceUrl,
      sourceAcademicYear: resource.academicYear,
      sourceDocumentVersion: resource.documentVersion,
      provenanceStatus: resource.provenanceStatus,
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
