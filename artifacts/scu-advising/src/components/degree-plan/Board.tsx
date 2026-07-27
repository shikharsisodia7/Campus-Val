import { useState, useMemo } from "react";
import { useDegreePlanContext } from "./DegreePlanContext";
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TermColumn } from "./TermColumn";
import { CourseCard } from "./CourseCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useOptimisticUpdatePlanItem } from "./usePlanItemMutations";

export function Board({ plans }: { plans: any[] }) {
  const { activePlan, activePlanId, scheduleAvailability } = useDegreePlanContext();
  const updatePlanItem = useOptimisticUpdatePlanItem();

  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  // Group items by year and term
  // Calculate which years to show
  const yearsWithItems = new Set<number>();
  const summerVisibleByYear = new Set<number>();
  
  if (activePlan) {
    activePlan.items.forEach(item => {
      yearsWithItems.add(item.academicYear);
      if (item.term === 'summer') {
        summerVisibleByYear.add(item.academicYear);
      }
    });
  }

  const [addedYears, setAddedYears] = useState<number[]>([]);
  const [addedSummers, setAddedSummers] = useState<number[]>([]);

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
    const overId = over.id; // Either a term dropzone or another item

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

      if (item && (item.academicYear !== targetYear || item.term !== targetTerm || targetPosition !== undefined)) {
        // Optimistic cache update (with rollback on error) keeps the board in
        // sync with the drag immediately; the refetch reconciles afterwards.
        updatePlanItem.mutate({
          id: activePlanId,
          itemId,
          data: {
            academicYear: targetYear,
            term: targetTerm as any,
            position: targetPosition
          }
        });
      }
    }
  };

  const handleAddYear = () => {
    const nextYear = displayYears.length > 0 ? displayYears[displayYears.length - 1] + 1 : 2026;
    setAddedYears(prev => [...prev, nextYear]);
  };

  const handleAddSummer = (year: number) => {
    setAddedSummers(prev => [...prev, year]);
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
                    const itemsInTerm = activePlan.items.filter(i => i.academicYear === year && i.term === term).sort((a, b) => a.position - b.position);
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
