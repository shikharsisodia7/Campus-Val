import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { useListSchedules, useGetSchedule } from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const TERM_LABELS: Record<string, string> = {
  fall: 'Fall', winter: 'Winter', spring: 'Spring', summer: 'Summer',
};

const DAY_LABELS: Record<string, string> = {
  M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday',
  F: 'Friday', S: 'Saturday', U: 'Sunday',
};
const DAY_SHORT: Record<string, string> = {
  M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu',
  F: 'Fri', S: 'Sat', U: 'Sun',
};
const ALL_DAYS = ['M', 'T', 'W', 'R', 'F'];

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM';
  const hour = (h ?? 0) % 12 || 12;
  return `${hour}:${String(m ?? 0).padStart(2, '0')} ${ampm}`;
}

type ScheduleEvent = {
  id: number;
  kind: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  name?: string | null;
  instructor?: string | null;
  location?: string | null;
  meetingDays: string[];
  startTime: string;
  endTime: string;
  units?: number | null;
};

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPadding = insets.bottom + (Platform.OS === 'web' ? 34 : 80);

  const { data: schedulesData, isLoading: listLoading, isError: listError, refetch: refetchList, isRefetching } =
    useListSchedules({}, { query: { retry: 1 } });

  const schedules = schedulesData?.schedules ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Pick the most recent schedule by default
  const effectiveId = selectedId ?? schedules[0]?.id ?? null;

  const { data: scheduleDetail, isLoading: detailLoading, isError: detailError, refetch: refetchDetail } =
    useGetSchedule(effectiveId ?? 0, {
      query: { enabled: !!effectiveId, retry: 1 },
    });

  const events = (scheduleDetail?.events ?? []) as ScheduleEvent[];

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    for (const event of events) {
      for (const day of event.meetingDays) {
        if (!map[day]) map[day] = [];
        map[day]!.push(event);
      }
    }
    // Sort each day's events by start time
    for (const day of Object.keys(map)) {
      map[day]!.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [events]);

  const activeDays = ALL_DAYS.filter(d => eventsByDay[d]);

  const isLoading = listLoading;
  const isError = listError;

  const refetch = () => {
    refetchList();
    if (effectiveId) refetchDetail();
  };

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading schedules…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={styles.emptyTitle}>Couldn't load schedules</Text>
        <Pressable style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (schedules.length === 0) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="calendar-outline" size={48} color={colors.mutedForeground} />
        <Text style={styles.emptyTitle}>No schedules yet</Text>
        <Text style={styles.emptyText}>Create a quarter schedule on the web to see it here.</Text>
      </View>
    );
  }

  const selectedSchedule = schedules.find(s => s.id === effectiveId) ?? schedules[0]!;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scroll, { paddingTop: topPadding + 16, paddingBottom: bottomPadding }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Schedule</Text>
      </View>

      {/* Schedule Picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pickerRow}
        contentContainerStyle={styles.pickerContent}
      >
        {schedules.map(s => {
          const isActive = s.id === effectiveId;
          return (
            <Pressable
              key={s.id}
              style={[styles.pickerChip, isActive && styles.pickerChipActive]}
              onPress={() => setSelectedId(s.id)}
            >
              <Text style={[styles.pickerChipText, isActive && styles.pickerChipTextActive]}>
                {TERM_LABELS[s.term] ?? s.term} {s.year}
              </Text>
              {s.eventCount > 0 && (
                <Text style={[styles.pickerCount, isActive && styles.pickerCountActive]}>
                  {s.eventCount}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Schedule Name */}
      <Text style={styles.scheduleName}>{selectedSchedule.name}</Text>

      {detailLoading && (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {!detailLoading && events.length === 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={36} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>No courses added</Text>
          <Text style={styles.emptyText}>Add course sections to this schedule on the web.</Text>
        </View>
      )}

      {/* Weekly view — active days with events */}
      {!detailLoading && activeDays.length > 0 && (
        <View style={styles.weekGrid}>
          {activeDays.map(day => (
            <View key={day} style={styles.dayColumn}>
              <Text style={styles.dayHeader}>{DAY_SHORT[day]}</Text>
              {(eventsByDay[day] ?? []).map(event => (
                <EventCard key={`${event.id}-${day}`} event={event} colors={colors} styles={styles} />
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Summary card */}
      {!detailLoading && events.length > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.cardHeader}>
            <Feather name="info" size={16} color={colors.mutedForeground} />
            <Text style={styles.cardTitle}>All Courses</Text>
          </View>
          {events.map((event, i) => (
            <View key={event.id} style={[styles.summaryRow, i < events.length - 1 && styles.summaryBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryCode}>
                  {event.kind === 'section' ? event.courseCode : event.name ?? 'Commitment'}
                </Text>
                <Text style={styles.summaryTitle}>
                  {event.kind === 'section' ? event.courseTitle : null}
                </Text>
                {event.instructor && (
                  <Text style={styles.summaryMeta}>{event.instructor}</Text>
                )}
                {event.location && (
                  <Text style={styles.summaryMeta}>{event.location}</Text>
                )}
                <Text style={styles.summaryMeta}>
                  {event.meetingDays.map(d => DAY_SHORT[d] ?? d).join(', ')}
                  {'  '}{formatTime(event.startTime)}–{formatTime(event.endTime)}
                </Text>
              </View>
              {event.units != null && (
                <Text style={styles.summaryUnits}>{event.units}u</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function EventCard({ event, colors, styles }: {
  event: ScheduleEvent;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const isSection = event.kind === 'section';
  return (
    <View style={[styles.eventCard, !isSection && styles.eventCardCommitment]}>
      <Text style={styles.eventCode} numberOfLines={1}>
        {isSection ? event.courseCode : event.name ?? 'Commitment'}
      </Text>
      <Text style={styles.eventTime}>
        {formatTime(event.startTime)}–{formatTime(event.endTime)}
      </Text>
      {event.location ? (
        <Text style={styles.eventLocation} numberOfLines={1}>{event.location}</Text>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    scroll: { paddingHorizontal: 16 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    screenTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', color: colors.foreground },
    pickerRow: { marginBottom: 8 },
    pickerContent: { paddingRight: 16, gap: 8, flexDirection: 'row' },
    pickerChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: colors.card,
    },
    pickerChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    pickerChipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground },
    pickerChipTextActive: { color: '#FFFFFF' },
    pickerCount: {
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
      color: colors.mutedForeground,
      backgroundColor: colors.muted,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    pickerCountActive: { backgroundColor: 'rgba(255,255,255,0.25)', color: '#FFFFFF' },
    scheduleName: {
      fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.mutedForeground,
      marginBottom: 16, marginTop: 4,
    },
    weekGrid: { flexDirection: 'column', gap: 12, marginBottom: 16 },
    dayColumn: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    dayHeader: {
      fontSize: 12,
      fontFamily: 'Inter_700Bold',
      color: colors.primary,
      backgroundColor: colors.accent,
      paddingHorizontal: 12,
      paddingVertical: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    eventCard: {
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    eventCardCommitment: { borderLeftColor: colors.secondary },
    eventCode: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.primary },
    eventTime: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    eventLocation: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 1 },
    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    summaryRow: { flexDirection: 'row', paddingVertical: 10, alignItems: 'flex-start' },
    summaryBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    summaryCode: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.primary },
    summaryTitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.foreground, marginTop: 1 },
    summaryMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    summaryUnits: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground, marginLeft: 8, marginTop: 2 },
    emptyCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 32,
      alignItems: 'center',
    },
    emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.foreground, marginTop: 12 },
    emptyText: {
      fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground,
      textAlign: 'center', marginTop: 6, lineHeight: 18,
    },
    retryButton: {
      marginTop: 16, backgroundColor: colors.primary, borderRadius: colors.radius,
      paddingHorizontal: 24, paddingVertical: 10,
    },
    retryText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    loadingText: { marginTop: 12, fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
  });
}
