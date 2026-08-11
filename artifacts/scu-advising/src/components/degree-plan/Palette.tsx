import { useDegreePlanContext } from "./DegreePlanContext";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAddPlanItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemo, useState, useEffect } from "react";
import { Search, Plus, CheckCircle2, CircleDashed, GraduationCap, Landmark, BookOpenCheck } from "lucide-react";
import { PlanItemType, RequirementItem } from "@workspace/api-client-react";

const GROUP_ICONS = {
  university_core: GraduationCap,
  college: Landmark,
  major: BookOpenCheck,
  minor: BookOpenCheck,
  professional_prep: GraduationCap,
};

const COMPLETED_DESTINATION = "0:completed";
export function Palette() {
  const { requirements, activePlan, catalog, profile, scheduleAvailability } = useDegreePlanContext();
  const [search, setSearch] = useState("");
  const [destination, setDestination] = useState("");
  const queryClient = useQueryClient();
  const addPlanItem = useAddPlanItem();

  const destinationOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = new Set<number>([
      profile?.currentYear ?? scheduleAvailability?.terms?.[0]?.year ?? currentYear,
    ]);
    activePlan?.items.forEach((item) => {
      if (item.term !== 'completed') years.add(item.academicYear);
    });
    const lastYear = Math.max(...years);
    years.add(lastYear + 1);
    const termOptions = Array.from(years)
      .sort((a, b) => a - b)
      .flatMap((year) =>
        ["fall", "winter", "spring", "summer"].map((term) => ({
          value: `${year}:${term}`,
          label: `${term.charAt(0).toUpperCase()}${term.slice(1)} ${year}`,
        })),
      );
    return [
      { value: COMPLETED_DESTINATION, label: "Completed before plan" },
      ...termOptions,
    ];
  }, [activePlan?.items, profile?.currentYear, scheduleAvailability?.terms]);

  useEffect(() => {
    if (destinationOptions.length <= 1) return;
    const current = destinationOptions.find((option) => option.value === destination);
    if (!current) setDestination(destinationOptions[1]!.value);
  }, [destination, destinationOptions]);

  const isCompletedDestination = destination === COMPLETED_DESTINATION;

  const [academicYear, term] = destination.split(":");
  const placement = {
    academicYear: Number(academicYear),
    term: term as "fall" | "winter" | "spring" | "summer" | "completed",
  };

  const handleAddPlaceholder = (group: any, req: RequirementItem) => {
    if (!activePlan || isCompletedDestination) return;
    addPlanItem.mutate({
      id: activePlan.id,
      data: {
        itemType: PlanItemType.requirement_placeholder,
        requirementId: req.id,
        requirementCategory: group.title,
        requirementLabel: req.label,
        academicYear: placement.academicYear,
        term: placement.term as any,
      }
    }, {
      onSuccess: () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans") })
    });
  };

  const handleAddCourse = (courseCode: string, group?: any, req?: RequirementItem) => {
    if (!activePlan) return;
    addPlanItem.mutate({
      id: activePlan.id,
      data: {
        itemType: PlanItemType.course,
        courseCode,
        requirementId: req?.id,
        requirementCategory: group?.title,
        requirementLabel: req?.label,
        academicYear: placement.academicYear,
        term: placement.term as any,
      }
    }, {
      onSuccess: () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans") }),
      onError: (err: any) => {
        if (err.data?.duplicate) {
          if (confirm(`${courseCode} is already in this plan. Add it again?`)) {
            addPlanItem.mutate({
              id: activePlan.id,
              data: {
                itemType: PlanItemType.course,
                courseCode,
                requirementId: req?.id,
                requirementCategory: group?.title,
                requirementLabel: req?.label,
                academicYear: placement.academicYear,
                term: placement.term as any,
                allowDuplicate: true,
              }
            }, {
              onSuccess: () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/plans") })
            });
          }
        }
      }
    });
  };

  const isPlanned = (reqId: string, courses: string[]) => {
    if (!activePlan) return false;
    return activePlan.items.some(i => 
      (i.requirementId === reqId) || 
      (i.courseCode && courses.includes(i.courseCode))
    );
  };

  const filteredCatalog = catalog?.filter(c => 
    c.code.toLowerCase().includes(search.toLowerCase()) || 
    c.title.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20);

  return (
    <Card className="h-full flex flex-col border-border/60 shadow-sm bg-card overflow-hidden">
      <div className="p-4 border-b border-border/60">
        <h2 className="font-serif text-lg font-bold">Palette</h2>
        <p className="text-xs text-muted-foreground mt-1">Requirements & Courses</p>
      </div>
      
      <div className="p-4 border-b border-border/60 bg-muted/10">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            data-testid="input-course-search"
            placeholder="Search catalog..." 
            className="pl-9 bg-background"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-3">
          <label
            htmlFor="plan-destination"
            className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Add new items to
          </label>
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger id="plan-destination" data-testid="select-plan-destination" className="h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {destinationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isCompletedDestination && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Only courses can be added to the completed area (no placeholders).
            </p>
          )}
          {!isCompletedDestination && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              You can drag items later. A course in this plan is not a registration.
            </p>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {search.length > 0 ? (
          <div className="p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Search Results</div>
            {filteredCatalog?.map(c => (
              <div key={c.code} className="p-3 rounded-md border border-border bg-card shadow-sm hover:border-primary/30 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono text-sm font-bold text-primary">{c.code}</div>
                    <div className="text-xs text-foreground mt-0.5">{c.title}</div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 px-2 text-muted-foreground hover:text-primary"
                    onClick={() => handleAddCourse(c.code)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground mt-2">{c.units} units</div>
              </div>
            ))}
            {filteredCatalog?.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">No matching courses found</div>
            )}
          </div>
        ) : (
          <Accordion type="multiple" className="px-2 pb-4">
            {/* Official degree requirements */}
            {requirements?.map(group => {
              const Icon = GROUP_ICONS[group.kind as keyof typeof GROUP_ICONS] || GraduationCap;
              return (
                <AccordionItem key={group.id} value={group.id} className="border-b-0">
                  <AccordionTrigger className="hover:no-underline px-2 py-3 text-sm font-semibold hover:bg-muted/30 rounded-md transition-colors data-[state=open]:bg-muted/30 group">
                    <div className="flex items-center gap-2 text-left">
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      {group.title}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-3 px-2 space-y-3">
                    {group.notes.map((note) => (
                      <p key={note} className="rounded-md border border-muted bg-muted/30 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                        {note}
                      </p>
                    ))}
                    {group.items.length === 0 && (
                      <p className="py-2 text-xs text-muted-foreground">No verified course requirements are available for this group.</p>
                    )}
                    {group.items.map(req => {
                      const completed = req.complete;
                      const planned = isPlanned(req.id, req.courses);
                      const status = completed ? 'completed' : planned ? 'planned' : 'unmet';

                      return (
                        <div key={req.id} className={`p-3 rounded-md border text-sm ${status === 'completed' ? 'border-emerald-200 bg-emerald-50/50' : status === 'planned' ? 'border-blue-200 bg-blue-50/50' : 'border-border bg-card'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium leading-snug">{req.label}</div>
                            {status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                            {status === 'planned' && <CircleDashed className="h-4 w-4 text-blue-600 shrink-0" />}
                          </div>
                          
                          {status !== 'completed' && status !== 'planned' && (
                            <div className="mt-3 space-y-2">
                              {/* Hide placeholder button when destination is completed area */}
                              {!isCompletedDestination && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="w-full h-7 text-xs justify-start"
                                  onClick={() => handleAddPlaceholder(group, req)}
                                  disabled={addPlanItem.isPending}
                                  data-testid={`add-placeholder-${req.id}`}
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Add placeholder
                                </Button>
                              )}
                              
                              {req.courses.length > 0 && (
                                <div className="pt-2">
                                  <div className="text-[10px] text-muted-foreground font-medium uppercase mb-1.5">Or add specific course:</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {req.courses.slice(0, 5).map(c => (
                                      <Badge 
                                        key={c} 
                                        variant="secondary" 
                                        className="text-[10px] font-mono cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                                        onClick={() => handleAddCourse(c, group, req)}
                                      >
                                        {c}
                                      </Badge>
                                    ))}
                                    {req.courses.length > 5 && (
                                      <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                                        +{req.courses.length - 5} more
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {status === 'completed' && (
                            <div className="text-[10px] text-emerald-700 mt-1">Satisfied</div>
                          )}
                          {status === 'planned' && (
                            <div className="text-[10px] text-blue-700 mt-1">Planned in schedule</div>
                          )}
                        </div>
                      );
                    })}
                  </AccordionContent>
                </AccordionItem>
              );
            })}

          </Accordion>
        )}
      </ScrollArea>
    </Card>
  );
}
