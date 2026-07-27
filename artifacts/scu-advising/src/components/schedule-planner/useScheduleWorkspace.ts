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

  const listParams = { term: activeTerm as Term, year: activeYear! };
  const { data: listData, isLoading: isLoadingList } = useListSchedules(
    listParams,
    { query: { enabled: !!activeTerm && !!activeYear, queryKey: getListSchedulesQueryKey(listParams) } }
  );

  const schedules = listData?.schedules ?? [];

  useEffect(() => {
    if (schedules.length > 0) {
      if (!activeScheduleId || !schedules.find(s => s.id === activeScheduleId)) {
        setActiveScheduleId(schedules[0].id);
      }
    } else {
      setActiveScheduleId(null);
    }
  }, [schedules, activeScheduleId]);

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
