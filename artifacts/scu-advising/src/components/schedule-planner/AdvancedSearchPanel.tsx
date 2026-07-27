import { useState, useMemo } from "react";
import { useListCoreAreas, useSearchCourses, getSearchCoursesQueryKey, SearchCoursesMatchMode } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Filter } from "lucide-react";
import { useScheduleWorkspace } from "./useScheduleWorkspace";
import { useDebounce } from "@/hooks/use-debounce";

export function AdvancedSearchPanel({ workspace }: { workspace: ReturnType<typeof useScheduleWorkspace> }) {
  const { data: coreAreasData } = useListCoreAreas();
  const coreAreas = coreAreasData?.coreAreas || [];
  
  const [selectedCores, setSelectedCores] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<SearchCoursesMatchMode>("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const isSearchActive = selectedCores.length > 0 || debouncedQuery.length > 0;

  const searchParams: any = {
    q: debouncedQuery || undefined,
    term: workspace.activeTerm || undefined,
    year: workspace.activeYear || undefined,
    coreAreas: selectedCores.length > 0 ? selectedCores.join(",") : undefined,
    matchMode: matchMode,
    limit: 20,
  };

  const { data: searchResults, isFetching } = useSearchCourses(
    searchParams,
    { query: { enabled: isSearchActive && !!workspace.activeTerm, queryKey: getSearchCoursesQueryKey(searchParams) } }
  );

  const toggleCore = (id: string) => {
    setSelectedCores((prev) => 
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          Find by Requirement
        </h3>
        
        <div className="space-y-4">
          <div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Optional keyword..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Match Criteria</Label>
            <RadioGroup value={matchMode} onValueChange={(v) => setMatchMode(v as "all" | "any")} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="r-all" />
                <Label htmlFor="r-all" className="text-xs font-normal">All selected</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="any" id="r-any" />
                <Label htmlFor="r-any" className="text-xs font-normal">Any selected</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Core Requirements</Label>
            <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-1 border rounded-md bg-muted/10">
              {coreAreas.map((core) => {
                const active = selectedCores.includes(core.name);
                return (
                  <Badge
                    key={core.name}
                    variant={active ? "default" : "outline"}
                    className={`cursor-pointer text-[10px] font-medium transition-colors ${
                      active ? "bg-primary hover:bg-primary/90" : "hover:bg-muted"
                    }`}
                    onClick={() => toggleCore(core.name)}
                  >
                    {core.name}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 opacity-50 pointer-events-none">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">SCU Pathways</Label>
            <Input disabled placeholder="Pathways filter unavailable" className="text-xs h-8" />
            <p className="text-[10px] text-muted-foreground">Pathway course mappings aren't available in CampusVal yet.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border-t pt-4">
        {!isSearchActive ? (
          <div className="text-center text-sm text-muted-foreground p-4">
            Select core areas to find fulfilling courses.
          </div>
        ) : isFetching ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : searchResults?.courses.length === 0 ? (
          <div className="text-center p-4 text-sm text-muted-foreground bg-muted/30 rounded-md">
            {searchResults.state === "no_matching_courses" 
              ? "No course matches the selected criteria." 
              : `Matching courses exist, but none has sections in ${workspace.activeTerm} ${workspace.activeYear}.`}
            {matchMode === "all" && selectedCores.length > 1 && (
              <div className="mt-2 text-xs italic text-primary/80">
                Note: Searching for "All" requires courses that satisfy multiple requirements simultaneously. Try "Any" to see more options.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground mb-2 flex justify-between">
              <span>{searchResults?.totalMatching} total matches</span>
              <span>Showing up to 20</span>
            </div>
            {searchResults?.courses.map((course) => (
              <div key={course.code} className="border rounded-md p-3 bg-card cv-card-hover">
                <div className="font-bold text-sm text-foreground">{course.code}</div>
                <div className="text-xs text-muted-foreground truncate mb-2">{course.title}</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {course.coreAreas.map(c => (
                    <Badge key={c} variant="secondary" className="text-[9px] px-1 py-0">{c}</Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-medium text-foreground">{course.units} units</span>
                  {course.sectionsThisQuarter !== null ? (
                    <span className="text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded-sm border border-emerald-100">
                      {course.sectionsThisQuarter} section{course.sectionsThisQuarter !== 1 ? 's' : ''} available
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">No sections</span>
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
