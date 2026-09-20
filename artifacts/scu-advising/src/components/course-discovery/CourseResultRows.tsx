import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DiscoveredCourse } from "./usePagedCourseSearch";

/**
 * Presentational list of discovered courses, shared by Degree Plan and Quarter
 * Plan discovery. It owns the things that previously went wrong in the
 * Filter tab:
 *   - a REAL, bounded scroll region (own height, keyboard-focusable), never a
 *     `flex-1` sliver that collapses when the controls above it are tall;
 *   - distinct loading / error / empty states;
 *   - "Show more" so a large category is never silently truncated.
 */
export function CourseResultRows({
  courses,
  areaLabel,
  totalMatching,
  totalWithSections,
  hasMore,
  isInitialLoading,
  isFetchingMore,
  isError,
  onRetry,
  onShowMore,
  emptyMessage,
  renderActions,
  showSections,
  ariaLabel,
  maxHeightClass = "max-h-[min(55vh,26rem)]",
}: {
  courses: DiscoveredCourse[];
  /** The Core area being listed, used to explain provenance badges. */
  areaLabel?: string;
  totalMatching: number;
  totalWithSections: number | null;
  hasMore: boolean;
  isInitialLoading: boolean;
  isFetchingMore: boolean;
  isError: boolean;
  onRetry: () => void;
  onShowMore: () => void;
  emptyMessage: ReactNode;
  renderActions: (course: DiscoveredCourse) => ReactNode;
  /** True when a quarter is selected and section counts are meaningful. */
  showSections: boolean;
  ariaLabel: string;
  maxHeightClass?: string;
}) {
  if (isError) {
    return (
      <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs" data-testid="course-results-error">
        <div className="flex items-start gap-1.5 text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Couldn't load courses. Check your connection and try again.</span>
        </div>
        <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={onRetry} data-testid="course-results-retry">
          Try again
        </Button>
      </div>
    );
  }

  if (isInitialLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground" role="status" data-testid="course-results-loading">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> Loading courses…
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground" data-testid="course-results-empty">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div data-testid="course-results">
      <p className="mb-1.5 text-[11px] text-muted-foreground" data-testid="course-results-count" aria-live="polite">
        Showing {courses.length} of {totalMatching} matching course{totalMatching === 1 ? "" : "s"}
        {showSections && totalWithSections !== null && <> · {totalWithSections} with sections this quarter</>}
      </p>
      <ul
        className={`${maxHeightClass} space-y-1.5 overflow-y-auto pr-1`}
        tabIndex={0}
        aria-label={ariaLabel}
        data-testid="course-results-list"
      >
        {courses.map((c) => {
          const source = areaLabel ? c.coreAreaSources?.[areaLabel] : undefined;
          return (
            <li
              key={c.code}
              className="rounded-md border border-border bg-card p-2 text-xs shadow-sm"
              data-testid={`course-result-${c.code.replace(/\s+/g, "-")}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-bold text-primary">{c.code}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-foreground">{c.title}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">{renderActions(c)}</div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>{c.units} units</span>
                {source && (
                  <span
                    className="rounded border border-border px-1 py-px"
                    title={
                      source === "catalog_text"
                        ? "The SCU Bulletin text for this course states this Core designation."
                        : "Inferred by CampusVal from the department and course number — confirm in Workday or the Bulletin."
                    }
                    data-testid={`course-source-${c.code.replace(/\s+/g, "-")}`}
                  >
                    {source === "catalog_text" ? "Stated in Bulletin" : "Inferred — confirm"}
                  </span>
                )}
                {showSections && c.sectionsThisQuarter !== null && (
                  <span data-testid={`course-sections-${c.code.replace(/\s+/g, "-")}`}>
                    {c.sectionsThisQuarter > 0
                      ? `${c.sectionsThisQuarter} section${c.sectionsThisQuarter === 1 ? "" : "s"} this quarter`
                      : "No sections this quarter"}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-8 w-full text-xs"
          onClick={onShowMore}
          disabled={isFetchingMore}
          data-testid="course-results-more"
        >
          {isFetchingMore ? "Loading…" : "Show more courses"}
        </Button>
      )}
    </div>
  );
}
