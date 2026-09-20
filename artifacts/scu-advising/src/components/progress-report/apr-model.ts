/**
 * Pure view-model for the Academic Progress Report. Both the planning
 * sidebar (WorkdayAprPanel) and the APR page (ReportCard) render through this
 * so they can never drift: same section order, same tallies, same review
 * rules, same states.
 *
 * Nothing here decides whether the student "completed" anything. It only
 * re-presents the parser's status for each row (which itself only says
 * `completed` on an affirmative Workday signal) and routes anything unclear
 * to "needs review".
 */
import type {
  ParsedProgressReport,
  ParsedProgressReportGroupsItem,
  ParsedProgressReportGroupsItemRequirementsItem,
  ProgressReport,
  ProgressReportEnvelope,
} from "@workspace/api-client-react";

export type AprGroup = ParsedProgressReportGroupsItem;
export type AprRequirement = ParsedProgressReportGroupsItemRequirementsItem;
export type AprStatus = AprRequirement["status"];
export type AprSectionKind = "core" | "college" | "major" | "minor" | "other";

/** Display order — the order most useful for course planning. Names inside stay the document's own. */
export const SECTION_ORDER: readonly AprSectionKind[] = ["core", "college", "major", "minor", "other"];

export const SECTION_LABEL: Record<AprSectionKind, string> = {
  core: "University Core",
  college: "School / College Core",
  major: "Major",
  minor: "Minor",
  other: "Other requirements",
};

/** A group as displayed: the parser's group, or a section assembled by `regroupForDisplay`. */
export type DisplayGroup = AprGroup & { section?: AprSectionKind };

/** Same rule as the server's classifyGroupKind — used only for reports stored before `kind` existed. */
export function kindOfGroup(group: DisplayGroup): AprSectionKind {
  if (group.section) return group.section;
  if (group.kind) return group.kind;
  if (/\bcore\b/i.test(group.name)) return "core";
  if (/\bminor\b/i.test(group.name)) return "minor";
  if (/\bmajor\b/i.test(group.name)) return "major";
  return "other";
}

export interface IndexedGroup {
  group: AprGroup;
  /** Index in the ORIGINAL groups array — stable across filtering and reordering. */
  index: number;
  kind: AprSectionKind;
}

/**
 * Groups in display order: Core → Major → Minor → Other, and within each kind
 * in the order the document printed them.
 */
export function orderGroups(groups: readonly DisplayGroup[]): IndexedGroup[] {
  const indexed = groups.map((group, index) => ({ group, index, kind: kindOfGroup(group) }));
  return SECTION_ORDER.flatMap((kind) =>
    indexed
      .filter((g) => g.kind === kind)
      .sort((a, b) => (a.group.order ?? a.index) - (b.group.order ?? b.index)),
  );
}

/** Rows Workday repeats under every program ("University Requirement: ..."). */
export const isUniversityRow = (r: AprRequirement): boolean => r.scope === "university";

/** A requirement that is not yet satisfied — what the student "still needs". */
export const isStillNeeded = (r: AprRequirement): boolean => r.status !== "completed";

export type StatusFilter = "all" | "needed";

/** Program-scoped rows only: the university-wide rows are presented once, in their own section. */
export function programRows(group: DisplayGroup): AprRequirement[] {
  return group.requirements.filter((r) => !isUniversityRow(r));
}

export interface Tally {
  completed: number;
  in_progress: number;
  remaining: number;
  needs_review: number;
  total: number;
}

export function tallyRows(rows: readonly AprRequirement[]): Tally {
  const t: Tally = { completed: 0, in_progress: 0, remaining: 0, needs_review: 0, total: rows.length };
  for (const r of rows) t[r.status] += 1;
  return t;
}

