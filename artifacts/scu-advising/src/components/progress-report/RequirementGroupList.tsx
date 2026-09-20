import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Circle, HelpCircle } from "lucide-react";
import type { ParsedProgressReportGroupsItem } from "@workspace/api-client-react";
import {
  SECTION_LABEL,
  filterGroupsForView,
  isStillNeeded,
  orderGroups,
  programRows,
  tallyRows,
  type AprSectionKind,
  type IndexedGroup,
  type StatusFilter,
} from "./apr-model";

type RequirementStatus =
  ParsedProgressReportGroupsItem["requirements"][number]["status"];

/**
 * Status is ALWAYS conveyed by an icon and a text label — color only
 * reinforces it (accessibility: never color alone).
 */
export const STATUS_META: Record<
  RequirementStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  remaining: {
    label: "Remaining",
    icon: Circle,
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  needs_review: {
    label: "Verify in Workday",
    icon: HelpCircle,
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
};

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 shrink-0 text-[10px] ${meta.className}`}
      data-testid="badge-requirement-status"
    >
      <Icon className="h-3 w-3" aria-hidden="true" /> {meta.label}
    </Badge>
  );
}

/**
 * Renders the Workday-derived requirement hierarchy: groups named after the
 * student's own declared program (never a hardcoded Core/College/Major/Minor
 * taxonomy), each with its requirement rows and any nested courses. Shared
 * across the dedicated Academic Progress Report page and the Degree
 * Plan / Tentative Degree Plan / Quarter Plan reference columns so the
 * presentation never diverges.
 */
export function RequirementGroupList({
  groups,
  defaultOpen = "all",
  showGrades = true,
  groupBySection = false,
  hideUniversityRows = false,
  statusFilter = "all",
  showSourceText = false,
}: {
  groups: ParsedProgressReportGroupsItem[];
  /**
   * "all" for the dedicated page; "none" for a fully collapsed list;
   * "needed" opens only the groups that still have something outstanding —
   * the "what do I still need?" view.
   */
  defaultOpen?: "all" | "none" | "needed";
  /**
   * The professor was explicit: the Degree Plan / Quarter Plan APR sidebar
   * is a completion benchmark, not a grade report, and must not clutter that
   * with per-course grades. Pass `showGrades={false}` for sidebar placements
   * and for the APR page's default view.
   */
  showGrades?: boolean;
  /** Reorder Core → Major → Minor → Other and label each section. */
  groupBySection?: boolean;
  /** Omit the university-wide rows (shown once in their own section instead). */
  hideUniversityRows?: boolean;
  /** "needed" hides rows already completed. */
  statusFilter?: StatusFilter;
  /** Show the report's own line for rows that need review (full view only). */
  showSourceText?: boolean;
}) {
  if (groups.length === 0) return null;

  const original: IndexedGroup[] = groups.map((group, index) => ({
    group,
    index,
    kind: "other" as AprSectionKind,
  }));
  const ordered = groupBySection ? orderGroups(groups) : original;
  const visible = filterGroupsForView(ordered, statusFilter);

  const rowsOf = (g: ParsedProgressReportGroupsItem) =>
    hideUniversityRows ? programRows(g) : g.requirements;

  const openValues =
    defaultOpen === "all"
      ? visible.map((g) => `group-${g.index}`)
      : defaultOpen === "needed"
        ? visible.filter((g) => rowsOf(g.group).some(isStillNeeded)).map((g) => `group-${g.index}`)
        : [];

  return (
    // Keyed so switching the filter re-applies the default-open rule.
    <Accordion
      key={`${statusFilter}-${defaultOpen}-${groupBySection}`}
      type="multiple"
      defaultValue={openValues}
      data-testid="requirement-group-list"
    >
      {visible.map((entry, position) => {
        const { group, index, kind } = entry;
        const rows = rowsOf(group);
        const tally = tallyRows(rows);
        const startsSection =
          groupBySection && (position === 0 || visible[position - 1]!.kind !== kind);
        return (
          <div key={index}>
            {startsSection && (
              <div
                role="heading"
                aria-level={3}
                className="mt-3 mb-1 first:mt-0 border-b border-border/70 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                data-testid={`apr-section-${kind}`}
              >
                {SECTION_LABEL[kind]}
              </div>
            )}
            <AccordionItem value={`group-${index}`} data-testid={`requirement-group-${index}`}>
              <AccordionTrigger className="text-sm font-serif font-semibold">
                <span className="text-left">{group.name}</span>
                <span
                  className="ml-auto mr-2 shrink-0 font-mono text-xs font-normal text-muted-foreground"
                  aria-label={`${tally.completed} of ${rows.length} completed`}
                >
                  {tally.completed}/{rows.length}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-3">
                  {rows.map((req, j) => (
                    <li key={j} data-testid={`requirement-row-${index}-${j}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-foreground/90">{req.name}</span>
                        <RequirementStatusBadge status={req.status} />
                      </div>
                      {showSourceText && req.status === "needs_review" && req.sourceText && (
                        <p
                          className="mt-1 rounded border border-amber-200 bg-amber-50/70 px-2 py-1 font-mono text-[10px] text-amber-900"
                          data-testid={`requirement-source-${index}-${j}`}
                        >
                          As printed: {req.sourceText}
                        </p>
                      )}
                      {req.courses.length > 0 && (
                        <ul className="mt-1.5 space-y-1 border-l-2 border-border pl-2.5">
                          {req.courses.map((course, k) => (
                            <li
                              key={k}
                              className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-muted-foreground"
                              data-testid={`requirement-course-${index}-${j}-${k}`}
                            >
                              <span className="font-mono font-semibold text-foreground">
                                {course.code}
                              </span>
                              <span>{course.title}</span>
                              {!course.inCatalog && (
                                <span className="text-[10px] italic text-amber-800">
                                  (not matched to the CampusVal catalog)
                                </span>
                              )}
                              {showGrades && (
                                <span className="font-mono">
                                  {course.grade ? `(${course.grade})` : "(in progress)"}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </div>
        );
      })}
    </Accordion>
  );
}
