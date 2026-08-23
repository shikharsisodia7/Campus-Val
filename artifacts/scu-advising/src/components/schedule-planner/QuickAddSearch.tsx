import { useState, useRef, useEffect } from "react";
import { useSearchCourses, useListCourseSections, useAddScheduleEvent, useUpdateScheduleEvent, getSearchCoursesQueryKey, getListCourseSectionsQueryKey } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Plus, Calendar, MapPin, Users, AlertCircle, ArrowLeftRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useScheduleWorkspace } from "./useScheduleWorkspace";
import { format12 } from "./utils";
import { useToast } from "@/hooks/use-toast";

/**
 * Course components. SCU publishes no component column, so `componentType`
 * arrives from the API derived from the published meeting pattern and the
 * bulletin's laboratory/recitation text — it is a planning aid, never a
 * Registrar field, and the UI says so.
 */
const COMPONENT_LABEL: Record<string, string> = {
  lecture: "Lecture",
  lab: "Lab",
  recitation: "Recitation",
  unknown: "Section",
};

const COMPONENT_ORDER = ["lecture", "lab", "recitation", "unknown"];

function groupByComponent<T extends { componentType?: string | null }>(
  sections: T[],
): Array<{ component: string; sections: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const section of sections) {
    const key = section.componentType ?? "unknown";
    const list = buckets.get(key);
    if (list) list.push(section);
    else buckets.set(key, [section]);
  }
  return COMPONENT_ORDER.filter((c) => buckets.has(c)).map((component) => ({
    component,
    sections: buckets.get(component)!,
  }));
}

