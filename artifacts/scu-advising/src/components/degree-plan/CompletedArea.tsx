import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PlanItem } from "@workspace/api-client-react";
import { CourseCard } from "./CourseCard";
import { CheckCircle2 } from "lucide-react";

export const COMPLETED_DROPZONE_ID = "bucket:completed";

/**
 * Completed Before Current Plan — a term-agnostic area for prior/transfer/
 * test-credit/manually-marked coursework. Items here are student-asserted,
 * not verified degree progress.
 */
export function CompletedArea({ items, availableYears }: { items: PlanItem[]; availableYears: number[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: COMPLETED_DROPZONE_ID });

  const realUnits = items.reduce(
    (sum, item) => sum + (item.itemType === "course" ? (item.units || 0) : 0),
    0,
  );

  return (
    <div className="space-y-3" data-testid="completed-area">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        <h3 className="font-serif text-xl font-bold tracking-tight text-foreground/90">
          Completed before current plan
        </h3>
      </div>
      <div
        ref={setNodeRef}
        className={`rounded-lg border p-3 transition-colors ${
          isOver ? "border-primary bg-primary/5" : "border-emerald-200/70 bg-emerald-50/30"
        }`}
      >
        <div className="flex items-center justify-between pb-2 border-b border-border/40 mb-2">
          <span className="text-xs text-muted-foreground">
            Prior, transfer, AP/IB/test credit, and manually marked coursework. Student-entered — not verified academic progress.
          </span>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground shrink-0 ml-3">
            {realUnits} {realUnits === 1 ? "unit" : "units"}
          </span>
        </div>
        <div className="grid gap-2 grid-cols-1 md:grid-cols-3 lg:grid-cols-4 items-start">
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <CourseCard key={item.id} item={item} availableYears={availableYears} />
            ))}
          </SortableContext>
          {items.length === 0 && !isOver && (
            <div className="col-span-full text-xs text-muted-foreground/60 italic py-3 text-center">
              Drag courses here, or add them from the palette with destination “Completed before current plan.”
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
