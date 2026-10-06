/**
 * Imports sample plans from official sources.
 *
 *   pnpm --filter @workspace/api-server run import:sample-plans -- [--engineering] [--cas-dir <folder of .docx>]
 *        [--version <label>] [--apply] [--publish] [--actor <email>] [--out <report.json>]
 *
 * Dry run unless --apply. Sources:
 *   --engineering   the School of Engineering four-year plans CampusVal already
 *                   carries as "prescribed" (reconciled course by course against
 *                   the published SCU plan; the source link travels with each).
 *                   "recommended" and "example" sequences are NOT sample plans.
 *   --cas-dir       College of Arts and Sciences first-year course plans
 *                   (Word documents downloaded from the department).
 *   --generated     for every major that has NO official plan above, the example
 *                   four-year sequence CampusVal builds from the major's own
 *                   requirements. Stored as sourceType campusval_generated and
 *                   labelled everywhere as an example, never as an SCU plan.
 * Nothing is invented: a cell that is not exactly one course stays the
 * department's own wording as a placeholder. Courses missing from the catalog
 * are reported, never substituted. Safe to re-run (a template is keyed by slug
 * and version; a published template that differs is refused).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";
import { getFourYearIndex, getGraduationPath } from "../src/data/graduation-paths.ts";
import { readChecksheetDocx } from "../src/lib/checksheets/docx-reader.ts";
import { listPrograms } from "../src/lib/department/programs.ts";
import { slug } from "../src/lib/requirements-source/stable-keys.ts";
import { parseCasCoursePlan } from "../src/lib/sample-plans/cas-course-plan.ts";
import { importSamplePlan, type SamplePlanImport } from "../src/lib/sample-plans/service.ts";
import { validateSampleItems, type SampleItemInput } from "../src/lib/sample-plans/validate.ts";

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const apply = args.includes("--apply");
const publish = args.includes("--publish");
const actor = { email: (arg("--actor") ?? "importer@campusval.local").toLowerCase(), userId: "importer" };
const planSets: SamplePlanImport[] = [];
const skipped: string[] = [];
const CODE = /^[A-Z]{2,5} \d{1,3}[A-Z]{0,2}$/;

if (args.includes("--engineering")) {
  for (const entry of getFourYearIndex().filter((e) => e.sequenceTrust === "prescribed")) {
    const path4 = getGraduationPath("four_year", entry.code);
    const program = listPrograms().find((p) => p.type === "major" && p.code === entry.code);
    const items: SampleItemInput[] = [];
    for (const q of path4.quarters) {
      q.courses.forEach((course, i) => {
        const text = course.trim();
        items.push(
          CODE.test(text.toUpperCase())
            ? { year: q.year, term: q.term, itemType: "course", courseCode: text, note: i === 0 ? (q.notes ?? null) : null }
            : { year: q.year, term: q.term, itemType: "placeholder", label: text, note: i === 0 ? (q.notes ?? null) : null },
        );
      });
    }
    planSets.push({
      slug: `soe-${slug(entry.title)}-four-year`,
      version: arg("--version") ?? path4.provenance.catalogYear ?? "current",
      school: "SOE",
      program: entry.title,
      programKey: program?.programKey ?? null,
      title: "Four-year plan",
      description: path4.summary,
      planLength: "four_year",
      academicYear: path4.provenance.catalogYear ?? null,
      sourceType: "official_department",
      sourceLabel: path4.provenance.sourceLabel ?? "School of Engineering published four-year plan",
      sourceUrl: path4.provenance.sourceUrl ?? null,
      sourceReference: `Engineering four-year plan: ${entry.title}`,
      items,
    });
  }
}

if (args.includes("--generated")) {
  const official = new Set(planSets.map((p) => p.programKey).filter(Boolean));
  for (const program of listPrograms().filter((p) => p.type === "major")) {
    if (official.has(program.programKey)) continue;
    const path4 = getGraduationPath("four_year", program.code);
    // A major with an official four-year plan (prescribed) is loaded by --engineering; nothing is generated for it.
    if (path4.sequenceTrust === "prescribed" || path4.quarters.length === 0) continue;
    const items: SampleItemInput[] = [];
    for (const q of path4.quarters) {
      for (const course of q.courses) {
        const text = course.trim();
        items.push(CODE.test(text.toUpperCase()) ? { year: q.year, term: q.term, itemType: "course", courseCode: text } : { year: q.year, term: q.term, itemType: "placeholder", label: text });
      }
    }
    planSets.push({
      slug: `example-${slug(program.title)}-four-year`,
      version: arg("--version") ?? "2026-27",
      school: program.college,
      program: program.title,
      programKey: program.programKey,
      title: "Example four-year plan (generated by CampusVal)",
      description: "Not an official SCU plan. CampusVal arranged this major's required courses into 12 quarters as an illustration. Check it against your advisor, the Bulletin and Workday.",
      planLength: "four_year",
      academicYear: null,
      sourceType: "campusval_generated",
      sourceLabel: "Generated by CampusVal from this major's Bulletin requirements (not an official SCU plan)",
      sourceUrl: path4.provenance.sourceUrl ?? null,
      sourceReference: `${program.title} requirements, ${path4.provenance.catalogYear ?? "2026-27 Bulletin"}`,
      items,
    });
  }
}

const casDir = arg("--cas-dir");
if (casDir) {
  const majors = listPrograms().filter((p) => p.type === "major" && p.college === "CAS");
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const file of readdirSync(casDir).filter((f) => f.toLowerCase().endsWith(".docx")).sort()) {
    let parsed;
    try {
      const render = await readChecksheetDocx(readFileSync(path.join(casDir, file)));
      parsed = parseCasCoursePlan(render.blocks);
    } catch (error) {
      skipped.push(`${file}: unreadable (${(error as Error).message})`);
      continue;
    }
    if (!parsed.program || parsed.plans.length === 0) {
      skipped.push(`${file}: ${parsed.problems.join("; ") || "no program named"}`);
      continue;
    }
    const match = majors.filter((m) => norm(m.title) === norm(parsed.program!));
    for (const plan of parsed.plans) {
      planSets.push({
        // The file is part of the slug: three Classics tracks share one "Major:" line.
        slug: `cas-${slug(file.replace(/\.docx$/i, ""))}-first-year-option-${plan.optionIndex}`,
        version: arg("--version") ?? "current",
        school: "CAS",
        program: parsed.program,
        programKey: match.length === 1 ? match[0]!.programKey : null,
        title: `First-year plan — ${plan.optionLabel}`,
        description: "A first-year (Fall, Winter, Spring) course plan from the department. Cells that offer a choice are loaded as placeholders with the department's wording.",
        planLength: "first_year",
        academicYear: null,
        sourceType: "official_department",
        sourceLabel: `College of Arts and Sciences first-year course plan: ${parsed.program}`,
        sourceUrl: null,
        sourceReference: `${file}, ${plan.optionLabel}`,
        items: plan.items,
      });
    }
  }
}

const report = { planSets: planSets.length, withWarnings: 0, imported: 0, skipped, plans: [] as unknown[] };
for (const plan of planSets) {
  const warnings = validateSampleItems(plan.items);
  if (warnings.length > 0) report.withWarnings += 1;
  let outcome = "dry-run";
  if (apply) {
    const result = await importSamplePlan(actor, plan, { publish });
    outcome = result.outcome;
    if (result.outcome !== "unchanged") report.imported += 1;
  }
  report.plans.push({ slug: plan.slug, version: plan.version, school: plan.school, program: plan.program, items: plan.items.length, outcome, warnings: warnings.map((w) => w.message) });
}
console.log(`${report.planSets} sample plans read, ${report.withWarnings} with validation warnings, ${report.imported} written${apply ? "" : " (dry run — pass --apply)"}`);
for (const p of report.plans as any[]) console.log(`  ${p.school} ${p.slug} v${p.version}: ${p.items} items, ${p.warnings.length} warnings`);
for (const s of skipped) console.log(`  skipped ${s}`);
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
await pool.end();
