/**
 * The value a workbook STORED for each formula cell.
 *
 * A spreadsheet saves a formula together with the result it last showed. That
 * stored result is what a reader should display; nothing is calculated here
 * and no formula is ever evaluated.
 *
 * This exists because the workbook library loses some stored results: it
 * reports a formula whose stored result is `0` (or an empty string) as having
 * no result at all. A total of zero units then looks like a cell nobody
 * calculated. The stored result is read from the file itself, for the formula
 * cells only.
 *
 * What is read is the `<v>` element of a `<c>` that has an `<f>`: a number, a
 * string, a boolean or an error code. The formula's text is not kept.
 */
import JSZip from "jszip";

export type StoredValue = string | number | boolean | { error: string };

/** Sheet name -> cell address ("N28") -> what the file stored for that formula. */
export type FormulaCache = Map<string, Map<string, StoredValue>>;

/** Sheets larger than this are not searched; their formulas keep the library's answer. */
const MAX_SHEET_XML_BYTES = 40 * 1024 * 1024;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlText(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name] ?? whole;
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

const attribute = (tag: string, name: string): string | null => {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return match ? decodeXmlText(match[1]!) : null;
};

/** The stored results of one worksheet's formula cells. */
export function storedFormulaValues(sheetXml: string): Map<string, StoredValue> {
  const values = new Map<string, StoredValue>();
  // A cell is <c ...>...</c>; cells do not nest. Self-closing cells hold nothing.
  const cells = /<c\s([^>]*[^/])>([\s\S]*?)<\/c>/g;
  let match: RegExpExecArray | null;
  while ((match = cells.exec(sheetXml))) {
    const body = match[2]!;
    if (!/<f[\s>/]/.test(body)) continue;
    const address = attribute(match[1]!, "r");
    const stored = /<v>([\s\S]*?)<\/v>/.exec(body);
    if (!address || !stored) continue;
    const raw = decodeXmlText(stored[1]!);
    const type = attribute(match[1]!, "t") ?? "n";
    if (type === "n") {
      const n = Number(raw);
      if (raw.trim() !== "" && Number.isFinite(n)) values.set(address, n);
    } else if (type === "b") {
      values.set(address, raw === "1");
    } else if (type === "e") {
      values.set(address, { error: raw });
    } else if (type === "str") {
      values.set(address, raw);
    }
    // "s" (a shared string) is not something a formula's result is stored as.
  }
  return values;
}

/**
 * Every worksheet's stored formula results. Never throws: a file this cannot
 * read gives an empty cache, and the library's own answer stands.
 */
export async function readFormulaCache(buf: Buffer): Promise<FormulaCache> {
  const cache: FormulaCache = new Map();
  try {
    const zip = await JSZip.loadAsync(buf);
    const workbook = await zip.file("xl/workbook.xml")?.async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    if (!workbook || !rels) return cache;

    const targets = new Map<string, string>();
    for (const rel of rels.match(/<Relationship\s[^>]*>/g) ?? []) {
      const id = attribute(rel, "Id");
      const target = attribute(rel, "Target");
      if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    }

    for (const sheet of workbook.match(/<sheet\s[^>]*>/g) ?? []) {
      const name = attribute(sheet, "name");
      const target = targets.get(attribute(sheet, "r:id") ?? "");
      const entry = target ? zip.file(target) : null;
      if (!name || !entry) continue;
      const xml = await entry.async("string");
      if (xml.length > MAX_SHEET_XML_BYTES) continue;
      const values = storedFormulaValues(xml);
      if (values.size > 0) cache.set(name, values);
    }
  } catch {
    return new Map();
  }
  return cache;
}
