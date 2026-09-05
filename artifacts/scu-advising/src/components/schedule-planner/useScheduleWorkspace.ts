import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetScheduleAvailability,
  useListSchedules,
  useGetSchedule,
  Term,
  getListSchedulesQueryKey,
  getGetScheduleQueryKey,
} from "@workspace/api-client-react";

export function useScheduleWorkspace() {
  const queryClient = useQueryClient();

  const { data: availability, isLoading: isLoadingAvailability } = useGetScheduleAvailability();

  const defaultTerm = availability?.terms?.[0];
  
  const [activeTerm, setActiveTerm] = useState<Term | null>(null);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [activeScheduleId, setActiveScheduleId] = useState<number | null>(null);

  useEffect(() => {
    if (!activeTerm && !activeYear && defaultTerm) {
      setActiveTerm(defaultTerm.term);
      setActiveYear(defaultTerm.year);
    }
  }, [activeTerm, activeYear, defaultTerm]);

  // Switching quarters (e.g. clicking a different term in the overview)
  // changes activeTerm/activeYear immediately, but the schedules-list query
  // for the new quarter hasn't resolved yet. Without this, activeScheduleId
  // keeps pointing at the PREVIOUS quarter's schedule for the whole
  // round-trip, and useGetSchedule below happily serves that already-cached
  // schedule — so the calendar renders the old quarter's events under the
  // new quarter's header until the new list loads. Clear it immediately so a
  // quarter switch shows a loading gap instead of the wrong quarter's data.
  useEffect(() => {
    setActiveScheduleId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTerm, activeYear]);

  const listParams = { term: activeTerm as Term, year: activeYear! };
  const { data: listData, isLoading: isLoadingList, isFetching: isFetchingList } = useListSchedules(
    listParams,
    { query: { enabled: !!activeTerm && !!activeYear, queryKey: getListSchedulesQueryKey(listParams) } }
  );

  const schedules = listData?.schedules ?? [];

  useEffect(() => {
    // Skip while a fetch is in flight: React Query keeps showing the last
    // *settled* list during a background refetch, so right after creating
    // this quarter's first schedule (invalidateSchedules() + a still-in-
    // flight refetch), `schedules` can still read as the old, empty list
    // for one tick. Without this guard that empty read hits the `else`
    // branch and resets the activeScheduleId a caller just set, which
    // unmounts/remounts Find Courses and drops any in-flight "jump to this
    // course" intent. Wait for the refetch to settle before deciding.
    if (isFetchingList) return;
    if (schedules.length > 0) {
      if (!activeScheduleId || !schedules.find(s => s.id === activeScheduleId)) {
        setActiveScheduleId(schedules[0].id);
      }
    } else {
      setActiveScheduleId(null);
    }
  }, [schedules, activeScheduleId, isFetchingList]);

  const { data: activeSchedule, isLoading: isLoadingDetail } = useGetSchedule(
    activeScheduleId!,
    { query: { enabled: !!activeScheduleId, queryKey: getGetScheduleQueryKey(activeScheduleId!) } }
  );

  const invalidateSchedules = () => {
    queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith("/api/schedules"),
    });
  };

  return {
    availability,
    isLoadingAvailability,
    activeTerm,
    activeYear,
    setActiveTerm,
    setActiveYear,
    schedules,
    isLoadingList,
    activeScheduleId,
    setActiveScheduleId,
    activeSchedule,
    isLoadingDetail,
    invalidateSchedules,
  };
}
