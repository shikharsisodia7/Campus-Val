import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlanItem } from "@workspace/api-client-react";
import { CourseCard } from "./CourseCard";
import {
  termOfferingLabel,
  courseOffering,
  isOfferingWarning,
  PROJECTED_TERM_EXPLANATION,
} from "@/lib/course-offering";
import { calendarYearFor } from "@/lib/academic-year";
import { useDegreePlanContext } from "./DegreePlanContext";
import { useTermCourseConflicts } from "./useTermCourseConflicts";

export function TermColumn({
  id,
  year,
  term,
  items,
  availableYears,
}: {
  id: string;
  year: number;
  term: string;
  items: PlanItem[];
  availableYears: number[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const { scheduleAvailability } = useDegreePlanContext();

  const realUnits = items.reduce(
    (sum, item) => sum + (item.itemType === "course" ? item.units || 0 : 0),
    0,
  );
  const placeholders = items.filter(
    (i) => i.itemType === "requirement_placeholder",
  ).length;

  // Completed-area items are in the past — skip all schedule/conflict logic for them.
  const isCompletedTerm = term === "completed";

  // `year` here is the academic-year ANCHOR the item is stored under, while
  // schedule availability is keyed by CALENDAR year. Without the conversion
  // only Fall ever matched, leaving Winter and Spring permanently unlabelled.
  const calendarYear = calendarYearFor(term, year);
  const availabilityTerm = !isCompletedTerm
    ? scheduleAvailability?.terms.find(
        (t) => t.year === calendarYear && t.term === term,
      )
    : undefined;
  const status = availabilityTerm?.status; // 'published' | 'tentative' | undefined
  const hasSchedule =
    !isCompletedTerm && (status === "published" || status === "tentative");
  const courseCodes = items
    .filter((i) => i.itemType === "course" && !!i.courseCode)
    .map((i) => i.courseCode!);
  const timeConflicts = useTermCourseConflicts(
    courseCodes,
    term,
    year,
    hasSchedule,
  );

  // Per-course offering evidence, run through the SAME tiered resolver the
  // term-label above uses (published -> tentative -> same-season benchmark
  // -> unknown), so a future benchmarked quarter also flags a course that
  // wasn't historically offered in that season, not just terms with a real
  // published/tentative schedule. See lib/course-offering.
  const offeringByItemId = new Map(
    isCompletedTerm
      ? []
      : items
          .filter((i) => i.itemType === "course" && !!i.courseCode)
          .map((i) => [
            i.id,
            courseOffering(i.courseCode!, term, calendarYear, scheduleAvailability),
          ] as const),
  );

  // One centralized source for how a term is described, so a future Fall is
  // never left unlabelled next to a tentative Winter. See lib/course-offering.
  const { label: statusLabel, evidence: termEvidence } = isCompletedTerm
    ? { label: "", evidence: "unknown" as const }
    : termOfferingLabel(term, calendarYear, scheduleAvailability);
  const statusColor =
    termEvidence === "published"
      ? "bg-emerald-100 text-emerald-800"
      : termEvidence === "tentative"
        ? "bg-amber-100 text-amber-800"
        : termEvidence === "projected"
          ? "bg-sky-100 text-sky-800"
          : "bg-muted/50 text-muted-foreground";

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[125px] min-w-0 flex-col gap-1.5 rounded-lg border p-2 shadow-sm transition-colors xl:min-h-[130px] xl:p-2.5 ${isOver ? "border-primary bg-primary/5" : "border-border/50 bg-card"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-border/40 pb-1">
        <h4 className="text-sm font-medium capitalize whitespace-nowrap">{term}</h4>
        <div className="whitespace-nowrap text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {realUnits} {realUnits === 1 ? "unit" : "units"}
          {placeholders > 0 && (
            <span className="lowercase normal-case font-normal ml-1">
              + {placeholders} req{placeholders > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div
        className={`text-[9px] px-1.5 py-0.5 rounded-sm w-fit ${statusColor}`}
        title={termEvidence === "projected" ? PROJECTED_TERM_EXPLANATION : undefined}
        data-testid="term-status-badge"
      >
        {statusLabel}
      </div>

      <div className="flex-1 flex flex-col gap-2 mt-1">
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <CourseCard
              key={item.id}
              item={item}
              availableYears={availableYears}
              offering={offeringByItemId.get(item.id)}
              conflicts={
                item.itemType === "course" && item.courseCode
                  ? timeConflicts.get(
                      item.courseCode.toUpperCase().replace(/\s+/g, " ").trim(),
                    )
                  : undefined
              }
            />
          ))}
        </SortableContext>

        {items.length === 0 && !isOver && (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/60 italic py-4">
            No courses planned yet.
          </div>
        )}
      </div>
    </div>
  );
}
