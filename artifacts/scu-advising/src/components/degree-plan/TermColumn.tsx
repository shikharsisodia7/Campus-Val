import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlanItem } from "@workspace/api-client-react";
import { CourseCard } from "./CourseCard";
import { termOfferingLabel } from "@/lib/course-offering";
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

  const availabilityTerm = !isCompletedTerm
    ? scheduleAvailability?.terms.find(
        (t) => t.year === year && t.term === term,
      )
    : undefined;
  const status = availabilityTerm?.status; // 'published' | 'tentative' | undefined
  // Only terms with an official schedule (published or tentative) can honestly
  // flag a course as absent from it. Unknown terms stay unknown.
  const offeredCodes = availabilityTerm?.offeredCourseCodes
    ? new Set(
        availabilityTerm.offeredCourseCodes.map((c) =>
          c.toUpperCase().replace(/\s+/g, " ").trim(),
        ),
      )
    : null;
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

  // One centralized source for how a term is described, so a future Fall is
  // never left unlabelled next to a tentative Winter. See lib/course-offering.
  const { label: statusLabel, evidence: termEvidence } = isCompletedTerm
    ? { label: "", evidence: "unknown" as const }
    : termOfferingLabel(term, year, scheduleAvailability);
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
              notInOfficialSchedule={
                offeredCodes !== null &&
                item.itemType === "course" &&
                !!item.courseCode &&
                !offeredCodes.has(
                  item.courseCode.toUpperCase().replace(/\s+/g, " ").trim(),
                )
              }
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
