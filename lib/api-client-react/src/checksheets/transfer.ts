/**
 * "Add to planning": the rules for taking something from a student's Degree Checksheet into
 * their Planning Requirements, shared by the web app and the mobile app so both decide exactly
 * the same way. Pure functions; the saving itself goes through the ordinary plan
 * customization endpoints (a My Note, or a My requirement), never a second notes system.
 *
 * Everything here is deterministic on purpose. A requirement is preselected only when a course
 * code written in the text belongs to exactly one requirement of the selected plan; nothing is
 * matched by similarity, and no AI is involved.
 */

/** Longest My Note the server keeps (routes/requirement-customizations.ts). */
export const PLANNING_NOTE_MAX = 600;
/** Longest title of a My requirement the server keeps. */
export const PLANNING_TITLE_MAX = 160;

const COURSE_CODE = /\b([A-Za-z]{2,5})\s?(\d{1,3}[A-Za-z]{0,2})\b/g;
const normalizeCode = (code: string) => code.toUpperCase().replace(/\s+/g, " ").trim();

/** The course codes written in a piece of text (BIOL 1A, MATH 11), as written. */
export function courseCodesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(COURSE_CODE)) out.add(normalizeCode(`${m[1]} ${m[2]}`));
  return [...out];
}

/** What a requirement needs to be a target: its key and its courses. */
export interface TransferCandidate<T extends { stableKey?: string | null; id: string; courses: string[] }> {
  item: T;
  groupId: string;
  groupTitle: string;
}

/**
 * The requirement a piece of text belongs to, when it can be known for certain: the course
 * codes it names belong to ONE requirement, and no other requirement lists any of them.
 * Otherwise null, and the student chooses.
 */
export function reliableTarget<T extends { stableKey?: string | null; id: string; courses: string[] }>(
  text: string,
  candidates: TransferCandidate<T>[],
): { candidate: TransferCandidate<T>; code: string } | null {
  const codes = courseCodesIn(text);
  if (codes.length === 0) return null;
  const hits = new Map<string, { candidate: TransferCandidate<T>; code: string }>();
  for (const candidate of candidates) {
    const own = candidate.item.courses.map(normalizeCode);
    const code = codes.find((c) => own.includes(c));
    if (code) hits.set(candidate.item.stableKey ?? candidate.item.id, { candidate, code });
  }
  return hits.size === 1 ? [...hits.values()][0]! : null;
}

/** The requirements of a plan a note can be added to: source requirements (a My requirement is edited where it is). */
export function transferCandidates<
  G extends { id: string; title: string; items: { stableKey?: string | null; id: string; courses: string[]; customization?: { kind: string } | null }[] },
>(groups: G[] | undefined): TransferCandidate<G["items"][number]>[] {
  return (groups ?? []).flatMap((group) =>
    group.items
      .filter((item) => !!item.stableKey && item.customization?.kind !== "custom")
      .map((item) => ({ item, groupId: group.id, groupTitle: group.title })),
  );
}

/** Text as the server stores it (spaces collapsed), for comparing a draft with a saved note. */
const sameWords = (text: string) => text.replace(/[ \t]+/g, " ").trim().toLowerCase();

/** An obvious exact duplicate: these words are already in the requirement's My Note. */
export function isDuplicateNote(existingNote: string | null | undefined, draft: string): boolean {
  const words = draft.trim();
  return !!existingNote && !!words && sameWords(existingNote).includes(sameWords(words));
}

/** The note that will be saved: added to the existing My Note, or replacing it. */
export function mergedNote(existingNote: string | null | undefined, draft: string, choice: "append" | "replace"): string {
  const words = draft.trim();
  return existingNote && choice === "append" ? `${existingNote}\n${words}` : words;
}

/** Search the candidates by label, group or course code (plain substring, the student's own words). */
export function filterCandidates<T extends { label: string; courses: string[]; stableKey?: string | null; id: string }>(
  candidates: TransferCandidate<T>[],
  query: string,
): TransferCandidate<T>[] {
  const q = query.trim().toLowerCase();
  return q ? candidates.filter((c) => `${c.item.label} ${c.groupTitle} ${c.item.courses.join(" ")}`.toLowerCase().includes(q)) : candidates;
}

/**
 * How a plan is named wherever a page says which plan something belongs to ("Compare
 * against", "Saved to ..."): "Degree Plan", or "Tentative Degree Plan — <name>". One wording,
 * so a student never wonders whether "Biology" and "Tentative Degree Plan — Biology" differ.
 */
export function planContextLabel(plan: { name: string; planType: string }): string {
  if (plan.planType === "degree") return "Degree Plan";
  return /tentative degree plan/i.test(plan.name) ? plan.name : `Tentative Degree Plan — ${plan.name}`;
}
