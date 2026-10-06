/**
 * Reads a College of Arts and Sciences first-year course plan (a Word document
 * from the department: "Major: Biology (BIOL)" then one or more Fall / Winter /
 * Spring grids labelled "Option One", "Option Two"...) into sample plan
 * candidates.
 *
 * Nothing is interpreted. A grid cell that is exactly one course code becomes a
 * course; any other cell ("CHEM 11, 14, Core or Elective", "C&I 2") becomes a
 * placeholder carrying the cell's own wording, because the department is
 * offering a choice and CampusVal must not pick for the student.
 */
import type { DocBlock, DocTableCell } from "../checksheets/model";
import type { SampleItemInput } from "./validate";

export interface CasPlanCandidate {
  program: string;
  /** "Option One (Ideal Option)", or "Option 2" when the labels could not be paired with the grids. */
  optionLabel: string;
  optionIndex: number;
  items: SampleItemInput[];
}

const COURSE_CODE = /^[A-Z]{2,5} ?\d{1,3}[A-Z]{0,2}$/;
/** Core abbreviations that look like a course code but are University Core areas (CTW 1, RTC 1). */
const CORE_ABBREVIATION = /^(CTW|RTC|CI|CNI|ELSJ|STS) ?\d/;
const textOf = (runs: { text: string }[]): string => runs.map((r) => r.text).join("").replace(/\s+/g, " ").trim();
const TERMS: Record<string, string> = { fall: "fall", winter: "winter", spring: "spring" };

export function parseCasCoursePlan(blocks: readonly DocBlock[]): { program: string | null; plans: CasPlanCandidate[]; problems: string[] } {
  const problems: string[] = [];
  let program: string | null = null;
  const labels: string[] = [];
  const grids: DocTableCell[][][] = [];
  for (const block of blocks) {
    if (block.type === "paragraph" || block.type === "heading") {
      const text = textOf(block.runs);
      const major = text.match(/^Major:\s*(.+?)\s*(?:\([A-Z]{2,6}\))?\s*$/i);
      if (major && !program) program = major[1]!.trim();
      if (/^Option\s+\w+/i.test(text)) labels.push(text);
    } else if (block.type === "table") {
      const header = block.rows[0]?.map((c) => textOf(c.runs).toLowerCase()).filter(Boolean) ?? [];
      if (header.length >= 3 && header.every((h) => h in TERMS)) grids.push(block.rows);
    }
  }
  if (grids.length === 0) problems.push("no Fall / Winter / Spring grid found");
  const paired = labels.length === grids.length;
  if (grids.length > 0 && !paired) problems.push(`${labels.length} option labels for ${grids.length} grids; the grids are numbered instead`);

  const plans = grids.map((rows, index): CasPlanCandidate => {
    const columns = rows[0]!.map((c) => TERMS[textOf(c.runs).toLowerCase()] ?? null);
    const items: SampleItemInput[] = [];
    for (const row of rows.slice(1)) {
      row.forEach((cell, col) => {
        const term = columns[col];
        const text = textOf(cell.runs);
        if (!term || !text) return;
        items.push(
          COURSE_CODE.test(text.toUpperCase()) && !CORE_ABBREVIATION.test(text.toUpperCase())
            ? { year: 1, term, itemType: "course", courseCode: text.toUpperCase().replace(/^([A-Z]+)(\d)/, "$1 $2") }
            : { year: 1, term, itemType: "placeholder", label: text },
        );
      });
    }
    return { program: program ?? "", optionLabel: paired ? labels[index]! : `Option ${index + 1}`, optionIndex: index + 1, items };
  });
  return { program, plans, problems };
}
