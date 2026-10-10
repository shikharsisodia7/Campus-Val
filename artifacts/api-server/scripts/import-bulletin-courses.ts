/**
 * Adds courses the requirement data names but the course catalog snapshot lacks, from the
 * official Undergraduate Bulletin's own course listings (chapters 3 to 5), and corrects the
 * subject of a catalog course where the Bulletin states a different one.
 *
 *   pnpm run import:bulletin-courses                    report only (default)
 *   pnpm run import:bulletin-courses -- --write         add the courses found to data/courses-data.json
 *   pnpm run import:bulletin-courses -- --codes "MECH 142,FNCE 127"
 *
 * Without --codes it takes the codes the requirements audit reports as `course_not_in_catalog`.
 *
 * Nothing is guessed. A Bulletin page lists a course as a heading "142. Feedback Control Systems"
 * followed by its description, which ends "(4 units)". The heading carries no subject code, so a
 * course is attributed to a subject only when the Bulletin says so, in one of three ways:
 *   A. its neighbours: the nearest courses before and after it on the same page that ARE in the
 *      catalog (matched by number and exact title) belong to that subject (or there is none after it);
 *   B. the course-listing section it sits under names the subject ("Upper-Division Courses:
 *      Scripture and Tradition (SCTR)");
 *   C. the page's own requirement text names the exact code ("GNSX 101") and the page lists that
 *      number once;
 *   D. the section heading names a department ("Upper-Division Courses: Studio Art") that exactly one
 *      catalog subject is filed under.
 * A code is added only when exactly one such listing exists (or every one is the same course) and it
 * states its units. Everything else is reported and left for a person.
 *
 * Subject corrections: when rule B or C attributes a listing to a subject S, the catalog has no S
 * course of that number, and the catalog DOES have the same number and exact title under another
 * subject X, the catalog entry was filed under a stale subject (the 2025-26 snapshot files SCTR and
 * TESP courses as RSOC, and GNSX courses as WGST). With --write it is re-coded S n, and the old code
 * is kept in data/course-code-aliases.json so plans, profiles and notes that saved it still resolve.
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
const { codesIn } = await import("../src/lib/requirements-source/bulletin-source-text.ts");

const BASE = "https://www.scu.edu/bulletin/undergraduate/";
const SEED = "chapter-3-college-of-arts-and-sciences/gender-and-sexuality-studies.html";
const DATA = path.join(import.meta.dirname, "..", "src", "data");
const CATALOG = path.join(DATA, "courses-data.json");
const ALIASES = path.join(DATA, "course-code-aliases.json");
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
  /** The course-listing section heading the listing sits under. */
  section: string;
  /** The subject, when this listing is a course the catalog already has. */
  subject: string | null;
}

const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as CourseEntry[];
const aliases = JSON.parse(readFileSync(ALIASES, "utf8")) as Record<string, string>;
const byTitle = new Map<string, string[]>();
for (const c of catalog) byTitle.set(titleKey(c.title), [...(byTitle.get(titleKey(c.title)) ?? []), c.code]);
const inCatalog = new Set(catalog.map((c) => c.code));
/** Catalog department name -> the subjects filed under it ("Studio Art" -> ["ARTS"]). */
const subjectsByDepartment = new Map<string, string[]>();
for (const c of catalog) {
  if (!c.departmentName) continue;
  const list = subjectsByDepartment.get(c.departmentName) ?? [];
  if (!list.includes(c.department)) list.push(c.department);
  subjectsByDepartment.set(c.departmentName, list);
}

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
/** Codes a page's own requirement text names (the text before its first course listing). */
const namedByPage = new Map<string, Set<string>>();
for (const [page, html] of pages) {
  const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => ({ at: m.index!, text: decode(m[1]!) }));
  const firstListing = h2s.find((h) => /courses?\b/i.test(h.text) && !/requirements/i.test(h.text));
  namedByPage.set(page, new Set(codesIn(decode(html.slice(0, firstListing?.at ?? html.length).replace(/<\/(p|li|h\d)>/g, "\n"))).codes));
  for (const m of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*(?:<a [^>]*><\/a>\s*)?<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const head = decode(m[1]!).replace(/^NEW\s+/, "");
    // "142. Title", and a course listed under two numbers: "16/116. Music at Noon", "1A. and 2A. Title".
    const h = head.match(/^(\d{1,3}[A-Z]{0,3})(?:\.?\s*(?:\/|and)\s*(\d{1,3}[A-Z]{0,3}))?\.\s*(?:NEW\s+)?(.+)$/);
    if (!h) continue;
    const [, first, second, title] = h as unknown as [string, string, string | undefined, string];
    const section = h2s.filter((x) => x.at < m.index!).at(-1)?.text ?? "";
    for (const num of second ? [first, second] : [first]) {
      const known = (byTitle.get(titleKey(title)) ?? []).find((code) => code.split(" ")[1] === num);
      listings.push({ page, num, title: title.trim(), description: decode(m[2]!), section, subject: known ? known.split(" ")[0]! : null });
    }
  }
}

