/**
 * Bulletin source diff: the live Undergraduate Bulletin's "Requirements for the Major" text versus CampusVal's requirement
 * data, for every major. A proofreading aid for a person: it lists CANDIDATES and changes nothing.
 *
 *   pnpm --filter @workspace/api-server run diff:bulletin-source                 summary to the console
 *   pnpm --filter @workspace/api-server run diff:bulletin-source -- --out <dir>  + bulletin-source-diff.json and .md
 *
 * Nothing is guessed:
 *   - a major is matched to a Bulletin page when one chapter 3-5 page's link text equals the major's title without its degree
 *     qualifier ("Accounting (B.S. Commerce)" -> "Accounting"), or else when exactly ONE page's title contains it as whole
 *     words ("Chemistry" -> "Chemistry and Biochemistry"); otherwise it is listed as "page not matched";
 *   - only the page's "Requirements for the Major" (or "... Bachelor of ...") section is read, up to the next requirements,
 *     minor or course-listing heading; a page with several such sections uses the one naming the major, else is reported;
 *   - a course code is read only where the text names its subject ("CHEM 11, 12, and 33" = CHEM 11, 12, 33). Lists of bare
 *     numbers ("110, 112, 113") are counted as "not attributed" and left for a person.
 * "In Bulletin, not in CampusVal" and "in CampusVal, not in the section" are candidates: CampusVal also lists the courses of the
 * school's own requirements (the LSB Common Curriculum, a math sequence) that the Bulletin may state in another chapter.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

process.env.DATABASE_URL ??= "postgres://unused@localhost:1/unused";
const { getAvailableMajors, getMajorRequirements } = await import("../src/data/graduation-paths.ts");
const { MAJOR_STRUCTURES, structureCourses } = await import("../src/data/major-structures.ts");
const { codesIn, entities, majorSections, norm, pageLines } = await import("../src/lib/requirements-source/bulletin-source-text.ts");

const BASE = "https://www.scu.edu/bulletin/undergraduate/";
// Two seeds: a page's navigation does not link to the page itself.
const SEEDS = ["chapter-3-college-of-arts-and-sciences/biology.html", "chapter-3-college-of-arts-and-sciences/gender-and-sexuality-studies.html"];
const args = process.argv.slice(2);
const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : undefined;

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "CampusVal requirements proofreading (SCU academic planning)" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

export interface MajorDiff {
  code: string;
  title: string;
  page: string | null;
  section: string | null;
  problem: string | null;
  bulletinCodes: number;
  campusValCodes: number;
  unattributedLists: number;
  inBulletinNotCampusVal: string[];
  inCampusValNotBulletin: string[];
  structured: boolean;
}

function campusValCodes(code: string): string[] {
  const structure = MAJOR_STRUCTURES[code];
  if (structure) return structureCourses(structure);
  const reqs = getMajorRequirements(code, [], (c) => ({ code: c, title: c, units: 4, description: "" }));
  if (!reqs) return [];
  return [...new Set(reqs.groups.flatMap((g) => g.courses).filter((c) => c.category !== "university-core").map((c) => c.code))];
}

async function main() {
  const links = new Map<string, string>(); // normalized link text -> page
  const duplicate = new Set<string>();
  for (const seedPage of SEEDS) {
    const seed = await get(BASE + seedPage);
    for (const m of seed.matchAll(/<a[^>]+href="\.\.\/(chapter-[345][^"#?]*\.html)(?:#[^"]*)?"[^>]*>([\s\S]*?)<\/a>/g)) {
      const key = norm(entities(m[2]!.replace(/<[^>]+>/g, "")));
      if (!key || m[1]!.endsWith("/index.html")) continue;
      if (links.has(key) && links.get(key) !== m[1]) duplicate.add(key);
      links.set(key, m[1]!);
    }
  }
  const pageFor = (title: string): { page?: string; problem?: string } => {
    const key = norm(title.replace(/\s*\([^)]*\)\s*$/, "").replace(/,\s*ACS Certified$/i, ""));
    if (duplicate.has(key)) return { problem: "several Bulletin pages carry this title" };
    const exact = links.get(key);
    if (exact) return { page: exact };
    const containing = [...new Set([...links.entries()].filter(([text]) => ` ${text} `.includes(` ${key} `)).map(([, page]) => page))];
    if (containing.length === 1) return { page: containing[0] };
    return { problem: containing.length > 1 ? `several pages contain the title (${containing.length})` : "page not matched (no Bulletin page carries the major's title)" };
  };
  const pageCache = new Map<string, string[]>();
  const results: MajorDiff[] = [];
  for (const major of getAvailableMajors()) {
    const key = norm(major.title.replace(/\s*\([^)]*\)\s*$/, "").replace(/,\s*ACS Certified$/i, ""));
    const base: MajorDiff = {
      code: major.code,
      title: major.title,
      page: null,
      section: null,
      problem: null,
      bulletinCodes: 0,
      campusValCodes: 0,
      unattributedLists: 0,
      inBulletinNotCampusVal: [],
      inCampusValNotBulletin: [],
      structured: !!MAJOR_STRUCTURES[major.code],
    };
    const found = pageFor(major.title);
    const page = found.page;
    if (!page) {
      results.push({ ...base, problem: found.problem ?? "page not matched" });
      continue;
    }
    if (!pageCache.has(page)) pageCache.set(page, pageLines(await get(BASE + page)));
    const sections = majorSections(pageCache.get(page)!);
    const named = sections.filter((s) => norm(s.heading).includes(key));
    const chosen = sections.length === 1 ? sections[0] : named.length === 1 ? named[0] : undefined;
    if (!chosen) {
      results.push({
        ...base,
        page,
        problem: sections.length === 0 ? "no 'Requirements for the Major' section found" : `${sections.length} requirement sections, none uniquely naming the major`,
      });
      continue;
    }
    const { codes, unattributedLists } = codesIn(chosen.lines.join("\n"));
    const mine = campusValCodes(major.code);
    const bulletin = new Set(codes);
    const cv = new Set(mine);
    results.push({
      ...base,
      page,
      section: chosen.heading,
      bulletinCodes: bulletin.size,
      campusValCodes: cv.size,
      unattributedLists,
      inBulletinNotCampusVal: [...bulletin].filter((c) => !cv.has(c)).sort(),
      inCampusValNotBulletin: [...cv].filter((c) => !bulletin.has(c)).sort(),
    });
  }

  const compared = results.filter((r) => !r.problem);
  console.log(`majors ${results.length} | compared ${compared.length} | not compared ${results.length - compared.length}`);
  for (const r of results) {
    if (r.problem) {
      console.log(`  - ${r.code} ${r.title}: ${r.problem}`);
      continue;
    }
    const flags = r.inBulletinNotCampusVal.length + r.inCampusValNotBulletin.length;
    console.log(
      `  ${flags === 0 ? "=" : "!"} ${r.code} ${r.title}${r.structured ? " [structured]" : ""}: bulletin ${r.bulletinCodes}, campusval ${r.campusValCodes}` +
        (r.inBulletinNotCampusVal.length ? ` | missing? ${r.inBulletinNotCampusVal.join(" ")}` : "") +
        (r.inCampusValNotBulletin.length ? ` | extra? ${r.inCampusValNotBulletin.join(" ")}` : "") +
        (r.unattributedLists ? ` | ${r.unattributedLists} bare-number list(s) not attributed` : ""),
    );
  }
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "bulletin-source-diff.json"), JSON.stringify({ generatedAt: new Date().toISOString(), source: BASE, results }, null, 2) + "\n");
    const md = [
      "# Bulletin source diff (candidates for a person to review)",
      "",
      `Generated ${new Date().toISOString().slice(0, 10)} by \`pnpm --filter @workspace/api-server run diff:bulletin-source\` from ${BASE}. Nothing was changed.`,
      "\"Missing?\" = a course the major's Bulletin requirement section names that CampusVal's data does not list. \"Extra?\" = a course CampusVal lists that the section does not name (often a school requirement or math sequence stated elsewhere). Bare-number lists (\"110, 112, 113\") are not attributed.",
      "",
      `Majors ${results.length} · compared ${compared.length} · not compared ${results.length - compared.length}.`,
      "",
      "| Major | Bulletin section | Bulletin / CampusVal codes | Missing? | Extra? | Bare lists |",
      "| --- | --- | --- | --- | --- | --- |",
      ...results.map((r) =>
        r.problem
          ? `| ${r.title} (${r.code}) | ${r.page ? `[page](${BASE}${r.page})` : "—"} — ${r.problem} | | | | |`
          : `| ${r.title} (${r.code})${r.structured ? " ✓ structured" : ""} | [${r.section}](${BASE}${r.page}) | ${r.bulletinCodes} / ${r.campusValCodes} | ${r.inBulletinNotCampusVal.join(", ")} | ${r.inCampusValNotBulletin.join(", ")} | ${r.unattributedLists || ""} |`,
      ),
      "",
    ].join("\n");
    writeFileSync(path.join(outDir, "bulletin-source-diff.md"), md);
    console.log(`wrote ${outDir}/bulletin-source-diff.{json,md}`);
  }
}

if (process.argv[1] && /diff-bulletin-source\.ts$/.test(process.argv[1])) await main();
