import { useId, useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { Course, RequirementItem } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

/**
 * The full eligible course list of a requirement, as the Bulletin groups it.
 *
 * A choice requirement ("one course from the CMB theme", "two electives with
 * laboratory", "PHYS 11-13 or PHYS 31-33") carries its named course lists; a
 * plain requirement with a long course list gets one unnamed list. Nothing is
 * hidden behind a "+N more" that cannot be opened. Status is always written in
 * words, never colour alone. Generic: no program-specific code.
 */

const PREVIEW_COUNT = 5;

export function choiceSummary(req: RequirementItem): string | null {
  const choice = req.choice;
  if (!choice) return null;
  if (choice.kind === "alternatives") {
    return `Complete one: ${choice.alternatives.map((a) => a.label).join(" or ")}`;
  }
  if (choice.minimum == null) return null;
  const spread = choice.minDistinctLists ? ` from at least ${choice.minDistinctLists} of the lists` : "";
  const parts = [`Choose ${choice.minimum}${spread}`, `${choice.completedCount} of ${choice.minimum} completed`];
  if (choice.plannedCount > 0) parts.push(`${choice.plannedCount} planned`);
  return parts.join(" · ");
}

/** "Counted: BIOL 174 (completed), BIOL 175 (planned)", or null when nothing is counted yet. */
export function countedLine(req: RequirementItem): string | null {
  if (!req.choice) return null;
  const done = req.satisfiedBy ?? [];
  const planned = req.plannedBy ?? [];
  if (done.length + planned.length === 0) return null;
  return `Counted here: ${[...done.map((c) => `${c} (completed)`), ...planned.map((c) => `${c} (planned)`)].join(", ")}`;
}

/** Whether a requirement has more to show than the five preview chips. */
export function hasCourseList(req: RequirementItem): boolean {
  return !!req.choice || req.courses.length > PREVIEW_COUNT;
}

export function RequirementChoiceDetails({
  req,
  catalog,
  onAdd,
  disabled,
  plannedCourses,
}: {
  req: RequirementItem;
  catalog: Course[] | undefined;
  /** Absent where courses cannot be added from (a read-only sidebar). */
  onAdd?: (code: string) => void;
  disabled?: boolean;
  /** Courses already in the active plan, to say so instead of offering them again. */
  plannedCourses?: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleOf = useMemo(() => {
    const byCode = new Map((catalog ?? []).map((c) => [c.code, c]));
    return (code: string) => byCode.get(code);
  }, [catalog]);

  const lists = useMemo(() => {
    const choice = req.choice;
    if (choice?.kind === "choose" && choice.lists.length > 0) return choice.lists;
    if (choice?.kind === "alternatives") {
      return choice.alternatives.map((a, i) => ({
        key: `option-${i}`,
        label: `Option ${i + 1}: ${a.label}${a.recommended && !/recommended/i.test(a.label) ? " (recommended)" : ""}`,
        note: null,
        courses: a.courses,
        max: null,
      }));
    }
    return [{ key: "eligible", label: "Eligible courses", note: null, courses: req.courses, max: null }];
  }, [req.choice, req.courses]);

  const total = new Set(lists.flatMap((l) => l.courses)).size;
  const counted = new Map<string, string>([
    ...(req.satisfiedBy ?? []).map((c) => [c, "completed"] as const),
    ...(req.plannedBy ?? []).map((c) => [c, "planned"] as const),
  ]);
  const summary = choiceSummary(req);

  return (
    <div className="pt-1" data-testid={`choice-${req.id}`}>
      {summary && (
        <p className="mb-1 text-[10px] font-medium text-foreground/80" data-testid={`choice-summary-${req.id}`}>
          {summary}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full justify-between text-[11px]"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={`toggle-course-list-${req.id}`}
      >
        <span>{open ? "Hide course list" : `Show all ${total} eligible course${total === 1 ? "" : "s"}`}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </Button>
      {open && (
        <div id={panelId} className="mt-1.5 space-y-2" data-testid={`course-list-${req.id}`}>
          {lists.map((list) => (
            <section key={list.key} aria-label={list.label} data-testid={`course-list-${req.id}-${list.key}`}>
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {list.label}
                {list.max != null && <span className="normal-case"> (at most {list.max})</span>}
              </h4>
              {list.note && <p className="text-[10px] italic leading-snug text-muted-foreground">{list.note}</p>}
              <ul className="mt-0.5 divide-y divide-border/60 rounded-md border border-border/60">
                {list.courses.map((code) => {
                  const course = titleOf(code);
                  const state = counted.get(code);
                  const inPlan = plannedCourses?.has(code);
                  return (
                    <li key={code} className="flex items-center justify-between gap-1.5 px-1.5 py-1" data-course={code}>
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] font-bold text-primary">{code}</span>
                        <span className="ml-1 text-[10px] text-foreground">
                          {course ? course.title : "Not in CampusVal's course catalog — check the Bulletin"}
                        </span>
                        {course && <span className="ml-1 text-[10px] text-muted-foreground">· {course.units} units</span>}
                        {state && (
                          <span className="ml-1 rounded bg-emerald-50 px-1 text-[9px] font-medium text-emerald-800">
                            Counted ({state})
                          </span>
                        )}
                        {!state && inPlan && (
                          <span className="ml-1 rounded bg-blue-50 px-1 text-[9px] font-medium text-blue-800">In this plan</span>
                        )}
                      </div>
                      {onAdd && course && !state && !inPlan && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 shrink-0 px-0 text-muted-foreground hover:text-primary"
                          onClick={() => onAdd(code)}
                          disabled={disabled}
                          aria-label={`Add ${code} to the plan`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
