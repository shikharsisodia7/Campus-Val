import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Circle, HelpCircle } from "lucide-react";
import type { ParsedProgressReportGroupsItem } from "@workspace/api-client-react";

type RequirementStatus =
  ParsedProgressReportGroupsItem["requirements"][number]["status"];

const STATUS_META: Record<
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

function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 shrink-0 text-[10px] ${meta.className}`}
      data-testid="badge-requirement-status"
    >
      <Icon className="h-3 w-3" /> {meta.label}
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
}: {
  groups: ParsedProgressReportGroupsItem[];
  /** "all" for the dedicated page; "none" for compact sidebar placements. */
  defaultOpen?: "all" | "none";
}) {
  if (groups.length === 0) return null;

  return (
    <Accordion
      type="multiple"
      defaultValue={defaultOpen === "all" ? groups.map((_, i) => `group-${i}`) : []}
      data-testid="requirement-group-list"
    >
      {groups.map((group, i) => {
        const completedCount = group.requirements.filter(
          (r) => r.status === "completed",
        ).length;
        return (
          <AccordionItem key={i} value={`group-${i}`} data-testid={`requirement-group-${i}`}>
            <AccordionTrigger className="text-sm font-serif font-semibold">
              <span className="text-left">{group.name}</span>
              <span className="ml-auto mr-2 shrink-0 font-mono text-xs font-normal text-muted-foreground">
                {completedCount}/{group.requirements.length}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-3">
                {group.requirements.map((req, j) => (
                  <li key={j} data-testid={`requirement-row-${i}-${j}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-foreground/90">{req.name}</span>
                      <RequirementStatusBadge status={req.status} />
                    </div>
                    {req.courses.length > 0 && (
                      <ul className="mt-1.5 space-y-1 border-l-2 border-border pl-2.5">
                        {req.courses.map((course, k) => (
                          <li
                            key={k}
                            className="flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-muted-foreground"
                            data-testid={`requirement-course-${i}-${j}-${k}`}
                          >
                            <span className="font-mono font-semibold text-foreground">
                              {course.code}
                            </span>
                            <span>{course.title}</span>
                            <span className="font-mono">
                              {course.grade ? `(${course.grade})` : "(in progress)"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
