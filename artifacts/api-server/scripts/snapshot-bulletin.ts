/**
 * Writes (or checks) the normalized Bulletin snapshot of an edition.
 *
 *   pnpm run snapshot:bulletin                    write data/bulletin-snapshots/<latest>.json
 *   pnpm run snapshot:bulletin -- --check         exit 1 if the committed file is not what the data produces
 *   pnpm run snapshot:bulletin -- --edition 2026-27
 *
 * Only the LATEST edition's snapshot may be rewritten (its data is still being
 * proofread). An older edition's file is history and is never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { latestBulletinEdition } from "../src/lib/requirements-source/editions.ts";
import { buildBulletinSnapshot, serializeSnapshot } from "../src/lib/requirements-source/snapshot.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const edition = arg("--edition") ?? latestBulletinEdition().id;
const dir = path.join(import.meta.dirname, "..", "data", "bulletin-snapshots");
const file = path.join(dir, `${edition}.json`);
const text = serializeSnapshot(buildBulletinSnapshot(edition));

if (args.includes("--check")) {
  const same = existsSync(file) && readFileSync(file, "utf8").replace(/\r\n/g, "\n") === text;
  console.log(same ? `${edition}: snapshot is current` : `${edition}: snapshot is missing or stale; run pnpm run snapshot:bulletin`);
  process.exit(same ? 0 : 1);
}
if (existsSync(file) && edition !== latestBulletinEdition().id) {
  console.error(`${edition} is not the latest edition; its snapshot is history and is not overwritten.`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(file, text);
console.log(`wrote ${path.relative(process.cwd(), file)} (${(text.length / 1024).toFixed(0)} KB)`);
