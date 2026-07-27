import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlanItem, PlanItemType, useReplacePlanPlaceholder, useGetCourse, useListCourseSections, getListCourseSectionsQueryKey, type Term, type ScheduleAvailabilityTermStatus } from "@workspace/api-client-react";
import { useOptimisticDeletePlanItem, useOptimisticUpdatePlanItem } from "./usePlanItemMutations";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDegreePlanContext } from "./DegreePlanContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Trash2, GripVertical, MoveRight, BookOpen, AlertCircle, Loader2, CalendarClock } from "lucide-react";

function CourseDetailDialog({ code, term, year, termStatus, open, onOpenChange }: { code: string, term?: string, year?: number, termStatus?: ScheduleAvailabilityTermStatus, open: boolean, onOpenChange: (o: boolean) => void }) {
  const { data: courseDetails, isLoading } = useGetCourse(code, { query: { enabled: open, queryKey: ['/api/courses', code] } });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono text-xl">{code}</DialogTitle>
          <DialogDescription>{courseDetails?.title || "Loading..."}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Badge variant="outline">{courseDetails?.units} Units</Badge>
              {courseDetails?.coreAreas?.map(a => <Badge key={a} variant="secondary">{a}</Badge>)}
            </div>
            <p className="text-sm text-muted-foreground">{courseDetails?.description || "Description not available."}</p>
            
            {term && year !== undefined && (
              <TermSectionsPanel code={code} term={term} year={year} status={termStatus} />
            )}

            <div className="p-3 bg-muted/20 rounded-md border border-border text-sm">
              <div className="font-semibold mb-1">Prerequisites</div>
              <div>{courseDetails?.prereqLogic || "Prerequisite information unavailable."}</div>
            </div>
            
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-blue-50 text-blue-800 p-2 rounded border border-blue-100">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Prerequisite advisories are informational. Always verify with your advisor.</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CourseCard({ item, isOverlay, availableYears, notInOfficialSchedule }: { item: PlanItem, isOverlay?: boolean, availableYears: number[], notInOfficialSchedule?: boolean }) {
  const { activePlanId, catalog, profile, requirements, scheduleAvailability } = useDegreePlanContext();
  const deletePlanItem = useOptimisticDeletePlanItem();
  const queryClient = useQueryClient();
  const updatePlanItem = useOptimisticUpdatePlanItem();
  const replacePlaceholder = useReplacePlanPlaceholder({ mutation: { onSuccess: () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans") }) } });
  
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [replaceSearch, setReplaceSearch] = useState("");
  
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.4 : 1,
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activePlanId) return;
    deletePlanItem.mutate({ id: activePlanId, itemId: item.id });
  };

  const handleMove = (e: React.MouseEvent, year: number, term: string) => {
    e.stopPropagation();
    if (!activePlanId) return;
    updatePlanItem.mutate({
      id: activePlanId,
      itemId: item.id,
      data: { academicYear: year, term: term as any }
    });
  };

  const handleReplace = (courseCode: string) => {
    if (!activePlanId) return;
    replacePlaceholder.mutate({
      id: activePlanId,
      itemId: item.id,
      data: { courseCode }
    }, {
      onSuccess: () => setIsReplaceOpen(false)
    });
  };

  const isPlaceholder = item.itemType === PlanItemType.requirement_placeholder;
  const courseDetails = !isPlaceholder && catalog ? catalog.find(c => c.code === item.courseCode) : null;

  const terms = ['fall', 'winter', 'spring', 'summer'];

  const content = (
    <Card 
      className={`relative group ${isPlaceholder ? 'border-dashed border-primary/40 bg-primary/[0.02]' : 'bg-card border-border'} ${isOverlay ? 'shadow-lg rotate-2 scale-105' : 'shadow-sm hover:shadow-md transition-all'}`}
    >
      <div className="p-2.5 flex items-start gap-2">
        <div 
          {...attributes} 
          {...listeners} 
          className="mt-1 text-muted-foreground/40 cursor-grab hover:text-foreground transition-colors outline-none"
          tabIndex={0}
          aria-label={`Drag ${item.courseCode || item.requirementLabel}`}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        
        <div 
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => {
            if (isPlaceholder) setIsReplaceOpen(true);
            else setIsDetailOpen(true);
          }}
        >
          {isPlaceholder ? (
            <>
              <Badge variant="outline" className="text-[9px] mb-1 font-mono uppercase tracking-widest text-primary border-primary/20">Requirement</Badge>
              <div className="font-medium text-sm leading-tight text-foreground/90">{item.requirementLabel}</div>
              <div className="text-[10px] text-muted-foreground mt-1 truncate">{item.requirementCategory}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Units TBD</div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-start gap-1">
                <div className="font-mono text-sm font-bold text-primary truncate">{item.courseCode}</div>
                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{item.units}u</Badge>
              </div>
              <div className="text-xs text-foreground/80 mt-1 line-clamp-2 leading-snug">{item.courseTitle || courseDetails?.title}</div>
              {notInOfficialSchedule && (
                <div
                  className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-700"
                  data-testid={`not-offered-note-${item.id}`}
                >
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>Not in official schedule this quarter</span>
                </div>
              )}
            </>
          )}
        </div>
        
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={e => e.stopPropagation()}>
                <MoveRight className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 max-h-[300px] overflow-y-auto">
              <DropdownMenuLabel>Move to...</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {availableYears.map(y => (
                <div key={y}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{y}</div>
                  {terms.map(t => (
                    <DropdownMenuItem key={`${y}-${t}`} onClick={(e) => handleMove(e as any, y, t)} disabled={item.academicYear === y && item.term === t}>
                      <span className="capitalize">{t}</span>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/70 hover:text-destructive hover:bg-destructive/10" onClick={handleDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </Card>
  );

  if (isOverlay) return <div style={style}>{content}</div>;

  return (
    <div ref={setNodeRef} style={style}>
      {content}

      {/* Course Detail Dialog */}
      {!isPlaceholder && item.courseCode && (
        <CourseDetailDialog
          code={item.courseCode}
          term={item.term}
          year={item.academicYear}
          termStatus={scheduleAvailability?.terms.find(t => t.year === item.academicYear && t.term === item.term)?.status}
          open={isDetailOpen}
          onOpenChange={setIsDetailOpen}
        />
      )}

      {/* Replace Placeholder Dialog */}
      {isPlaceholder && (
        <Dialog open={isReplaceOpen} onOpenChange={setIsReplaceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Replace Placeholder</DialogTitle>
              <DialogDescription>Find a course to satisfy: {item.requirementLabel}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {(() => {
                const reqItem = requirements
                  ?.flatMap(g => g.items ?? [])
                  .find(r => r.id === item.requirementId);
                const eligibleCodes = new Set(
                  (reqItem?.courses ?? []).map(c => c.toUpperCase()),
                );
                const eligible = catalog?.filter(c => eligibleCodes.has(c.code.toUpperCase())) ?? [];
                if (eligible.length === 0 || replaceSearch.trim().length > 0) return null;
                return (
                  <div className="space-y-2" data-testid="replace-eligible-list">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Courses that satisfy this requirement</div>
                    <ScrollArea className="max-h-[180px] border rounded-md p-2">
                      {eligible.map(c => (
                        <div key={c.code} className="flex justify-between items-center p-2 hover:bg-muted rounded-md border-b last:border-0">
                          <div>
                            <div className="font-mono text-sm font-bold">{c.code}</div>
                            <div className="text-xs text-muted-foreground">{c.title}</div>
                          </div>
                          <Button size="sm" data-testid={`replace-select-${c.code.replace(/\s+/g, '-')}`} onClick={() => handleReplace(c.code)} disabled={replacePlaceholder.isPending}>Select</Button>
                        </div>
                      ))}
                    </ScrollArea>
                    <div className="text-xs text-muted-foreground">Or search the full catalog below.</div>
                  </div>
                );
              })()}
              <Input 
                placeholder="Search catalog..." 
                data-testid="replace-search-input"
                value={replaceSearch}
                onChange={e => setReplaceSearch(e.target.value)}
              />
              <ScrollArea className="h-[250px] border rounded-md p-2">
                {catalog?.filter(c => 
                  c.code.toLowerCase().includes(replaceSearch.toLowerCase()) || 
                  c.title.toLowerCase().includes(replaceSearch.toLowerCase())
                ).slice(0, 20).map(c => (
                  <div key={c.code} className="flex justify-between items-center p-2 hover:bg-muted rounded-md border-b last:border-0">
                    <div>
                      <div className="font-mono text-sm font-bold">{c.code}</div>
                      <div className="text-xs text-muted-foreground">{c.title}</div>
                    </div>
                    <Button size="sm" onClick={() => handleReplace(c.code)}>Select</Button>
                  </div>
                ))}
                {(!catalog || catalog.length === 0) && (
                  <div className="p-4 text-center text-sm text-muted-foreground">Catalog loading...</div>
                )}
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function format12(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t;
  let h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

function TermSectionsPanel({ code, term, year, status }: { code: string, term: string, year: number, status: ScheduleAvailabilityTermStatus | undefined }) {
  const hasSchedule = status === "published" || status === "tentative";
  const params = { term: term as Term, year };
  const { data: sections = [], isLoading } = useListCourseSections(code, params, {
    query: {
      enabled: hasSchedule,
      queryKey: getListCourseSectionsQueryKey(code, params),
    },
  });

  const heading = (
    <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
      <CalendarClock className="h-3 w-3" />
      <span className="capitalize">{term} {year} sections</span>
    </div>
  );

  if (!hasSchedule) {
    return (
      <div className="space-y-2" data-testid="term-sections-panel">
        {heading}
        <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          SCU hasn't published a schedule for <span className="capitalize">{term} {year}</span> yet, so section days and times aren't known.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="term-sections-panel">
      <div className="flex items-center gap-2 flex-wrap">
        {heading}
        {status === "tentative" && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5 border-amber-300 bg-amber-50 text-amber-800">
            Tentative — sections & instructors TBA
          </Badge>
        )}
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading sections…</div>
      ) : sections.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm text-amber-900" data-testid="term-sections-empty">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
          <span>
            Not in SCU's {status === "tentative" ? "tentative" : "official"} <span className="capitalize">{term} {year}</span> schedule. It may be offered in another quarter — check Workday Student.
          </span>
        </div>
      ) : (
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
          {sections.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-2.5 bg-card text-sm" data-testid={`plan-section-${s.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-xs">
                  {s.tentative ? "Section TBA" : `§${s.sectionNumber}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.meetingDays.length > 0 ? s.meetingDays.join("") : "Days TBA"}
                  {s.startTime && s.endTime ? ` · ${format12(s.startTime)}–${format12(s.endTime)}` : " · Time TBA"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
                <span>{s.tentative ? "Instructor TBA" : (s.instructor || "Instructor TBA")}</span>
                {s.location && !s.tentative && <span className="truncate">{s.location}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
