/**
 * THE canonical definition of SCU University Core areas inside CampusVal.
 *
 * Before this module, three places each held their own idea of what "CTW",
 * "Advanced Writing" or "C&I" meant — a tag table in data/courses.ts, a
 * requirement-id → tag table in lib/core-cross-satisfaction.ts, and (for the
 * UI) nothing at all, so clicking a Core requirement in a plan could not find
 * a single course. Everything now derives from here:
 *
 *   - `CORE_AREAS`               the areas, their short codes and aliases
 *   - `CORE_AREA_BY_REQUIREMENT` requirement item id → area (cross-satisfaction,
 *                                requirement "Find courses" buttons)
 *   - `resolveCoreAreaTag`       "CTW" / "CNI" / "C&I 3" / full name → tag
 *   - `deriveCoreAreas`          the tags a catalog course carries, with the
 *                                provenance of each (see below)
 *
 * PROVENANCE. SCU's bulletin scrape did not capture per-course Core tags, so
 * each tag a course carries is one of:
 *   - "catalog_text": the course's own bulletin title/description states the
 *     designation ("Satisfies the Ethics Core requirement…", "Successful
 *     completion of CTW I (PHIL 1A)…"). The matching sentence is kept so the
 *     tag is traceable.
 *   - "heuristic": inferred from department + course-number range. Documented
 *     as an approximation; the UI tells students to confirm it.
 * A bulletin sentence that explicitly says a course does NOT satisfy an area
 * ("Does not fulfill the undergraduate Core Curriculum requirement in
 * mathematics") suppresses that area, even if a heuristic would have added it.
 *
 * Nothing here invents a mapping. Areas the catalog has no text or heuristic
 * for (e.g. Pathways) simply have zero tagged courses, and callers say so.
 */
import type { CourseEntry } from "./courses";

export type CoreAreaTagSource = "catalog_text" | "heuristic";

export interface CoreAreaDef {
  /** The exact string stored in `CourseEntry.coreAreas` and matched by course search. */
  tag: string;
  /** Short code students and advisors use in conversation. */
  code: string;
  /** Extra spellings accepted wherever a Core area is typed or passed in a URL. */
  aliases: string[];
  /** Requirement item ids (data/degree-requirements.ts) this area satisfies. */
  requirementIds: string[];
}

export const CORE_AREAS: readonly CoreAreaDef[] = [
  { tag: "Critical Thinking & Writing", code: "CTW", aliases: ["ctw", "ctw 1", "ctw 2", "ctw1", "ctw2", "ctw i", "ctw ii", "critical thinking and writing", "critical thinking & writing 1", "critical thinking & writing 2"], requirementIds: ["ctw1", "ctw2"] },
  { tag: "Cultures & Ideas", code: "C&I", aliases: ["c&i", "cni", "c and i", "ci", "c&i 1", "c&i 2", "cni 1", "cni 2", "ci 1", "ci 2", "cultures and ideas", "culture and ideas", "cultures & ideas 1", "cultures & ideas 2"], requirementIds: ["ci1", "ci2"] },
  { tag: "Cultures & Ideas 3", code: "C&I 3", aliases: ["c&i 3", "cni 3", "ci 3", "c and i 3", "cultures and ideas 3", "culture and ideas 3", "cultures & ideas iii"], requirementIds: ["ci3"] },
  { tag: "Religion, Theology & Culture", code: "RTC", aliases: ["rtc", "rtc 1", "rtc 2", "rtc 3", "religion theology and culture", "religion, theology and culture"], requirementIds: ["rtc1", "rtc2", "rtc3"] },
  { tag: "Mathematics", code: "MATH", aliases: ["math", "mathematics core", "core math"], requirementIds: ["math"] },
  { tag: "Natural Science", code: "NATSCI", aliases: ["natsci", "natural sciences", "nat sci", "science"], requirementIds: ["natsci"] },
  { tag: "Social Science", code: "SOCSCI", aliases: ["socsci", "social sciences", "soc sci"], requirementIds: ["socsci"] },
  { tag: "Arts", code: "ARTS", aliases: ["arts core", "art"], requirementIds: ["arts"] },
  { tag: "Ethics", code: "ETHICS", aliases: ["ethic", "ethics core"], requirementIds: ["ethics"] },
  { tag: "Diversity", code: "DIV", aliases: ["div", "diversity: u.s. perspectives", "diversity us perspectives", "us diversity"], requirementIds: ["diversity"] },
  { tag: "Civic Engagement", code: "CE", aliases: ["ce", "civic", "civic engagement core"], requirementIds: ["civic"] },
  { tag: "Second Language", code: "LANG", aliases: ["lang", "second lang", "2nd language", "language"], requirementIds: ["lang"] },
  { tag: "Science, Technology & Society", code: "STS", aliases: ["sts", "science technology and society", "science, technology and society"], requirementIds: ["sts"] },
  { tag: "Advanced Writing", code: "AW", aliases: ["aw", "adv writing", "advanced writing core", "core advanced writing"], requirementIds: ["advwriting"] },
  { tag: "Experiential Learning for Social Justice", code: "ELSJ", aliases: ["elsj", "experiential learning", "experiential learning for social justice"], requirementIds: ["elsj"] },
  // A tag the catalog heuristic has always produced; it has no Core requirement item.
  { tag: "Global Cultures", code: "GLOBAL", aliases: ["global", "global cultures"], requirementIds: [] },
];

