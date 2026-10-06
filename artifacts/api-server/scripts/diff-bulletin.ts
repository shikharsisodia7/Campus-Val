/**
 * Compares the requirements of two Bulletin editions (developer tool).
 *
 *   pnpm run diff:bulletin -- --from 2025-26 --to 2026-27 [--json]
 *
 * Reads data/bulletin-snapshots/<edition>.json. Reports added, removed and
 * changed requirements, changed course lists and changed unit text. It is a
 * proofreading aid for CampusVal maintainers, not student-facing academic policy.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { diffSnapshots, isEmptyDiff, type BulletinSnapshot } from "../src/lib/requirements-source/snapshot.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const from = arg("--from");
const to = arg("--to");
if (!from || !to) {
  console.error("usage: diff:bulletin -- --from <edition> --to <edition> [--json]");
  process.exit(2);
}
const load = (edition: string): BulletinSnapshot => {
  const file = path.join(import.meta.dirname, "..", "data", "bulletin-snapshots", `${edition}.json`);
  if (!existsSync(file)) {
    console.error(`No snapshot for ${edition} (${file}). Only editions that were imported and snapshotted can be compared.`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(file, "utf8")) as BulletinSnapshot;
};
const diff = diffSnapshots(load(from), load(to));
if (args.includes("--json")) {
  console.log(JSON.stringify(diff, null, 2));
} else if (isEmptyDiff(diff)) {
  console.log(`${from} -> ${to}: no differences`);
} else {
  console.log(`${from} -> ${to}`);
  console.log(`  programs added ${diff.programsAdded.length}, removed ${diff.programsRemoved.length}`);
  console.log(`  requirements added ${diff.requirementsAdded.length}, removed ${diff.requirementsRemoved.length}, changed ${diff.requirementsChanged.length}`);
  for (const r of diff.requirementsAdded) console.log(`  + ${r.group} > ${r.label}`);
  for (const r of diff.requirementsRemoved) console.log(`  - ${r.group} > ${r.label}`);
  for (const c of diff.requirementsChanged) {
    console.log(`  ~ ${c.group} > ${c.after.label} [${c.fields.join(", ")}]`);
    if (c.coursesAdded.length) console.log(`      courses added: ${c.coursesAdded.join(", ")}`);
    if (c.coursesRemoved.length) console.log(`      courses removed: ${c.coursesRemoved.join(", ")}`);
  }
  if (diff.unitTextChanged.length) console.log(`  unit text changed in ${diff.unitTextChanged.length} requirement(s)`);
}