export function QuickAddSearch({
  workspace,
  initialCourse,
  onInitialCourseConsumed,
}: {
  workspace: ReturnType<typeof useScheduleWorkspace>;
  /** Pre-select a course code to jump straight to its section list */
  initialCourse?: string | null;
  /** Callback fired once the initialCourse has been applied (so parent can clear it) */
  onInitialCourseConsumed?: () => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  // Apply initialCourse the first time it arrives or changes
  const prevInitialCourse = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (initialCourse && initialCourse !== prevInitialCourse.current) {
      setSelectedCourse(initialCourse);
      setQuery(initialCourse);
      prevInitialCourse.current = initialCourse;
      onInitialCourseConsumed?.();
    }
  }, [initialCourse, onInitialCourseConsumed]);

  const searchParams: any = {
    q: debouncedQuery,
    term: workspace.activeTerm || undefined,
    year: workspace.activeYear || undefined,
    limit: 10,
  };

  const { data: searchResults, isFetching: isSearching } = useSearchCourses(
    searchParams,
    { query: { enabled: !!debouncedQuery && !!workspace.activeTerm, queryKey: getSearchCoursesQueryKey(searchParams) } }
  );

  const sectionsParams: any = {
    term: workspace.activeTerm!,
    year: workspace.activeYear!,
  };

  const { data: sections, isFetching: isFetchingSections } = useListCourseSections(
    selectedCourse!,
    sectionsParams,
    { query: { enabled: !!selectedCourse && !!workspace.activeTerm && !!workspace.activeYear, queryKey: getListCourseSectionsQueryKey(selectedCourse!, sectionsParams) } }
  );

  const addMut = useAddScheduleEvent();
  const updateMut = useUpdateScheduleEvent();

  // Sections this course already has on the active schedule, keyed by which
  // COMPONENT they are. A course such as CHEM 11 legitimately needs a lecture
  // AND a lab at the same time, so a lab must never replace a lecture — only
  // another section of the same component replaces one.
  const eventsForCourse =
    workspace.activeSchedule?.events.filter(
      (e) =>
        e.kind === "section" &&
        e.courseCode?.toUpperCase() === selectedCourse?.toUpperCase(),
    ) ?? [];

  const existingEventForComponent = (component: string | null | undefined) =>
    eventsForCourse.find((e) => (e.componentType ?? "unknown") === (component ?? "unknown"));

  // Which components this course offers, from the grouped section list. A
  // section is only classified "lab" when SCU's bulletin says the course has
  // one, so this is a consistent view of what still needs scheduling.
  const offeredComponents = Array.from(
    new Set((sections ?? []).map((s) => s.componentType ?? "unknown")),
  );
  const scheduledComponents = new Set(
    eventsForCourse.map((e) => e.componentType ?? "unknown"),
  );
  const missingComponents = offeredComponents.filter(
    (c) => c !== "unknown" && !scheduledComponents.has(c),
  );
  const isMultiComponentCourse =
    offeredComponents.filter((c) => c !== "unknown").length > 1;

  const handleAddOrSwap = (sectionNumber: string, component: string | null | undefined) => {
    if (!workspace.activeScheduleId || !selectedCourse) return;

    const existing = existingEventForComponent(component);
    const existingEventId = existing?.id;

    if (existingEventId) {
      updateMut.mutate(
        {
          id: workspace.activeScheduleId,
          eventId: existingEventId,
          data: { sectionNumber },
        },
        {
          onSuccess: () => {
            workspace.invalidateSchedules();
            toast({
              title: `${COMPONENT_LABEL[component ?? "unknown"]} section swapped`,
              description:
                "Your other scheduled components for this course were left in place.",
            });
          },
          onError: () => toast({ title: "Failed to swap section", variant: "destructive" }),
        }
      );
    } else {
      addMut.mutate(
        {
          id: workspace.activeScheduleId,
          data: {
            kind: "section",
            courseCode: selectedCourse,
            sectionNumber,
          },
        },
        {
          onSuccess: () => {
            workspace.invalidateSchedules();
            toast({ title: "Section added to schedule" });
          },
          onError: (err: any) => {
            if (err?.status === 409) {
              toast({ title: "Section already on schedule", variant: "destructive" });
            } else {
              toast({ title: err?.body?.error || "Failed to add section", variant: "destructive" });
            }
          },
        }
      );
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          Find Courses
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code or title (e.g., CHEM 11)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedCourse(null);
            }}
            className="pl-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!debouncedQuery ? (
          <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground p-4">
            <Search className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">Search for a course to see available sections this quarter.</p>
          </div>
        ) : selectedCourse ? (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedCourse(null)} className="h-8 px-2 -ml-2 text-xs">
              ← Back to results
            </Button>
            <div>
              <h4 className="font-bold text-lg">{selectedCourse}</h4>
              <p className="text-sm text-muted-foreground">
                {isMultiComponentCourse
                  ? "This course is scheduled in more than one part. Add a section for each part."
                  : "Select a section to add to your schedule."}
              </p>

              {isMultiComponentCourse && (
                <div
                  className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900"
                  data-testid="multi-component-notice"
                >
                  {missingComponents.length > 0 ? (
                    <p data-testid="missing-components">
                      <strong>Still to schedule:</strong>{" "}
                      {missingComponents
                        .map((c) => COMPONENT_LABEL[c] ?? c)
                        .join(" + ")}
                      . Adding one part does not complete this course.
                    </p>
                  ) : (
                    <p data-testid="all-components-scheduled">
                      <strong>All parts scheduled.</strong> You have a section
                      for each part of this course.
                    </p>
                  )}
                  <p className="mt-1.5 opacity-90">
                    CampusVal does not know which lab pairs with which lecture —
                    linked component must be verified in Workday.
                  </p>
                </div>
              )}
            </div>

            {isFetchingSections ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !sections || sections.length === 0 ? (
              <div className="text-center p-4 text-sm text-muted-foreground bg-muted/30 rounded-md">
                No sections scheduled for this quarter.
              </div>
            ) : (
              <div className="space-y-5">
                {groupByComponent(sections).map(({ component, sections: group }) => (
                  <div key={component} data-testid={`section-group-${component}`}>
                    <div className="mb-2 flex items-baseline gap-2">
                      <h5 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        {COMPONENT_LABEL[component] ?? component} sections
                      </h5>
                      <span className="text-[10px] text-muted-foreground">
                        {group.length}
                        {component !== "unknown" && " · grouping inferred, verify in Workday"}
                      </span>
                    </div>
                    <div className="space-y-3">
                {group.map((sec) => {
                  const isOnSchedule = workspace.activeSchedule?.events.some(
                    (e) => e.kind === "section" && e.courseCode === selectedCourse && e.sectionNumber === sec.sectionNumber
                  );
                  const replaces = existingEventForComponent(sec.componentType);

                  return (
                  <div key={sec.id} className={`border rounded-md p-3 transition-colors bg-card ${isOnSchedule ? "border-emerald-500 bg-emerald-50/30" : "hover:border-primary/50"}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-mono font-bold text-primary flex items-center gap-2">
                        {sec.tentative ? "Tentative offering" : `Section ${sec.sectionNumber}`}
                        {isOnSchedule && <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600">Added</Badge>}
                      </div>
                      {sec.tentative && (
                        <Badge variant="secondary" className="text-[10px]">Tentative</Badge>
                      )}
                    </div>
                    <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {sec.meetingDays.length > 0 ? sec.meetingDays.join("") : "TBA"} •{" "}
                          {sec.startTime && sec.endTime ? `${format12(sec.startTime)} - ${format12(sec.endTime)}` : "Time TBA"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{sec.tentative ? "Instructor not published" : (sec.instructor || "Instructor TBA")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{sec.location || "Location TBA"}</span>
                      </div>
                      {sec.seatsKnown ? (
                        <div className="flex items-center gap-2 text-emerald-700">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span>{sec.seatsOpen} of {sec.seatsTotal} seats open</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 opacity-50" />
                          <span className="italic opacity-80">Seats unknown</span>
                        </div>
                      )}
                    </div>
                    {!isOnSchedule && (
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="w-full h-8 text-xs font-medium bg-primary/5 hover:bg-primary/10 text-primary"
                        onClick={() => handleAddOrSwap(sec.sectionNumber, sec.componentType)}
                        disabled={addMut.isPending || updateMut.isPending}
                        data-testid={`add-section-${sec.sectionNumber}`}
                      >
                        {replaces ? (
                          <>
                            <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
                            Replace this {(COMPONENT_LABEL[sec.componentType ?? "unknown"] ?? "section").toLowerCase()}
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add {(COMPONENT_LABEL[sec.componentType ?? "unknown"] ?? "section").toLowerCase()}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )})}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : searchResults?.courses.length === 0 ? (
          <div className="text-center p-4 text-sm text-muted-foreground">
            {searchResults.state === "no_matching_courses" 
              ? "No course matches the selected criteria." 
              : `Matching courses exist, but none has sections in ${workspace.activeTerm} ${workspace.activeYear}.`}
          </div>
        ) : (
          <div className="space-y-2">
            {searchResults?.courses.map((course) => (
              <div 
                key={course.code} 
                className="border rounded-md p-3 cursor-pointer hover:border-primary/50 transition-colors bg-card cv-card-hover"
                onClick={() => setSelectedCourse(course.code)}
              >
                <div className="font-bold text-sm text-foreground">{course.code}</div>
                <div className="text-xs text-muted-foreground truncate mb-2">{course.title}</div>
                <div className="flex items-center justify-between text-[10px]">
                  <Badge variant="outline" className="font-normal">{course.units} units</Badge>
                  {course.sectionsThisQuarter !== null && (
                    <span className="text-muted-foreground font-medium">
                      {course.sectionsThisQuarter} section{course.sectionsThisQuarter !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
