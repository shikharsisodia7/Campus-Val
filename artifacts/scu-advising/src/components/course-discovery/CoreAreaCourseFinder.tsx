import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseResultRows } from "./CourseResultRows";
import { usePagedCourseSearch, type DiscoveredCourse } from "./usePagedCourseSearch";

/**
 * "Which catalog courses satisfy this Core requirement?" — the click target
 * behind a Core requirement (Critical Thinking & Writing, Advanced Writing,
 * C&I, …) in the Degree Plan / Tentative Degree Plan requirements palette.
 *
 * It searches by the CANONICAL Core-area tag the requirement maps to (the same
 * definition Quarter Plan's Filter tab and the course search API use), returns
 * the whole result set paged, and says plainly when the catalog has no
 * tagging for an area — it never fabricates a list.
 */
export function CoreAreaCourseFinder({
  coreAreaTag,
  requirementLabel,
  onAdd,
  disabled,
}: {
  /** Canonical tag from the requirement's `coreArea` (e.g. "Critical Thinking & Writing"). */
  coreAreaTag: string;
  requirementLabel: string;
  onAdd: (course: DiscoveredCourse) => void;
  disabled?: boolean;
}) {
  const search = usePagedCourseSearch({ coreAreas: coreAreaTag, matchMode: "all" }, true);

  return (
    <div className="space-y-1.5" data-testid="core-area-finder">
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Catalog courses tagged <strong>{coreAreaTag}</strong>. A tag is either stated in the SCU
        Bulletin or inferred from department and course number — confirm it in Workday or the
        Bulletin before relying on it.
      </p>
      <CourseResultRows
        courses={search.rows}
        areaLabel={coreAreaTag}
        totalMatching={search.totalMatching}
        totalWithSections={search.totalWithSections}
        hasMore={search.hasMore}
        isInitialLoading={search.isInitialLoading}
        isFetchingMore={search.isFetchingMore}
        isError={search.isError}
        onRetry={search.refetch}
        onShowMore={search.showMore}
        showSections={false}
        ariaLabel={`Courses that satisfy ${requirementLabel}`}
        maxHeightClass="max-h-72"
        emptyMessage={
          <>
            CampusVal's catalog has no courses tagged <strong>{coreAreaTag}</strong>. It only lists a
            course when the Bulletin text or a department rule ties it to this requirement — check
            the SCU Bulletin or Workday for the approved list.
          </>
        }
        renderActions={(c) => (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0 text-muted-foreground hover:text-primary"
            onClick={() => onAdd(c)}
            disabled={disabled}
            aria-label={`Add ${c.code}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      />
    </div>
  );
}
