/**
 * The requirements audit (see src/lib/requirements-source/audit.ts).
 *
 *   pnpm run audit:requirements                 summary + findings to the console
 *   pnpm run audit:requirements --out <dir>     also write JSON and CSV files there
 *   pnpm run audit:requirements --all           list every finding (default hides "info")
 *   pnpm run audit:requirements --strict        exit 1 on any data_integrity ERROR
 *
 * Reports only. Nothing here changes academic content. Runs on synthetic
 * profiles, so no student data is read or written.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { auditFindingsToCsv, auditRequirements, auditRowsToCsv } from "../src/lib/requirements-source/audit.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : undefined;

const report = auditRequirements();
const { counts } = report;

console.log("CampusVal requirements audit");
console.log(`  source in use        ${report.provider}`);
console.log(`  majors audited       ${counts.majors}`);
console.log(`  minors audited       ${counts.minors}`);
console.log(`  school/core groups   ${counts.collegeGroups}`);
console.log(`  groups               ${counts.groups}`);
console.log(`  requirements         ${counts.requirements}`);
console.log(`  findings             ${counts.findings}  (errors ${counts.bySeverity.error}, warnings ${counts.bySeverity.warning}, info ${counts.bySeverity.info})`);
console.log(`    data_integrity     ${counts.byCategory.data_integrity}`);
console.log(`    missing_provenance ${counts.byCategory.missing_provenance}`);
console.log(`    academic_content   ${counts.byCategory.academic_content}`);
console.log(`  groups missing provenance ${counts.missingProvenanceGroups}`);

const shown = report.findings.filter((f) => flag("--all") || f.severity !== "info");
const byCode = new Map<string, number>();
for (const f of report.findings) byCode.set(`${f.category}/${f.code}`, (byCode.get(`${f.category}/${f.code}`) ?? 0) + 1);
console.log("\nBy kind of finding:");
for (const [key, n] of [...byCode].sort()) console.log(`  ${String(n).padStart(5)}  ${key}`);

if (shown.length > 0) console.log("\nFindings:");
for (const f of shown) {
  console.log(`  [${f.severity}] ${f.category}/${f.code} — ${f.program} › ${f.requirement ?? f.group}: ${f.message}`);
}
if (!flag("--all") && report.findings.length > shown.length) console.log(`\n(${report.findings.length - shown.length} info-level findings hidden; pass --all to list them)`);

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "requirements-audit.json"), JSON.stringify({ ...report, rows: undefined }, null, 2));
  writeFileSync(path.join(outDir, "requirements-audit-findings.csv"), auditFindingsToCsv(report.findings));
  writeFileSync(path.join(outDir, "requirements-audit-requirements.csv"), auditRowsToCsv(report.rows));
  console.log(`\nWrote requirements-audit.json, requirements-audit-findings.csv and requirements-audit-requirements.csv to ${outDir}`);
}

if (flag("--strict") && counts.bySeverity.error > 0) process.exit(1);
