/**
 * Turns one spreadsheet cell value into the text Excel would have displayed.
 *
 * Rules that matter for an untrusted file:
 *   - a formula is NEVER evaluated and its source is never shown; only the
 *     value Excel cached in the file is used (and "" when there is none);
 *   - a hyperlink contributes its visible text only, never a link;
 *   - the result is plain text. It is escaped by React when rendered and is
 *     never treated as markup anywhere.
 */

export interface RawCell {
  value: unknown;
  numFmt?: string | null;
}

export interface CellText {
  text: string;
  /** A formula with no cached value: shown blank rather than computed. */
  formulaWithoutValue: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

function isDateFormat(numFmt: string): boolean {
  // Strip quoted literals and colour/condition blocks, then look for date tokens.
  const bare = numFmt.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  return /[dy]|m{1,4}|h{1,2}|s{1,2}/i.test(bare) && !/[0#?]/.test(bare);
}

function formatDate(d: Date, numFmt: string | null | undefined): string {
  if (Number.isNaN(d.getTime())) return "";
  // Excel serial dates carry no zone; ExcelJS surfaces them as UTC instants.
  const date = `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;
  const hasClock = d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() > 0;
  const wantsClock = !!numFmt && /h/i.test(numFmt);
  if (!hasClock && !wantsClock) return date;
  const h24 = d.getUTCHours();
  const clock = `${pad(h24 % 12 || 12)}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h24 >= 12 ? "PM" : "AM"}`;
  return hasClock || wantsClock ? `${date} ${clock}` : date;
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatNumber(n: number, numFmt: string | null | undefined): string {
  if (!Number.isFinite(n)) return "";
  const fmt = (numFmt ?? "").split(";")[0]!.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  if (!fmt || /^general$/i.test(fmt.trim()) || fmt.trim() === "@") {
    // Excel's General shows up to ~11 significant digits without trailing zeros.
    return String(Number(n.toPrecision(11)));
  }
  const percent = fmt.includes("%");
  const value = percent ? n * 100 : n;
  const decimals = /\.([0#?]+)/.exec(fmt)?.[1];
  const fixedDecimals = decimals ? (decimals.match(/0/g) ?? []).length : 0;
  const maxDecimals = decimals ? decimals.length : 0;
  let out = value.toFixed(maxDecimals);
  if (maxDecimals > fixedDecimals && out.includes(".")) {
    // "#" places are optional: trim zeros beyond the mandatory "0" places.
    const [i, f = ""] = out.split(".");
    const trimmed = f.replace(/0+$/, "").padEnd(fixedDecimals, "0");
    out = trimmed ? `${i}.${trimmed}` : i!;
  }
  if (/[#0],[#0]/.test(fmt)) {
    const negative = out.startsWith("-");
    const [i, f] = (negative ? out.slice(1) : out).split(".");
    out = `${negative ? "-" : ""}${groupThousands(i!)}${f !== undefined ? `.${f}` : ""}`;
  }
  return percent ? `${out}%` : out;
}

function primitiveText(value: unknown, numFmt: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return formatDate(value, numFmt);
  if (typeof value === "number") {
    return numFmt && isDateFormat(numFmt) ? formatDate(excelSerialToDate(value), numFmt) : formatNumber(value, numFmt);
  }
  return "";
}

function excelSerialToDate(serial: number): Date {
  // Excel's day 25569 is 1970-01-01 (1900 date system).
  return new Date(Math.round((serial - 25569) * 86_400_000));
}

export function cellDisplayText(cell: RawCell): CellText {
  const v = cell.value;
  if (v === null || v === undefined) return { text: "", formulaWithoutValue: false };

  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    // Formula / shared formula: the cached result only.
    if ("formula" in o || "sharedFormula" in o) {
      const result = o["result"];
      if (result === undefined || result === null) return { text: "", formulaWithoutValue: true };
      if (typeof result === "object" && !(result instanceof Date)) {
        const err = (result as Record<string, unknown>)["error"];
        return { text: typeof err === "string" ? err : "", formulaWithoutValue: false };
      }
      return { text: primitiveText(result, cell.numFmt), formulaWithoutValue: false };
    }
    if (Array.isArray(o["richText"])) {
      const text = (o["richText"] as Array<{ text?: unknown }>)
        .map((run) => (typeof run.text === "string" ? run.text : ""))
        .join("");
      return { text, formulaWithoutValue: false };
    }
    if ("hyperlink" in o) {
      const t = o["text"];
      const text =
        typeof t === "string"
          ? t
          : t && typeof t === "object" && Array.isArray((t as { richText?: unknown }).richText)
            ? ((t as { richText: Array<{ text?: unknown }> }).richText)
                .map((run) => (typeof run.text === "string" ? run.text : ""))
                .join("")
            : "";
      return { text, formulaWithoutValue: false };
    }
    if (typeof o["error"] === "string") return { text: o["error"], formulaWithoutValue: false };
    return { text: "", formulaWithoutValue: false };
  }

  return { text: primitiveText(v, cell.numFmt), formulaWithoutValue: false };
}

/** Control characters (other than tab/newline) have no business in displayed text. */
export function cleanCellText(text: string, maxLength: number): { text: string; truncated: boolean } {
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  if (cleaned.length <= maxLength) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, maxLength), truncated: true };
}
