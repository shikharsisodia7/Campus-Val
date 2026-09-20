import { useState } from "react";
import { useListCoreAreas } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CalendarSearch, Filter, Search, X } from "lucide-react";
import { useScheduleWorkspace } from "./useScheduleWorkspace";
import { useDebounce } from "@/hooks/use-debounce";
import { CourseResultRows } from "@/components/course-discovery/CourseResultRows";
import { usePagedCourseSearch } from "@/components/course-discovery/usePagedCourseSearch";

type MatchMode = "all" | "any";

/**
 * Quarter Plan → Filter: find courses by Core requirement (and/or keyword).
 *
 * Uses the same canonical Core-area definitions and the same paged search as
 * the Degree Plan requirement "Find courses" control, so CTW / Advanced
 * Writing / C&I mean the same thing in both places.
 *
 * LAYOUT NOTE. This used to be a `flex flex-col h-full` column whose results
 * were `flex-1 overflow-y-auto` — so the tall controls above claimed the
 * panel's fixed height and the results got a sliver (about one card). The
 * panel now flows naturally inside the tab's own scroll container and the
 * results list owns an explicit, bounded scroll region of its own.
 */
export function AdvancedSearchPanel({
  workspace,
  onFindSections,
}: {
  workspace: ReturnType<typeof useScheduleWorkspace>;
  /** Jump to a course's sections in the Find tab. */
  onFindSections?: (courseCode: string) => void;
}) {
  const { data: coreAreasData } = useListCoreAreas();
  const coreAreas = coreAreasData?.coreAreas ?? [];

  const [selectedCores, setSelectedCores] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>("all");
  const [query, setQuery] = useState("");
  // Default: the COMPLETE catalog result set, with per-course section counts —
  // not a list silently narrowed to whatever happens to be scheduled.
  const [offeredOnly, setOfferedOnly] = useState(false);
  const debouncedQuery = useDebounce(query.trim(), 300);

  const isSearchActive = selectedCores.length > 0 || debouncedQuery.length > 0;
  const hasQuarter = !!workspace.activeTerm && !!workspace.activeYear;
  const quarterLabel = hasQuarter
    ? `${workspace.activeTerm![0]!.toUpperCase()}${workspace.activeTerm!.slice(1)} ${workspace.activeYear}`
    : "";

  const search = usePagedCourseSearch(
    {
      q: debouncedQuery || undefined,
      coreAreas: selectedCores.length > 0 ? selectedCores.join(",") : undefined,
      matchMode,
      ...(hasQuarter
        ? { term: workspace.activeTerm as any, year: workspace.activeYear as number, offeredOnly }
        : {}),
    },
    isSearchActive,
  );

  const toggleCore = (name: string) =>
    setSelectedCores((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));

  const clearFilters = () => {
    setSelectedCores([]);
    setQuery("");
    setMatchMode("all");
    setOfferedOnly(false);
  };

  const emptyMessage =
    search.state === "no_sections_this_quarter" ? (
      <>Matching courses exist, but none has sections in {quarterLabel}. Turn off "Only courses offered in {quarterLabel}" to see them.</>
    ) : (
      <>
        No catalog course matches these filters.
        {matchMode === "all" && selectedCores.length > 1 && (
          <span className="mt-1 block italic text-primary/80">
            "All selected" needs a course that satisfies every chosen requirement at once — try "Any selected".
          </span>
        )}
      </>
    );

  return (
    <div className="space-y-4" data-testid="advanced-search-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
          Find by Requirement
        </h3>
        {(selectedCores.length > 0 || query) && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="mr-1 h-3 w-3" aria-hidden="true" /> Clear filters
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="Keyword, course code, or Core code such as CTW"
          placeholder="Optional keyword or code (e.g. CTW)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 text-sm"
          data-testid="input-filter-keyword"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Core Requirements
        </legend>
        <div className="flex flex-wrap gap-1.5" data-testid="core-chips">
          {coreAreas.map((core) => {
            const active = selectedCores.includes(core.name);
            const empty = core.courseCount === 0;
            return (
              <button
                key={core.name}
                type="button"
                aria-pressed={active}
                disabled={empty}
                title={empty ? "The CampusVal catalog has no courses tagged for this area." : undefined}
                onClick={() => toggleCore(core.name)}
                data-testid={`core-chip-${core.code ?? core.name}`}
                className={`rounded-full border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {core.code ? <span className="font-semibold">{core.code}</span> : null}
                {core.code ? " · " : ""}
                {core.name}
                <span className="ml-1 opacity-70">({core.courseCount})</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <RadioGroup
          value={matchMode}
          onValueChange={(v) => setMatchMode(v as MatchMode)}
          className="flex gap-4"
          aria-label="Match mode when several requirements are selected"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="r-all" />
            <Label htmlFor="r-all" className="text-xs font-normal">All selected</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="any" id="r-any" />
            <Label htmlFor="r-any" className="text-xs font-normal">Any selected</Label>
          </div>
        </RadioGroup>

        {hasQuarter && (
          <label className="flex items-center gap-2 text-xs" htmlFor="offered-only">
            <input
              id="offered-only"
              type="checkbox"
              checked={offeredOnly}
              onChange={(e) => setOfferedOnly(e.target.checked)}
              className="h-4 w-4 rounded border-border"
              data-testid="toggle-offered-only"
            />
            <CalendarSearch className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Only courses offered in {quarterLabel}
          </label>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground">
        SCU Pathways: course mappings aren't available in CampusVal yet. Core tags are either stated
        in the SCU Bulletin or inferred from department and course number — confirm in Workday.
      </p>

      <div className="border-t pt-3">
        {!isSearchActive ? (
          <p className="p-2 text-center text-sm text-muted-foreground" data-testid="filter-prompt">
            Select a Core requirement above to see the courses that satisfy it.
          </p>
        ) : (
          <CourseResultRows
            courses={search.rows}
            areaLabel={selectedCores.length === 1 ? selectedCores[0] : undefined}
            totalMatching={search.totalMatching}
            totalWithSections={search.totalWithSections}
            hasMore={search.hasMore}
            isInitialLoading={search.isInitialLoading}
            isFetchingMore={search.isFetchingMore}
            isError={search.isError}
            onRetry={search.refetch}
            onShowMore={search.showMore}
            showSections={hasQuarter}
            ariaLabel="Matching courses"
            maxHeightClass="max-h-[min(60vh,32rem)]"
            emptyMessage={emptyMessage}
            renderActions={(c) => (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => onFindSections?.(c.code)}
                disabled={!onFindSections}
                aria-label={`View sections for ${c.code}`}
              >
                View sections
              </Button>
            )}
          />
        )}
      </div>
    </div>
  );
}