// "(4 units)", "(4 Units)", "(Credit/No Credit. 1 Unit.)": the units the description ends with.
const UNITS = /\((?:[^()]*?\s)?(\d+(?:\.\d+)?)\s*units?\.?\)\s*$/i;
const unitsOf = (l: Listing) => l.description.match(UNITS);
/** The subject a page's requirement text names most: the department's own subject. */
function pageSubject(page: string): string | null {
  const counts = new Map<string, number>();
  for (const code of namedByPage.get(page) ?? []) counts.set(code.split(" ")[0]!, (counts.get(code.split(" ")[0]!) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0] && (!ranked[1] || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
}

/**
 * The subject the Bulletin itself states for a listing (rule B or C), if any. Rule C holds only for the
 * page's own subject (a page's requirement text also names other departments' courses), and a catalog
 * course is re-coded only when the page's text never names its current subject.
 */
function statedSubject(l: Listing, subject: string): "B" | "C" | "D" | null {
  const inHeading = l.section.match(/\(([A-Z]{3,4})\)\s*$/)?.[1];
  if (inHeading) return inHeading === subject ? "B" : null;
  // D. the section heading names the department ("Upper-Division Courses: Studio Art") and exactly one
  // catalog subject carries that department name.
  const department = l.section.match(/Courses?:\s*(.+)$/)?.[1]?.trim();
  if (department && subjectsByDepartment.get(department)?.length === 1) return subjectsByDepartment.get(department)![0] === subject ? "D" : null;
  if (pageSubject(l.page) !== subject) return null;
  if (l.subject && l.subject !== subject && [...(namedByPage.get(l.page) ?? [])].some((c) => c.startsWith(`${l.subject} `))) return null;
  const onceOnPage = listings.filter((x) => x.page === l.page && x.num === l.num).length === 1;
  return onceOnPage && namedByPage.get(l.page)?.has(`${subject} ${l.num}`) ? "C" : null;
}

/** The subject that owns a listing: the one its section heading names, else its page's own subject. */
const ownerOf = (x: Listing) => x.section.match(/\(([A-Z]{3,4})\)\s*$/)?.[1] ?? pageSubject(x.page);
/**
 * Whether catalog course `code` is ALSO listed, with the same title, by its own subject's page or
 * section: then it is cross-listed (ETHN 55 and POLI 55 are one course with two codes) and must stay.
 */
const crossListed = (code: string, title: string) => {
  const [subject, num] = code.split(" ");
  return listings.some((x) => x.num === num && ownerOf(x) === subject && titleKey(x.title) === titleKey(title));
};

interface Hit {
  code: string;
  listing: Listing;
  units: number;
  rule: string;
  /** The catalog code this listing re-codes (a stale subject), or null for a new course. */
  replaces: string | null;
}
const found: Hit[] = [];
const notFound: string[] = [];
for (const code of targets) {
  const [subject, num] = code.split(" ") as [string, string];
  const hits = listings.flatMap((l, i): Hit[] => {
    if (l.num !== num) return [];
    const units = unitsOf(l);
    if (!units) return [];
    if (l.subject === null) {
      const before = listings.slice(0, i).reverse().find((x) => x.page === l.page && x.subject)?.subject ?? null;
      const after = listings.slice(i + 1).find((x) => x.page === l.page && x.subject)?.subject ?? null;
      if (before === subject && (after === subject || after === null)) return [{ code, listing: l, units: Number(units[1]), rule: "A", replaces: null }];
    }
    const rule = statedSubject(l, subject);
    if (!rule) return [];
    // The catalog already has this exact course under another subject: a correction, not an addition.
    const stale = l.subject && l.subject !== subject && !crossListed(`${l.subject} ${num}`, l.title) ? `${l.subject} ${num}` : null;
    return [{ code, listing: l, units: Number(units[1]), rule, replaces: stale }];
  });
  const sameCourse = hits.length > 1 && hits.every((h) => titleKey(h.listing.title) === titleKey(hits[0]!.listing.title) && h.units === hits[0]!.units);
  if (hits.length === 1 || sameCourse) found.push(hits[0]!);
  else notFound.push(hits.length > 1 ? `${code} (listed more than once)` : code);
}

// --correct-subjects: every catalog course the Bulletin files under another subject (rule B or C),
// not only the codes asked for.
if (args.includes("--correct-subjects")) {
  const taken = new Set(found.map((f) => f.code));
  for (const l of listings) {
    if (!l.subject || !unitsOf(l)) continue;
    const stated =
      l.section.match(/\(([A-Z]{3,4})\)\s*$/)?.[1] ??
      [...(namedByPage.get(l.page) ?? [])].map((c) => c.split(" ")).find(([s, n]) => n === l.num && s !== l.subject && statedSubject(l, s!) === "C")?.[0];
    if (!stated || stated === l.subject) continue;
    const code = `${stated} ${l.num}`;
    if (inCatalog.has(code) || taken.has(code)) continue;
    taken.add(code);
    const old = `${l.subject} ${l.num}`;
    found.push({ code, listing: l, units: Number(unitsOf(l)![1]), rule: statedSubject(l, stated) ?? "B", replaces: crossListed(old, l.title) ? null : old });
  }
}

console.log(`${targets.length} codes not in the catalog; ${found.length} found in the Bulletin's course listings, ${notFound.length} left for a person.`);
for (const f of found) {
  console.log(`  ${f.replaces ? `~ ${f.replaces} -> ${f.code}` : `+ ${f.code}`}  [${f.rule}] ${f.listing.title} (${f.units} units)  ${BASE}${f.listing.page}`);
}
if (notFound.length) console.log(`  not found: ${notFound.join(", ")}`);

if (write && found.length) {
  const departmentName = (subject: string) => catalog.find((c) => c.department === subject)?.departmentName;
  for (const { code, listing, units, replaces } of found) {
    const subject = code.split(" ")[0]!;
    if (replaces) {
      const entry = catalog.find((c) => c.code === replaces)!;
      entry.code = code;
      entry.department = subject;
      const name = departmentName(subject) ?? listing.section.replace(/^.*Courses?:\s*/i, "").replace(/\s*\([A-Z]{3,4}\)\s*$/, "");
      if (name) entry.departmentName = name;
      entry.notes = [entry.notes, `Filed as ${replaces} in the 2025-26 catalog snapshot; the 2026-27 Undergraduate Bulletin lists it as ${code} (${BASE}${listing.page}).`]
        .filter(Boolean)
        .join(" ");
      aliases[replaces] = code;
      continue;
    }
    const description = listing.description.replace(UNITS, "").trim();
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
  writeFileSync(ALIASES, JSON.stringify(Object.fromEntries(Object.entries(aliases).sort()), null, 2) + "\n");
  const corrected = found.filter((f) => f.replaces).length;
  console.log(`\nAdded ${found.length - corrected} courses and re-coded ${corrected} in ${path.relative(process.cwd(), CATALOG)}.`);
}
