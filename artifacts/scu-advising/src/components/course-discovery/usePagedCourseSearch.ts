import { useEffect, useMemo, useRef, useState } from "react";
import {
  getSearchCoursesQueryKey,
  useSearchCourses,
  type SearchCoursesParams,
} from "@workspace/api-client-react";

const PAGE_SIZE = 50;

/** One result row as returned by /course-search (see CourseSearchResult in the API spec). */
export type DiscoveredCourse = {
  code: string;
  title: string;
  units: number;
  description?: string;
  coreAreas: string[];
  coreAreaSources?: Record<string, "catalog_text" | "heuristic">;
  sectionsThisQuarter: number | null;
};

/**
 * Course search that ACCUMULATES pages (limit/offset), so a Core click
 * returns the complete result set — "Show more" appends rather than
 * replacing, and nothing is silently truncated to a first page. Resets when
 * the filter changes. Used by both Degree Plan and Quarter Plan discovery so
 * they cannot disagree about what a category contains.
 */
export function usePagedCourseSearch(
  filter: Omit<SearchCoursesParams, "limit" | "offset">,
  enabled: boolean,
) {
  const filterKey = JSON.stringify(filter);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<DiscoveredCourse[]>([]);
  const lastKey = useRef(filterKey);

  // A new filter starts over.
  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      setOffset(0);
      setRows([]);
    }
  }, [filterKey]);

  const params: SearchCoursesParams = useMemo(
    () => ({ ...filter, limit: PAGE_SIZE, offset }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey, offset],
  );

  const query = useSearchCourses(params, {
    query: { enabled, queryKey: getSearchCoursesQueryKey(params) },
  });

  // Append this page's rows once, keyed by offset so a refetch can't duplicate them.
  const data = query.data;
  useEffect(() => {
    if (!data || lastKey.current !== filterKey) return;
    const incoming = data.courses as DiscoveredCourse[];
    setRows((prev) => {
      const head = prev.slice(0, data.offset ?? offset);
      return [...head, ...incoming];
    });
  }, [data, filterKey, offset]);

  return {
    rows,
    totalMatching: data?.totalMatching ?? 0,
    totalWithSections: data?.totalWithSections ?? null,
    state: data?.state,
    hasMore: !!data?.hasMore,
    isInitialLoading: enabled && query.isFetching && rows.length === 0,
    isFetchingMore: query.isFetching && rows.length > 0,
    isError: query.isError,
    refetch: () => void query.refetch(),
    showMore: () => setOffset(rows.length),
  };
}