/** Tally over every program-scoped requirement in the report. */
export function tallyGroups(groups: readonly AprGroup[]): Tally {
  return tallyRows(groups.flatMap(programRows));
}

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Workday prints the University Core rows ("Core: LSB: CTW 1") and a school's
 * own Core rows ("Leavey School of Business Core Knowledge: ...") INSIDE a
 * program block, not under a heading of their own. Two things follow, both
 * seen on a real report:
 *
 *  - Blocks in the SAME school repeat the same rows, so a second major would
 *    show (and tally) every Core row twice.
 *  - A major in a DIFFERENT school brings that school's own Core rows
 *    ("Core: CAS: CTW 1" beside "Core: LSB: CTW 1") — a different curriculum,
 *    not a duplicate, so the two must never be merged.
 *
 * This pulls the Core rows out of the program blocks into one group per Core
 * tag Workday printed (University Core (LSB), University Core (CAS)) and one
 * group per school, each row once.
 *
 * Rows are de-duplicated on name AND status: if two blocks ever disagreed about
 * the same row, both are kept rather than one being quietly chosen. Reports
 * whose rows carry no `category` (older parses, simpler layouts) pass through
 * untouched. Idempotent.
 */
export function regroupForDisplay(groups: readonly AprGroup[]): DisplayGroup[] {
  if (!groups.some((g) => g.requirements.some((r) => r.category))) return [...groups];

  const cores = new Map<string, { name: string; seen: Set<string>; rows: AprRequirement[]; order: number }>();
  const colleges = new Map<string, { name: string; seen: Set<string>; rows: AprRequirement[] }>();
  const rest: DisplayGroup[] = [];
  const collegeOrder = new Map<string, number>();

  for (const g of groups) {
    const keep: AprRequirement[] = [];
    for (const r of g.requirements) {
      const key = `${normName(r.name)}|${r.status}`;
      if (r.category === "core") {
        // "Core: LSB: CTW 1" → tag "LSB". A row without a tag still gets a group.
        const tag = /^Core:\s*([^:]+):/i.exec(r.name)?.[1]?.trim();
        const ck = tag ? normName(tag) : "";
        let entry = cores.get(ck);
        if (!entry) {
          entry = {
            name: tag ? `University Core (${tag})` : "University Core",
            seen: new Set(),
            rows: [],
            order: Number.POSITIVE_INFINITY,
          };
          cores.set(ck, entry);
        }
        entry.order = Math.min(entry.order, r.order ?? Number.POSITIVE_INFINITY);
        if (!entry.seen.has(key)) {
          entry.seen.add(key);
          entry.rows.push(r);
        }
      } else if (r.category === "college") {
        const school = /^(.*?\bCore)\b/.exec(r.name)?.[1]?.trim() ?? "School Core";
        const sk = normName(school);
        let entry = colleges.get(sk);
        if (!entry) {
          entry = { name: school, seen: new Set(), rows: [] };
          colleges.set(sk, entry);
        }
        collegeOrder.set(sk, Math.min(collegeOrder.get(sk) ?? Number.POSITIVE_INFINITY, r.order ?? Number.POSITIVE_INFINITY));
        if (!entry.seen.has(key)) {
          entry.seen.add(key);
          entry.rows.push(r);
        }
      } else {
        keep.push(r);
      }
    }
    if (keep.length > 0) rest.push({ ...g, requirements: keep });
  }

  const out: DisplayGroup[] = [];
  for (const entry of cores.values()) {
    out.push({
      name: entry.name,
      kind: "core",
      section: "core",
      order: Number.isFinite(entry.order) ? entry.order : undefined,
      requirements: entry.rows,
    });
  }
  for (const [sk, entry] of colleges) {
    const order = collegeOrder.get(sk);
    out.push({
      name: entry.name,
      kind: "other",
      section: "college",
      order: Number.isFinite(order) ? order : undefined,
      requirements: entry.rows,
    });
  }
  return [...out, ...rest];
}

/**
 * The university-wide rows, each ONCE (Workday repeats them under every
 * program), excluding the unit rows, which have their own section.
 */
