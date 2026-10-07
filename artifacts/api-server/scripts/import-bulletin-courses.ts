/**
 * Adds courses the requirement data names but the course catalog snapshot lacks, from the
 * official Undergraduate Bulletin's own course listings (chapters 3 to 5).
 *
 *   pnpm run import:bulletin-courses                    report only (default)
 *   pnpm run import:bulletin-courses -- --write         add the courses found to data/courses-data.json
 *   pnpm run import:bulletin-courses -- --codes "MECH 142,FNCE 127"
 *
 * Without --codes it takes the codes the requirements audit reports as `course_not_in_catalog`.
 *
 * Nothing is guessed. A Bulletin page lists a course as a heading "142. Feedback Control Systems"
 * followed by its description, which ends "(4 units)". The heading carries no subject code, so a
 * course is attributed to a subject only by its neighbours: the nearest courses before and after it
 * on the same page that ARE in the catalog (matched by number and exact title) must belong to that
 * subject (or there is none after it). A code is added only when exactly one such entry exists and
 * it states its units. Everything else is reported and left for a person.
 *
 * New entries keep the catalog's conventions: the Bulletin's prerequisite sentence is kept word for
 * word in `prereqLogic`, but no prerequisite rules are inferred (`prereqGroups` stays empty), and
 * `offeredTerms` is the catalog's usual placeholder (the Bulletin does not publish term offerings).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CourseEntry } from "../src/data/courses.ts";

// The audit reads only bundled data, but its imports load the database client, which needs a URL
// to exist. Nothing here connects to a database.
process.env.DATABASE_URL ??= "postgres://unused@localhost:1/unused";
const { auditRequirements } = await import("../src/lib/requirements-source/audit.ts");

const BASE = "https://www.scu.edu/bulletin/undergraduate/";
const SEED = "chapter-3-college-of-arts-and-sciences/gender-and-sexuality-studies.html";
const CATALOG = path.join(import.meta.dirname, "..", "src", "data", "courses-data.json");
const args = process.argv.slice(2);
const write = args.includes("--write");
const codesArg = args.includes("--codes") ? args[args.indexOf("--codes") + 1] : undefined;

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "CampusVal catalog import (SCU academic planning)" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|\u00A0/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/�/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const titleKey = (t: string) => t.replace(/\W/g, "").toLowerCase();

interface Listing {
  page: string;
  num: string;
  title: string;
  description: string;
  /** The subject, when this listing is a course the catalog already has. */
  subject: string | null;
}

const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as CourseEntry[];
const byTitle = new Map<string, string[]>();
for (const c of catalog) byTitle.set(titleKey(c.title), [...(byTitle.get(titleKey(c.title)) ?? []), c.code]);
const inCatalog = new Set(catalog.map((c) => c.code));

const wanted = codesArg
  ? codesArg.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
  : [...new Set(auditRequirements().findings.filter((f) => f.code === "course_not_in_catalog").map((f) => f.message.split(" is not")[0]!))].sort();
const targets = wanted.filter((c) => !inCatalog.has(c));

const seed = await get(BASE + SEED);
const pageNames = [...new Set([...seed.matchAll(/href="\.\.\/(chapter-[345][^"#?]*\.html)/g)].map((m) => m[1]!))].sort();
const pages: [string, string][] = [];
for (let i = 0; i < pageNames.length; i += 6) {
  const batch = pageNames.slice(i, i + 6);
  pages.push(...(await Promise.all(batch.map(async (p) => [p, await get(BASE + p)] as [string, string]))));
}

const listings: Listing[] = [];
for (const [page, html] of pages) {
  for (const m of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*(?:<a [^>]*><\/a>\s*)?<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const head = decode(m[1]!).replace(/^NEW\s+/, "");
    const h = head.match(/^(\d{1,3}[A-Z]{0,3})\.\s*(?:NEW\s+)?(.+)$/);
    if (!h) continue;
    const [, num, title] = h as unknown as [string, string, string];
    const known = (byTitle.get(titleKey(title)) ?? []).find((code) => code.split(" ")[1] === num);
    listings.push({ page, num, title: title.trim(), description: decode(m[2]!), subject: known ? known.split(" ")[0]! : null });
  }
}

const found: { code: string; listing: Listing; units: number }[] = [];
const notFound: string[] = [];
for (const code of targets) {
  const [subject, num] = code.split(" ") as [string, string];
  const hits = listings.flatMap((l, i) => {
    if (l.num !== num || l.subject !== null) return [];
    const before = listings.slice(0, i).reverse().find((x) => x.page === l.page && x.subject)?.subject ?? null;
    const after = listings.slice(i + 1).find((x) => x.page === l.page && x.subject)?.subject ?? null;
    const units = l.description.match(/\((\d+(?:\.\d+)?) units?\)\s*$/);
    return before === subject && (after === subject || after === null) && units ? [{ code, listing: l, units: Number(units[1]) }] : [];
  });
  if (hits.length === 1) found.push(hits[0]!);
  else notFound.push(hits.length > 1 ? `${code} (listed more than once)` : code);
}

console.log(`${targets.length} codes not in the catalog; ${found.length} found in the Bulletin's course listings, ${notFound.length} left for a person.`);
for (const f of found) console.log(`  + ${f.code}  ${f.listing.title} (${f.units} units)  ${BASE}${f.listing.page}`);
if (notFound.length) console.log(`  not found: ${notFound.join(", ")}`);

if (write && found.length) {
  const departmentName = (subject: string) => catalog.find((c) => c.department === subject)?.departmentName;
  for (const { code, listing, units } of found) {
    const subject = code.split(" ")[0]!;
    const description = listing.description.replace(/\s*\(\d+(?:\.\d+)? units?\)\s*$/, "");
    const prereq = description.match(/Prerequisites?:\s*([^.]+(?:\.\d[^.]*)?)\./i)?.[1]?.trim() ?? "";
    const entry: CourseEntry = {
      code,
      title: listing.title,
      department: subject,
      ...(departmentName(subject) ? { departmentName: departmentName(subject) } : {}),
      units,
      description,
      coreAreas: [],
      offeredTerms: ["fall", "winter", "spring"],
      prereqLogic: prereq,
      prereqGroups: [],
      corequisites: [],
      notes: `From the 2026-27 Undergraduate Bulletin course listing (${BASE}${listing.page}); not in the 2025-26 catalog snapshot.`,
    };
    catalog.push(entry);
  }
  writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
  console.log(`\nAdded ${found.length} courses to ${path.relative(process.cwd(), CATALOG)}.`);
}
