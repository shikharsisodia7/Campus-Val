/**
 * Writes the synthetic APR workbooks to a directory for browser QA / E2E:
 *   pnpm --filter @workspace/api-server exec tsx src/__fixtures__/apr/write-fixtures.ts <dir>
 * The files contain invented data only (see build-workbooks.ts).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildAprFixture, type AprFixtureName } from "./build-workbooks";
import { buildAprPdf } from "./build-pdf";

const NAMES: AprFixtureName[] = [
  "finance-major",
  "computer-science-major",
  "data-science-minor",
  "two-row-header",
  "workday-combined",
  "unrecognized-layout",
  "two-sheets",
  "hostile-content",
];

const outDir = resolve(process.argv[2] ?? "apr-fixtures");
await mkdir(outDir, { recursive: true });
for (const name of NAMES) {
  await writeFile(join(outDir, `synthetic-apr-${name}.xlsx`), await buildAprFixture(name));
}
await writeFile(join(outDir, "synthetic-apr-workday-combined.pdf"), buildAprPdf({ fuseFirstStatus: true }));
console.log(`Wrote ${NAMES.length} synthetic APR workbooks and 1 PDF to ${outDir}`);
