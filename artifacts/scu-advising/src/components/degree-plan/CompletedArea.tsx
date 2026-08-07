import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PlanItem } from "@workspace/api-client-react";
import { CourseCard } from "./CourseCard";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export const COMPLETED_DROPZONE_ID = "bucket:completed";

interface CompletedAreaProps {
  items: PlanItem[];
  availableYears: number[];
}

export function CompletedArea({ items, availableYears }: CompletedAreaProps) {
  const { setNodeRef, isOver } = useDroppable({ id: COMPLETED_DROPZONE_ID });
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-2" data-testid="completed-before-plan-area">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(v => !v)}
        data-testid="toggle-completed-area"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Completed Before Current Plan
        <Badge variant="secondary" className="text-[10px] ml-1">{items.length}</Badge>
      </button>

      {expanded && (
        <div
          ref={setNodeRef}
          className={`rounded-lg border-2 border-dashed p-3 min-h-[80px] transition-colors ${
            isOver ? 'border-emerald-400 bg-emerald-50/30' : 'border-border/50 bg-muted/10'
          }`}
          data-testid="completed-area-dropzone"
        >
          {items.length === 0 && !isOver ? (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground/60 italic py-4">
              Drag completed courses here, or add them from the Palette.
            </div>
          ) : (
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {items.map(item => (
                  <CompletedCourseCard
                    key={item.id}
                    item={item}
                    availableYears={availableYears}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}

function CompletedCourseCard({ item, availableYears }: { item: PlanItem; availableYears: number[] }) {
  const provenance = item.provenance;
  const provenanceBadge = provenance === 'report_imported'
    ? { label: 'From your progress report', color: 'bg-blue-50 text-blue-700 border-blue-200' }
    : { label: 'You marked complete', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };

  return (
    <div className="relative" data-testid={`completed-item-${item.id}`}>
      <CourseCard item={item} availableYears={availableYears} />
      <div
        className={`mt-0.5 px-1.5 py-0.5 rounded text-[9px] border w-fit ${provenanceBadge.color}`}
        data-testid={`provenance-badge-${item.id}`}
      >
        {provenanceBadge.label}
      </div>
    </div>
  );
}
