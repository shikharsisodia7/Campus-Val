/**
 * Pure text helpers for reading the Undergraduate Bulletin's requirement sections (used by
 * scripts/diff-bulletin-source.ts). A proofreading aid: they read only what the text states.
 */

export const entities = (s: string) =>
  s
    .replace(/&nbsp;|\u00A0/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

/** The page as lines; headings become "#2 Title" / "#3 Title". */
export function pageLines(html: string): string[] {
  const body = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  const text = body
    .replace(/<h([1-6])[^>]*>/gi, (_, n: string) => `\n#${n} `)
    .replace(/<\/(p|li|h[1-6]|div|tr|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return entities(text)
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const START = /^#[23] .*(requirements for the major|requirements for the bachelor|major in |bachelor of (science|arts) in)/i;
const STOP = /^#[23] .*(requirements for the minor|minor in |lower-division courses|upper-division courses|courses$|emphas|concentration|requirements for the major|bachelor of)/i;

/** The requirement sections of a page: [heading, lines]. */
export function majorSections(lines: string[]): { heading: string; lines: string[] }[] {
  const out: { heading: string; lines: string[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!START.test(lines[i]!)) continue;
    const section: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !STOP.test(lines[j]!) && !/^#2 /.test(lines[j]!); j++) section.push(lines[j]!);
    out.push({ heading: lines[i]!.replace(/^#\d /, ""), lines: section });
    i = j - 1;
  }
  return out;
}

/**
 * Every course code a requirement text can be read as naming, line by line: a code counts as named when
 * its subject and its number (with any letter suffix) appear as words on the same line ("CHEM 101, 111,
 * 141" names CHEM 141; "ARTS 74 or 174" names ARTS 174). With `defaultSubject`, a line's bare numbers
 * are also read in that subject ("Cell and Molecular Biology (CMB): 110, 112"). Loose on purpose: it is a
 * check that nothing was invented, not a parser of the Bulletin's grammar.
 */
export function codesNamedIn(lines: readonly string[], defaultSubject?: string): Set<string> {
  const out = new Set<string>();
  for (const raw of lines) {
    const line = raw
      .replace(/\b(\d{1,3})([A-Z])&([A-Z])\b/g, "$1$2 $1$3") // "177A&B"
      .replace(/\b(\d{1,3})([A-Z])[-–]([A-Z])\b/g, (_, n: string, a: string, b: string) => {
        // "197B-D" -> 197B 197C 197D
        const letters: string[] = [];
        for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) letters.push(`${n}${String.fromCharCode(c)}`);
        return letters.join(" ");
      })
      .replace(/\bMath\b/g, "MATH")
      .replace(/\bSpanish\b/g, "SPAN");
    const subjects = new Set([...line.matchAll(/\b([A-Z]{3,4})\b/g)].map((m) => m[1]!));
    if (defaultSubject) subjects.add(defaultSubject);
    const numbers = [...line.matchAll(/(?<![\w.])(\d{1,3}[A-Z]{0,3})(?![\w])/g)].map((m) => m[1]!);
    for (const subject of subjects) for (const n of numbers) out.add(`${subject} ${n}`);
  }
  return out;
}

/** Course codes the text states with their subject; bare-number lists are counted, not attributed. */
export function codesIn(text: string): { codes: string[]; unattributedLists: number } {
  const codes: string[] = [];
  const seq = /\b([A-Z]{3,4})\s+(\d{1,3}[A-Z]{0,3})((?:\s*(?:,|\bor\b|\band\b|&|\/)\s*(?:and\s+|or\s+)?\d{1,3}[A-Z]{0,3}\b)*)/g;
  for (const m of text.matchAll(seq)) {
    const subject = m[1]!;
    if (/^(GPA|ACT|SAT|AP|IB|THE|AND|FOR)$/.test(subject)) continue;
    codes.push(`${subject} ${m[2]!}`);
    for (const n of (m[3] ?? "").matchAll(/\d{1,3}[A-Z]{0,3}/g)) codes.push(`${subject} ${n[0]}`);
  }
  const unattributedLists = [...text.matchAll(/(?:^|[:;]\s*)\d{2,3}[A-Z]{0,3}(?:\s*,\s*\d{2,3}[A-Z]{0,3}){2,}/gm)].length;
  return { codes: [...new Set(codes)], unattributedLists };
}

