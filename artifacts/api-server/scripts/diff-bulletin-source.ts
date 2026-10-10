/**
 * Bulletin source diff: every major's transcription (data/majors/*.ts) against the LIVE Undergraduate
 * Bulletin. A proofreading aid for a person: it lists what to look at and changes nothing.
 *
 *   pnpm --filter @workspace/api-server run diff:bulletin-source                 summary to the console
 *   pnpm --filter @workspace/api-server run diff:bulletin-source -- --out <dir>  + bulletin-source-diff.json and .md
 *
 * For each major it reports:
 *   - drift: lines of the requirement text stored beside the structure that the live page no longer
 *     contains, word for word (the Bulletin changed; re-check the structure);
 *   - "named, not offered": course codes the stored text names with their subject that no requirement
 *     of the structure offers (usually a recommendation, e.g. "PHIL 32 (recommended)");
 *   - "offered, not named": codes the structure names that the text does not (should be none: a test
 *     enforces it).
 * Nothing is guessed: a page is the structure's own sourceUrl, and text is compared after collapsing
 * whitespace only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ??= "postgres://unused@localhost:1/unused";
const { getAvailableMajors } = await import("../src/data/graduation-paths.ts");
const { MAJOR_STRUCTURES, resolveMajorStructure, structureCourses } = await import("../src/data/major-structures.ts");
const { codesIn, codesNamedIn, pageLines } = await import("../src/lib/requirements-source/bulletin-source-text.ts");

const args = process.argv.slice(2);
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "CampusVal requirements proofreading (SCU academic planning)" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

export interface MajorDiff {
  code: string;
  title: string;
  page: string;
  storedLines: number;
  driftedLines: string[];
  namedNotOffered: string[];
  offeredNotNamed: string[];
  problem: string | null;
}

async function main() {
  const pages = new Map<string, Set<string>>();
  // Read every major's page first, so a line quoted from another major's page can be found.
  for (const url of new Set(Object.values(MAJOR_STRUCTURES).map((st) => st.sourceUrl))) {
    try {
      pages.set(url, new Set(pageLines(await get(url)).map((l) => squash(l.replace(/^#\d /, "")))));
    } catch {
      // Reported per major below.
    }
  }
  const results: MajorDiff[] = [];
  for (const major of getAvailableMajors()) {
    const structure = MAJOR_STRUCTURES[major.code];
    const base: MajorDiff = { code: major.code, title: major.title, page: structure?.sourceUrl ?? "", storedLines: 0, driftedLines: [], namedNotOffered: [], offeredNotNamed: [], problem: null };
    if (!structure) {
      results.push({ ...base, problem: "no Bulletin structure" });
      continue;
    }
    try {
      if (!pages.has(structure.sourceUrl)) pages.set(structure.sourceUrl, new Set(pageLines(await get(structure.sourceUrl)).map((l) => squash(l.replace(/^#\d /, "")))));
    } catch (error) {
      results.push({ ...base, problem: `could not read the page: ${(error as Error).message}` });
      continue;
    }
    // A major whose text quotes a second page (Accounting and Information Systems is stated on two
    // department pages) is checked against every page read so far, as well as its own.
    const own = pages.get(structure.sourceUrl)!;
    const live = { has: (line: string) => own.has(line) || [...pages.values()].some((p) => p.has(line)) };
    const offered = new Set(resolveMajorStructure(structure, [], [], { allVariants: true }).flatMap((r) => r.courses));
    const named = codesNamedIn([...structure.sourceText, ...(structure.listingText ?? [])], structure.defaultSubject);
    results.push({
      ...base,
      storedLines: structure.sourceText.length,
      driftedLines: structure.sourceText.filter((l) => !live.has(squash(l)) && !/^\(Bachelor of Science in Computer Science and Engineering\) /.test(l)),
      namedNotOffered: codesIn(structure.sourceText.join("\n")).codes.filter((c) => !offered.has(c)).sort(),
      offeredNotNamed: structureCourses(structure).filter((c) => !named.has(c) && !structure.sourceCorrections?.[c]).sort(),
    });
  }

  const drifted = results.filter((r) => r.driftedLines.length > 0);
  console.log(`majors ${results.length} | text unchanged ${results.length - drifted.length - results.filter((r) => r.problem).length} | drifted ${drifted.length} | problems ${results.filter((r) => r.problem).length}`);
  for (const r of results) {
    if (r.problem) console.log(`  - ${r.code} ${r.title}: ${r.problem}`);
    else
      console.log(
        `  ${r.driftedLines.length ? "!" : "="} ${r.code} ${r.title}: ${r.storedLines - r.driftedLines.length}/${r.storedLines} lines unchanged` +
          (r.namedNotOffered.length ? ` | named, not offered: ${r.namedNotOffered.join(" ")}` : "") +
          (r.offeredNotNamed.length ? ` | offered, not named: ${r.offeredNotNamed.join(" ")}` : ""),
      );
  }
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const generatedAt = new Date().toISOString();
    writeFileSync(path.join(outDir, "bulletin-source-diff.json"), JSON.stringify({ generatedAt, results }, null, 2) + "\n");
    const md = [
      "# Bulletin source diff (every major against the live Bulletin)",
      "",
      `Generated ${generatedAt.slice(0, 10)} by \`pnpm --filter @workspace/api-server run diff:bulletin-source\`. Nothing was changed.`,
      "",
      "- **Lines unchanged**: lines of the requirement text stored beside the structure that the live page still contains word for word. A drifted line means the Bulletin changed: re-check that major's structure.",
      "- **Named, not offered**: codes the text names with their subject that no requirement offers. These are recommendations or context (\"PHIL 32 (recommended)\", \"MATH 122 and 123 are strongly recommended\"), listed so a person can confirm each.",
      "- **Offered, not named**: codes the structure names that its text does not. A test keeps this empty.",
      "",
      `Majors ${results.length} · text unchanged ${results.length - drifted.length} · drifted ${drifted.length}.`,
      "",
      "| Major | Lines unchanged | Named, not offered | Offered, not named |",
      "| --- | --- | --- | --- |",
      ...results.map((r) =>
        r.problem
          ? `| ${r.title} (${r.code}) | ${r.problem} | | |`
          : `| [${r.title} (${r.code})](${r.page}) | ${r.storedLines - r.driftedLines.length} / ${r.storedLines} | ${r.namedNotOffered.join(", ")} | ${r.offeredNotNamed.join(", ")} |`,
      ),
      "",
      ...(drifted.length
        ? ["## Drifted lines", "", ...drifted.flatMap((r) => [`### ${r.title} (${r.code})`, "", ...r.driftedLines.map((l) => `- ${l}`), ""])]
        : []),
    ].join("\n");
    writeFileSync(path.join(outDir, "bulletin-source-diff.md"), md);
    console.log(`wrote ${outDir}/bulletin-source-diff.{json,md}`);
  }
}

if (process.argv[1] && /diff-bulletin-source\.ts$/.test(process.argv[1])) await main();