export function universityRows(groups: readonly AprGroup[]): AprRequirement[] {
  const seen = new Set<string>();
  const out: AprRequirement[] = [];
  for (const g of groups) {
    for (const r of g.requirements) {
      if (!isUniversityRow(r) || r.unit) continue;
      const key = normName(r.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

export interface CourseRef {
  code: string;
  title: string;
}

/** Completed and in-progress courses the APR lists — codes and titles only, never grades. */
export function courseLists(parsed: ParsedProgressReport): { completed: CourseRef[]; inProgress: CourseRef[] } {
  return {
    completed: parsed.completedCourses.map((c) => ({ code: c.code, title: c.title })),
    inProgress: (parsed.nonCompletedCourses ?? [])
      .filter((c) => c.status === "in_progress")
      .map((c) => ({ code: c.code, title: c.title })),
  };
}

export interface ReviewItem {
  /** Human label for where it came from. */
  where: string;
  name: string;
  /** The source line, when the server sent it (full view only). */
  sourceText?: string;
}

export interface ReviewSummary {
  items: ReviewItem[];
  /** Course-like tokens the parser could not match to the catalog. */
  unrecognized: string[];
  count: number;
}

/**
 * Everything the student should verify against Workday: rows the parser could
 * not classify, courses it could not match to the catalog, and rows whose
 * nested course is not in the catalog.
 */
export function reviewSummary(parsed: ParsedProgressReport): ReviewSummary {
  const items: ReviewItem[] = [];
  // Regrouped so a repeated Core row that needs review is listed once, not once per program.
  for (const g of regroupForDisplay(parsed.groups ?? [])) {
    for (const r of g.requirements) {
      if (r.status === "needs_review") {
        items.push({ where: g.name, name: r.name, sourceText: (r as { sourceText?: string }).sourceText });
      }
    }
  }
  const unrecognized = parsed.possibleCourses.map((c) => c.raw);
  return { items, unrecognized, count: items.length + unrecognized.length };
}

export function filterGroupsForView(
  groups: readonly IndexedGroup[],
  filter: StatusFilter,
): IndexedGroup[] {
  if (filter === "all") return groups.map((g) => ({ ...g }));
  return groups
    .map((g) => ({
      ...g,
      group: { ...g.group, requirements: g.group.requirements.filter(isStillNeeded) },
    }))
    .filter((g) => programRows(g.group).length > 0);
}

// ---------------------------------------------------------------------------
// State machine for the planning panel and the APR page header
// ---------------------------------------------------------------------------

export type AprViewState =
  | { kind: "loading" }
  | { kind: "storage_unavailable" }
  | { kind: "none" }
  | { kind: "unauthorized" }
  | { kind: "error" }
  | { kind: "pending"; report: ProgressReport }
  | { kind: "failed"; report: ProgressReport }
  | { kind: "unsupported"; report: ProgressReport }
  /** Parsed, but nothing structured could be read from it. */
  | { kind: "no_structure"; report: ProgressReport }
  | {
      kind: "ready";
      report: ProgressReport;
      parsed: ParsedProgressReport;
      reviewCount: number;
      /** The structured data is fine, but the original file can no longer be read from storage. */
      sourceMissing: boolean;
    };

/** Status code carried by a react-query / fetch error, if any. */
export function errorStatus(error: unknown): number | undefined {
  const s = (error as { status?: unknown } | null | undefined)?.status;
  return typeof s === "number" ? s : undefined;
}

/**
 * The one place that decides which state to show. `error` is the query error;
 * a 404 from GET /progress-report means "nothing uploaded yet", 401/403 mean
 * the viewer isn't allowed, anything else is a load failure.
 */
export function deriveAprState(input: {
  isLoading: boolean;
  envelope: ProgressReportEnvelope | null | undefined;
  error: unknown;
}): AprViewState {
  const { isLoading, envelope, error } = input;
  const status = errorStatus(error);

  if (status === 404) return { kind: "none" };
  if (status === 401 || status === 403) return { kind: "unauthorized" };
  if (isLoading && !envelope) return { kind: "loading" };
  if (error && !envelope) return { kind: "error" };
  if (!envelope) return { kind: "loading" };
  if (!envelope.available) return { kind: "storage_unavailable" };

  const report = envelope.report;
  if (!report) return { kind: "none" };

  switch (report.parseStatus) {
    case "pending":
      return { kind: "pending", report };
    case "failed":
      return { kind: "failed", report };
    case "unsupported":
      return { kind: "unsupported", report };
    default: {
      // "parsed" — or a payload that omits the status but carries a parse.
      const parsed = report.parsed;
      const hasStructure =
        !!parsed &&
        ((parsed.groups?.length ?? 0) > 0 ||
          (parsed.completedCourses?.length ?? 0) > 0 ||
          (parsed.nonCompletedCourses?.length ?? 0) > 0);
      if (!parsed || !hasStructure) return { kind: "no_structure", report };
      return {
        kind: "ready",
        report,
        parsed,
        reviewCount: reviewSummary(parsed).count,
        sourceMissing: report.sourceFile === "missing",
      };
    }
  }
}
