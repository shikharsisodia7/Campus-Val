/**
 * Writes the synthetic Degree Checksheet documents to a directory for browser QA / E2E:
 *   pnpm --filter @workspace/api-server exec tsx src/__fixtures__/checksheets/write-fixtures.ts <dir>
 * The files contain invented data only (see build-fixtures.ts).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildChecksheetFixture, CHECKSHEET_FIXTURE_FILES, type ChecksheetFixtureName } from "./build-fixtures";

const outDir = resolve(process.argv[2] ?? "checksheet-fixtures");
await mkdir(outDir, { recursive: true });
const names = Object.keys(CHECKSHEET_FIXTURE_FILES) as ChecksheetFixtureName[];
for (const name of names) {
  await writeFile(join(outDir, CHECKSHEET_FIXTURE_FILES[name].fileName), await buildChecksheetFixture(name));
}
console.log(`Wrote ${names.length} synthetic Degree Checksheet documents to ${outDir}`);
