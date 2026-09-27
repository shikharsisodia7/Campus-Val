/**
 * Prints the course-component data-quality audit (see
 * src/lib/component-data-audit.ts) for the bundled Registrar schedule data.
 *
 *   pnpm --filter @workspace/api-server run audit-components
 *
 * Warnings only: nothing here changes how a section is classified.
 */
import { auditCourseComponents, summarizeAudit } from "../src/lib/component-data-audit.ts";

const findings = auditCourseComponents();
console.log("Course component data-quality audit");
console.log(JSON.stringify(summarizeAudit(findings), null, 2));
const verbose = process.argv.includes("--all");
for (const f of findings) {
  if (!verbose && f.code === "lab_required_none_listed") continue;
  console.log(`[${f.code}] ${f.courseCode} ${f.term} ${f.year}: ${f.detail}`);
}
if (!verbose) console.log("\n(lab_required_none_listed rows hidden; pass --all to list them)");
