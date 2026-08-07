import { useState, useMemo, useEffect } from "react";
import { useDegreePlanContext } from "./DegreePlanContext";
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TermColumn } from "./TermColumn";
import { CompletedArea, COMPLETED_DROPZONE_ID } from "./CompletedArea";
import { CourseCard } from "./CourseCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useOptimisticUpdatePlanItem } from "./usePlanItemMutations";
import { useUpdatePlan } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function Board({ plans }: { plans: any[] }) {
  const { activePlan, activePlanId, scheduleAvailability, aprCompletedCodes = new Set() } = useDegreePlanContext();
  const updatePlanItem = useOptimisticUpdatePlanItem();
  const updatePlan = useUpdatePlan();
  const queryClient = useQueryClient();

  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  // Group items by year and term
  // Calculate which years to show
  const yearsWithItems = new Set<number>();
  const summerVisibleByYear = new Set<number>();
  
  const plannedItems = (activePlan?.items ?? []).filter(i => (i.bucket ?? 'planned') !== 'completed');
  const completedItems = (activePlan?.items ?? [])
    .filter(i => (i.bucket ?? 'planned') === 'completed')
    .sort((a, b) => a.position - b.position);

  plannedItems.forEach(item => {
    yearsWithItems.add(item.academicYear);
    if (item.term === 'summer') {
      summerVisibleByYear.add(item.academicYear);
    }
  });

  const [addedYears, setAddedYears] = useState<number[]>(
    activePlan?.metadata?.addedYears ?? [],
  );
  const [addedSummers, setAddedSummers] = useState<number[]>(
    activePlan?.metadata?.summerYears ?? [],
  );

  useEffect(() => {
    setAddedYears(activePlan?.metadata?.addedYears ?? []);
    setAddedSummers(activePlan?.metadata?.summerYears ?? []);
  }, [activePlan?.id, activePlan?.metadata]);

  const saveLayout = (years: number[], summers: number[]) => {
    if (!activePlanId) return;
    updatePlan.mutate(
      { id: activePlanId, data: { metadata: { addedYears: years, summerYears: summers } } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans"),
          }),
      },
    );
  };

  const displayYears = useMemo(() => {
    let base = Array.from(yearsWithItems);
    addedYears.forEach(y => { if (!base.includes(y)) base.push(y); });
    if (base.length === 0) base = [2026];
    return base.sort();
  }, [yearsWithItems, addedYears]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: any) => {
    setActiveDragId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || !activePlanId) return;

    const itemId = active.id;
    const overId = over.id; // Either a term dropzone, the completed area, or another item

    const draggedItem = activePlan?.items.find(i => i.id === itemId);
    const overItemForBucket =
      overId !== COMPLETED_DROPZONE_ID ? activePlan?.items.find(i => i.id === overId) : undefined;
    const droppedOnCompleted =
      overId === COMPLETED_DROPZONE_ID ||
      (overItemForBucket && (overItemForBucket.bucket ?? 'planned') === 'completed');

    if (droppedOnCompleted) {
      if (!draggedItem) return;
      const targetPosition =
        overItemForBucket && overItemForBucket.id !== itemId ? overItemForBucket.position : undefined;
      if ((draggedItem.bucket ?? 'planned') === 'completed' && targetPosition === undefined) return;
      updatePlanItem.mutate({
        id: activePlanId,
        itemId,
        data: {
          bucket: 'completed',
          // Preserve existing provenance; default drag-ins to manually marked.
          completionSource: draggedItem.completionSource ?? 'manually_marked',
          position: targetPosition,
        },
      });
      return;
    }

    // Parse overId to get year/term
    let targetYear, targetTerm;
    if (String(overId).startsWith('term:')) {
      const parts = String(overId).split(':');
      targetYear = parseInt(parts[1], 10);
      targetTerm = parts[2];
    } else {
      // Find the item it was dropped over to get its term/year
      const overItem = activePlan?.items.find(i => i.id === overId);
      if (overItem) {
        targetYear = overItem.academicYear;
        targetTerm = overItem.term;
      }
    }

    if (targetYear && targetTerm) {
      const item = activePlan?.items.find(i => i.id === itemId);
      let targetPosition: number | undefined = undefined;
      
      if (overId !== `term:${targetYear}:${targetTerm}`) {
        const overItem = activePlan?.items.find(i => i.id === overId);
        if (overItem) {
          targetPosition = overItem.position;
          if (itemId === overId) return;
        }
      }

      const fromCompleted = item && (item.bucket ?? 'planned') === 'completed';
      if (item && (fromCompleted || item.academicYear !== targetYear || item.term !== targetTerm || targetPosition !== undefined)) {
        // Optimistic cache update (with rollback on error) keeps the board in
        // sync with the drag immediately; the refetch reconciles afterwards.
        updatePlanItem.mutate({
          id: activePlanId,
          itemId,
          data: {
            academicYear: targetYear,
            term: targetTerm as any,
            position: targetPosition,
            ...(fromCompleted ? { bucket: 'planned' as const, completionSource: null } : {}),
          }
        });
      }
    }
  };

  const handleAddYear = () => {
    const nextYear = displayYears.length > 0 ? displayYears[displayYears.length - 1] + 1 : 2026;
    const years = Array.from(new Set([...addedYears, nextYear])).sort((a, b) => a - b);
    setAddedYears(years);
    saveLayout(years, addedSummers);
  };

  const handleAddSummer = (year: number) => {
    const summers = Array.from(new Set([...addedSummers, year])).sort((a, b) => a - b);
    setAddedSummers(summers);
    saveLayout(addedYears, summers);
  };

  if (!activePlan) return null;

  return (
    <div className="h-full flex flex-col bg-muted/5 border-x border-border/60 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCorners} 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <CompletedArea items={completedItems} availableYears={displayYears} />
          {aprCompletedCodes.size > 0 && (
            (() => {
              const review = plannedItems.filter(
                (item) =>
                  item.itemType === "course" &&
                  item.courseCode &&
                  aprCompletedCodes.has(item.courseCode.toUpperCase()),
              );
              return review.length > 0 ? (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                  data-testid="apr-plan-mismatch"
                >
                  <strong>Possible report match to review:</strong>{" "}
                  {review.map((item) => item.courseCode).join(", ")} also appears
                  on your uploaded Academic Progress Report but remains planned here.
                  Nothing was moved automatically; verify it in Workday before changing
                  your plan.
                </div>
              ) : null;
            })()
          )}

          {displayYears.map(year => {
            const hasSummer = summerVisibleByYear.has(year) || addedSummers.includes(year);
            const terms = ['fall', 'winter', 'spring'];
            if (hasSummer) terms.push('summer');

            return (
              <div key={year} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl font-bold tracking-tight text-foreground/90">
                    {year}–{year + 1}
                  </h3>
                  {!hasSummer && (
                    <Button variant="ghost" size="sm" onClick={() => handleAddSummer(year)} className="text-muted-foreground">
                      <Plus className="h-3 w-3 mr-1" /> Add summer
                    </Button>
                  )}
                </div>
                
                <div className={`grid gap-4 items-start ${hasSummer ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-3'}`}>
                  {terms.map(term => {
                    const dropZoneId = `term:${year}:${term}`;
                    const itemsInTerm = plannedItems.filter(i => i.academicYear === year && i.term === term).sort((a, b) => a.position - b.position);
                    return (
                      <TermColumn 
                        key={dropZoneId} 
                        id={dropZoneId} 
                        year={year} 
                        term={term} 
                        items={itemsInTerm} 
                        availableYears={displayYears}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          
          <DragOverlay>
            {activeDragId ? (
              <CourseCard item={activePlan.items.find(i => i.id === activeDragId)!} isOverlay availableYears={displayYears} />
            ) : null}
          </DragOverlay>
        </DndContext>
        
        <div className="pt-4 pb-12 flex justify-center">
          <Button variant="outline" onClick={handleAddYear}>
            <Plus className="h-4 w-4 mr-2" /> Add academic year
          </Button>
        </div>
      </div>
    </div>
  );
}