const norm = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, " ");

const BY_TAG = new Map(CORE_AREAS.map((a) => [norm(a.tag), a] as const));
const ALIAS_INDEX = new Map<string, CoreAreaDef>();
for (const area of CORE_AREAS) {
  ALIAS_INDEX.set(norm(area.tag), area);
  ALIAS_INDEX.set(norm(area.code), area);
  for (const alias of area.aliases) ALIAS_INDEX.set(norm(alias), area);
}

/** requirement item id → the area whose courses satisfy it. */
export const CORE_AREA_BY_REQUIREMENT: ReadonlyMap<string, CoreAreaDef> = new Map(
  CORE_AREAS.flatMap((a) => a.requirementIds.map((id) => [id, a] as const)),
);

/** Canonical area for anything a user/URL might call a Core area, or null. */
export function resolveCoreArea(input: string | null | undefined): CoreAreaDef | null {
  if (!input) return null;
  return ALIAS_INDEX.get(norm(input)) ?? null;
}

/** Canonical tag for an alias ("CNI" → "Cultures & Ideas"), or null if unknown. */
export function resolveCoreAreaTag(input: string | null | undefined): string | null {
  return resolveCoreArea(input)?.tag ?? null;
}

export function coreAreaDefForTag(tag: string): CoreAreaDef | null {
  return BY_TAG.get(norm(tag)) ?? null;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Regexes that recognise each area's NAME inside a bulletin sentence. */
const AREA_NAME_RE: Record<string, RegExp> = {
  "Critical Thinking & Writing": /\bCTW\b|critical thinking (?:and|&) writing/i,
  "Cultures & Ideas 3": /\b(?:C&I|cultures?\s*(?:and|&)\s*ideas)\s*(?:3|III)\b/i,
  "Cultures & Ideas": /\bC&I\b|\bcultures?\s*(?:and|&)\s*ideas\b/i,
  "Religion, Theology & Culture": /\bRTC\b|religion,? theology,? (?:and|&) culture/i,
  Mathematics: /\b(?:core|university)\b[^.]{0,60}\bmath(?:ematics)?\b|\bmath(?:ematics)?\b[^.]{0,40}\bcore\b/i,
  "Natural Science": /natural science/i,
  "Social Science": /social science/i,
  Arts: /\barts?\b(?=[^.]{0,30}\bcore\b)|\bcore\b[^.]{0,30}\barts?\b/i,
  Ethics: /\bethics\b/i,
  Diversity: /\bdiversity\b/i,
  "Civic Engagement": /civic engagement/i,
  "Second Language": /second language|2nd language/i,
  "Science, Technology & Society": /science,? technology,? (?:and|&) society|\bSTS\b/i,
  "Advanced Writing": /advanced writing/i,
  "Experiential Learning for Social Justice": /\bELSJ\b|experiential learning/i,
};

/** A sentence must speak about the CORE / a requirement, or it is not a designation. */
const CORE_MARKER_RE = /\bcore\b|\brequirements?\b|\buniversity\b|\bELSJ\b|\bC&I\b|\bCTW\b|\bSTS\b/i;
const POSITIVE_RE = /\b(satisf(?:y|ies|ied)|fulfil+s?|fulfilled|qualif(?:y|ies)\s+for|counts?\s+(?:for|as|toward|towards)|meets?\s+the|this\s+ELSJ\s+course)\b/i;
const NEGATIVE_RE = /\b(?:does\s+not|do\s+not|doesn['’]t|cannot|can\s?not|will\s+not|not\s+(?:satisfy|fulfil+|count|meet))\b|\bNOT\b/;
/** "Successful completion of CTW I (PHIL 1A) is a prerequisite for CTW II" — the course IS that sequence's first course. */
const SEQUENCE_RE = /successful completion of\s+(CTW|C&I)\s*I\b/i;

const OTHER_COURSE_CODE_RE = /\b[A-Z]{2,5}\s?\d{1,3}[A-Z]{0,2}\b/g;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\s*\|\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trimSnippet(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 160 ? `${one.slice(0, 157)}…` : one;
}

export interface DerivedCoreAreas {
  /** Tags the course carries, in a stable order. */
  areas: string[];
  /** Provenance of each tag. */
  sources: Record<string, CoreAreaTagSource>;
  /** For catalog_text tags, the bulletin sentence that states it. */
  evidence: Record<string, string>;
}

/** Core-area abbreviations that look like course codes ("CTW 1", "STS 2") but are not. */
const AREA_ABBREVIATION_RE = /^(?:CTW|STS|RTC|ELSJ|AW|CE|CI|C&I)\b/;

/**
 * True when the sentence names a course code other than this course's own.
 * Codes are matched in their ORIGINAL case (real codes are all-caps), so
 * ordinary words like "Ideas 3" are not mistaken for one.
 */
function sentenceMentionsOtherCourse(sentence: string, ownCode: string): boolean {
  const own = ownCode.toUpperCase().replace(/\s+/g, "");
  const matches: string[] = sentence.match(OTHER_COURSE_CODE_RE) ?? [];
  return matches.some(
    (m) => !AREA_ABBREVIATION_RE.test(m) && m.replace(/\s+/g, "") !== own,
  );
}

/**
 * Explicit designations (and explicit negations) stated in a course's own
 * bulletin title and description.
 */
function extractCatalogText(course: Pick<CourseEntry, "code" | "title" | "description">): {
  positive: Map<string, string>;
  negative: Set<string>;
} {
  const positive = new Map<string, string>();
  const negative = new Set<string>();
  const text = `${course.title ?? ""} || ${course.description ?? ""}`;

  // The scrape collapsed paired sequence courses into a title such as
  // "and 2A. Critical Thinking & Writing I and II" / "and 12A. Cultures &
  // Ideas I and II" — the title itself names the area.
  const title = course.title ?? "";
  if (/critical thinking (?:and|&) writing/i.test(title)) {
    positive.set("Critical Thinking & Writing", trimSnippet(title));
  } else if (/cultures?\s*(?:and|&)\s*ideas\s+I\b/i.test(title)) {
    positive.set("Cultures & Ideas", trimSnippet(title));
  }
  if (/\bcore advanced writing\b/i.test(title)) {
    positive.set("Advanced Writing", trimSnippet(title));
  }

  for (const sentence of splitSentences(text)) {
    // "Successful completion of CTW I (PHIL 1A) is a prerequisite for CTW II
    // (PHIL 2A)" — appears on the sequence's first course itself.
    const seq = SEQUENCE_RE.exec(sentence);
    if (seq) {
      const tag = /ctw/i.test(seq[1]!) ? "Critical Thinking & Writing" : "Cultures & Ideas";
      if (!positive.has(tag)) positive.set(tag, trimSnippet(sentence));
      continue;
    }

    if (!CORE_MARKER_RE.test(sentence)) continue;
    // "Students who take CLAS 21-23 can use CLAS 23 to satisfy…" is about a
    // different course — never attribute it to this one.
    if (sentenceMentionsOtherCourse(sentence, course.code)) continue;
    if (/\belectives?\b/i.test(sentence)) continue; // an elective toward a major/minor, not a Core designation

    const negated = NEGATIVE_RE.test(sentence);
    const positiveVerb = POSITIVE_RE.test(sentence);
    if (!negated && !positiveVerb) continue;

    // C&I 3 is a distinct requirement; check it before the generic C&I name.
    let matchedThree = false;
    if (AREA_NAME_RE["Cultures & Ideas 3"]!.test(sentence)) {
      matchedThree = true;
      if (negated) negative.add("Cultures & Ideas 3");
      else positive.set("Cultures & Ideas 3", trimSnippet(sentence));
    }

    for (const [tag, re] of Object.entries(AREA_NAME_RE)) {
      if (tag === "Cultures & Ideas 3") continue;
      if (tag === "Cultures & Ideas" && matchedThree) continue;
      if (!re.test(sentence)) continue;
      // "…except the Business School" limits WHO it counts for, not whether it
      // is a designation; those sentences stay positive.
      if (negated) negative.add(tag);
      else if (!positive.has(tag)) positive.set(tag, trimSnippet(sentence));
    }
  }

  return { positive, negative };
}

// ----- department/number heuristics (kept from the original tagger) --------

function heuristicAreas(c: Pick<CourseEntry, "code" | "title" | "department">): string[] {
  const dept = c.department.toUpperCase();
  const numMatch = c.code.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1]!, 10) : 0;
  const lower = num > 0 && num < 100;
  const upper = num >= 100;
  const title = c.title.toLowerCase();
  const tags: string[] = [];

  // Critical Thinking & Writing: ENGL 1A-2A
  if (dept === "ENGL" && num >= 1 && num <= 2) tags.push("Critical Thinking & Writing");
  // Advanced Writing: ENGL 100-level writing-tagged
  if (dept === "ENGL" && num >= 100 && /writing|composition|rhetoric/.test(title))
    tags.push("Advanced Writing");
  // Cultures & Ideas 1/2: HIST, CLAS, MDVL, ARTH lower division
  if (lower && ["HIST", "CLAS", "MDVL", "ARTH"].includes(dept)) tags.push("Cultures & Ideas");
  // Religion, Theology & Culture: RSOC, SCTR, TESP all levels
  if (["RSOC", "SCTR", "TESP"].includes(dept)) tags.push("Religion, Theology & Culture");
  // Ethics: PHIL ethics-tagged or any "ethics" in title
  if (dept === "PHIL" && /ethic/.test(title)) tags.push("Ethics");
  if (dept !== "PHIL" && /\bethics?\b/.test(title) && upper) tags.push("Ethics");
  // Civic Engagement: POLI 1-99
  if (dept === "POLI" && lower) tags.push("Civic Engagement");
  // Diversity: ETHN, WGST, courses with diversity/race/gender in title
  if (["ETHN", "WGST"].includes(dept)) tags.push("Diversity");
  if (/\b(diversity|race|racial|gender|queer|indigenous)\b/.test(title)) tags.push("Diversity");
  // Second language / global cultures
  if (["CHIN", "FREN", "GERM", "ITAL", "JAPN", "SPAN", "ARAB"].includes(dept))
    tags.push("Second Language");
  if (dept === "ANTH" && upper) tags.push("Global Cultures");
  // Natural Science: lower-div BIOL/CHEM/PHYS/ENVS
  if (lower && ["BIOL", "CHEM", "PHYS", "ENVS"].includes(dept)) tags.push("Natural Science");
  // Social Science: lower-div ECON/PSYC/SOCI/ANTH
  if (lower && ["ECON", "PSYC", "SOCI", "ANTH"].includes(dept)) tags.push("Social Science");
  // Arts
  if (["THTR", "MUSC", "ARTS", "DANC"].includes(dept)) tags.push("Arts");
  // Math: MATH 6-53
  if (dept === "MATH" && num >= 6 && num <= 53) tags.push("Mathematics");
  // Science, Technology & Society
  if (/\b(science.*society|technology.*society|sustainability)\b/.test(title))
    tags.push("Science, Technology & Society");
  // Pathways are too varied to infer — left to manual curation.
  return Array.from(new Set(tags));
}

/**
 * Every Core area a course carries, and why. Pure and deterministic — the
 * catalog is enriched once at load time.
 */
export function deriveCoreAreas(
  course: Pick<CourseEntry, "code" | "title" | "department" | "description"> & {
    coreAreas?: string[];
  },
): DerivedCoreAreas {
  const sources: Record<string, CoreAreaTagSource> = {};
  const evidence: Record<string, string> = {};

  // Tags already present in the source data are authoritative and stay as-is.
  for (const tag of course.coreAreas ?? []) sources[tag] = "catalog_text";

  const { positive, negative } = extractCatalogText(course);

  for (const [tag, sentence] of positive) {
    sources[tag] = "catalog_text";
    evidence[tag] = sentence;
  }
  for (const tag of heuristicAreas(course)) {
    if (sources[tag]) continue; // stated by the catalog — keep that provenance
    if (negative.has(tag)) continue; // the bulletin says it does NOT count
    sources[tag] = "heuristic";
  }

  const areas = CORE_AREAS.map((a) => a.tag).filter((t) => sources[t]);
  // Preserve any pre-existing tag that is not one of the known areas.
  for (const tag of Object.keys(sources)) if (!areas.includes(tag)) areas.push(tag);

  return { areas, sources, evidence };
}
