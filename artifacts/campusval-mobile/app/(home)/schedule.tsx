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
  Modal,
  TextInput,
  FlatList,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListSchedules,
  useGetSchedule,
  useDeleteScheduleEvent,
  useAddScheduleEvent,
  useListCourses,
  useListCourseSections,
  getListCoursesQueryKey,
  getListCourseSectionsQueryKey,
  getListSchedulesQueryKey,
  getGetScheduleQueryKey,
} from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const TERM_LABELS: Record<string, string> = {
  fall: 'Fall', winter: 'Winter', spring: 'Spring', summer: 'Summer',
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
  sectionNumber?: string | null;
};

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);
  const qc = useQueryClient();

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPadding = insets.bottom + (Platform.OS === 'web' ? 34 : 80);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: schedulesData, isLoading: listLoading, isError: listError, refetch: refetchList, isRefetching } =
    useListSchedules({}, { query: { queryKey: getListSchedulesQueryKey({}), retry: 1 } });

  const schedules = schedulesData?.schedules ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const effectiveId = selectedId ?? schedules[0]?.id ?? null;

  const { data: scheduleDetail, isLoading: detailLoading, isError: detailError, refetch: refetchDetail } =
    useGetSchedule(effectiveId ?? 0, {
      query: { queryKey: getGetScheduleQueryKey(effectiveId ?? 0), enabled: !!effectiveId, retry: 1 },
    });

  const events = (scheduleDetail?.events ?? []) as ScheduleEvent[];
  const selectedSchedule = schedules.find(s => s.id === effectiveId) ?? schedules[0];

  // ── add-section modal state ────────────────────────────────────────────────
  const [addModal, setAddModal] = useState(false);
  const [addStep, setAddStep] = useState<'search' | 'sections'>('search');
  const [courseQuery, setCourseQuery] = useState('');
  const [selectedCourseCode, setSelectedCourseCode] = useState<string>('');
  const [selectedCourseTitle, setSelectedCourseTitle] = useState<string>('');

  // ── course search ─────────────────────────────────────────────────────────
  const courseQueryParams = { search: courseQuery };
  const { data: courseList, isFetching: courseFetching } = useListCourses(
    courseQueryParams,
    { query: { queryKey: getListCoursesQueryKey(courseQueryParams), enabled: courseQuery.trim().length > 1 } },
  );

  // ── section list for selected course ──────────────────────────────────────
  const sectionParams = selectedSchedule
    ? { term: selectedSchedule.term as 'fall' | 'winter' | 'spring' | 'summer', year: selectedSchedule.year }
    : {};
  const { data: sectionList, isLoading: sectionsLoading } = useListCourseSections(
    selectedCourseCode,
    sectionParams,
    { query: { queryKey: getListCourseSectionsQueryKey(selectedCourseCode, sectionParams), enabled: !!selectedCourseCode && addStep === 'sections' && !!selectedSchedule } },
  );

  // ── mutations ──────────────────────────────────────────────────────────────
  const invalidateSchedule = () => {
    qc.invalidateQueries({ queryKey: getListSchedulesQueryKey({}) });
    if (effectiveId) {
      qc.invalidateQueries({ queryKey: getGetScheduleQueryKey(effectiveId) });
    }
  };

  const deleteMut = useDeleteScheduleEvent({
    mutation: { onSuccess: invalidateSchedule },
  });

  const addMut = useAddScheduleEvent({
    mutation: {
      onSuccess: () => {
        invalidateSchedule();
        closeAddModal();
      },
      onError: (err: unknown) => {
        const raw = err as { message?: string; status?: number };
        const msg = raw?.status === 409
          ? 'That section is already on this schedule.'
          : raw?.message ?? 'Could not add section. Try again.';
        Alert.alert('Error', msg);
      },
    },
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const isLoading = listLoading;
  const isError = listError;

  const refetch = () => {
    refetchList();
    if (effectiveId) refetchDetail();
  };

  function closeAddModal() {
    setAddModal(false);
    setAddStep('search');
    setCourseQuery('');
    setSelectedCourseCode('');
    setSelectedCourseTitle('');
  }

  function handleDeleteEvent(event: ScheduleEvent) {
    if (!effectiveId) return;
    const label = event.kind === 'section' ? event.courseCode ?? 'section' : event.name ?? 'commitment';
    Alert.alert(
      'Remove from Schedule',
      `Remove ${label} from this schedule?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteMut.mutate({ id: effectiveId, eventId: event.id }),
        },
      ],
    );
  }

  function handleAddSection(sectionNumber: string) {
    if (!effectiveId || !selectedCourseCode) return;
    addMut.mutate({
      id: effectiveId,
      data: { kind: 'section', courseCode: selectedCourseCode, sectionNumber },
    });
  }

  // ── event grouping ─────────────────────────────────────────────────────────
  const eventsByDay = useMemo(() => {
    const map: Record<string, ScheduleEvent[]> = {};
    for (const event of events) {
      for (const day of event.meetingDays) {
        if (!map[day]) map[day] = [];
        map[day]!.push(event);
      }
    }
    for (const day of Object.keys(map)) {
      map[day]!.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [events]);

  const activeDays = ALL_DAYS.filter(d => eventsByDay[d]);

  // ── render guards ──────────────────────────────────────────────────────────
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

  const courseResults = (courseList ?? []).map((c: { code: string; title: string; units: number; department: string }) => c);
  const sections = (sectionList ?? []) as Array<{
    sectionNumber: string;
    instructor?: string | null;
    meetingDays: string[];
    startTime: string;
    endTime: string;
    location?: string | null;
    seatsOpen?: number | null;
    seatsTotal?: number | null;
  }>;

  return (
    <View style={styles.flex}>
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
          {effectiveId && !detailLoading && (
            <Pressable
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => setAddModal(true)}
              accessibilityLabel="Add section"
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          )}
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
        {selectedSchedule && (
          <Text style={styles.scheduleName}>{selectedSchedule.name}</Text>
        )}

        {detailLoading && (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        {!detailLoading && events.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={36} color={colors.mutedForeground} />
            <Text style={styles.emptyTitle}>No courses added</Text>
            <Text style={styles.emptyText}>Tap Add to search for sections.</Text>
          </View>
        )}

        {/* Weekly view */}
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

        {/* Summary card with delete buttons */}
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
                <View style={styles.summaryRight}>
                  {event.units != null && (
                    <Text style={styles.summaryUnits}>{event.units}u</Text>
                  )}
                  <Pressable
                    onPress={() => handleDeleteEvent(event)}
                    style={styles.deleteBtn}
                    disabled={deleteMut.isPending}
                    accessibilityLabel={`Remove ${event.courseCode ?? event.name ?? 'event'}`}
                  >
                    {deleteMut.isPending ? (
                      <ActivityIndicator size="small" color={colors.mutedForeground} />
                    ) : (
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Add Section Modal ────────────────────────────────────────────── */}
      <Modal
        visible={addModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeAddModal}
      >
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Modal header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            {addStep === 'sections' ? (
              <Pressable onPress={() => { setAddStep('search'); setSelectedCourseCode(''); }} style={styles.modalBack}>
                <Feather name="arrow-left" size={20} color={colors.primary} />
              </Pressable>
            ) : (
              <View style={styles.modalBack} />
            )}
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {addStep === 'search' ? 'Add Section' : `${selectedCourseCode} Sections`}
            </Text>
            <Pressable onPress={closeAddModal} style={styles.modalClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Context line: which schedule we're adding to */}
          {selectedSchedule && (
            <View style={[styles.contextBar, { backgroundColor: colors.accent }]}>
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              <Text style={[styles.contextText, { color: colors.primary }]}>
                {selectedSchedule.name} · {TERM_LABELS[selectedSchedule.term] ?? selectedSchedule.term} {selectedSchedule.year}
              </Text>
            </View>
          )}

          {addStep === 'search' && (
            <>
              <View style={[styles.searchRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.searchInput, { color: colors.foreground }]}
                  placeholder="Search by course code or title…"
                  placeholderTextColor={colors.mutedForeground}
                  value={courseQuery}
                  onChangeText={setCourseQuery}
                  autoFocus
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {courseQuery.length > 0 && (
                  <Pressable onPress={() => setCourseQuery('')}>
                    <Feather name="x-circle" size={16} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>

              {courseFetching && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 16 }} />
              )}

              {!courseFetching && courseQuery.trim().length > 1 && courseResults.length === 0 && (
                <Text style={[styles.searchEmpty, { color: colors.mutedForeground }]}>No courses found.</Text>
              )}

              {courseQuery.trim().length <= 1 && (
                <Text style={[styles.searchEmpty, { color: colors.mutedForeground }]}>
                  Type at least 2 characters to search.
                </Text>
              )}

              <FlatList
                data={courseResults}
                keyExtractor={item => item.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.courseResultRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      setSelectedCourseCode(item.code);
                      setSelectedCourseTitle(item.title);
                      setAddStep('sections');
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.courseResultCode, { color: colors.primary }]}>{item.code}</Text>
                      <Text style={[styles.courseResultTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.courseResultDept, { color: colors.mutedForeground }]}>
                        {item.department}
                      </Text>
                    </View>
                    <Text style={[styles.courseResultUnits, { color: colors.mutedForeground }]}>
                      {item.units}u
                    </Text>
                  </Pressable>
                )}
              />
            </>
          )}

          {addStep === 'sections' && (
            <>
              <View style={[styles.selectedCourseCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                <Text style={[styles.selectedCourseCode, { color: colors.primary }]}>{selectedCourseCode}</Text>
                <Text style={[styles.selectedCourseTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {selectedCourseTitle}
                </Text>
              </View>

              {sectionsLoading && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 16 }} />
              )}

              {!sectionsLoading && sections.length === 0 && (
                <Text style={[styles.searchEmpty, { color: colors.mutedForeground }]}>
                  No sections available for this term.
                </Text>
              )}

              <FlatList
                data={sections}
                keyExtractor={s => s.sectionNumber}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: section }) => {
                  const alreadyAdded = events.some(
                    e => e.kind === 'section' && e.courseCode === selectedCourseCode && e.sectionNumber === section.sectionNumber,
                  );
                  return (
                    <Pressable
                      style={[
                        styles.sectionRow,
                        { borderBottomColor: colors.border },
                        alreadyAdded && { opacity: 0.5 },
                      ]}
                      onPress={() => !alreadyAdded && handleAddSection(section.sectionNumber)}
                      disabled={alreadyAdded || addMut.isPending}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sectionNum, { color: colors.primary }]}>
                          Section {section.sectionNumber}
                          {alreadyAdded ? '  ✓ Added' : ''}
                        </Text>
                        {section.instructor && (
                          <Text style={[styles.sectionMeta, { color: colors.foreground }]}>{section.instructor}</Text>
                        )}
                        <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>
                          {section.meetingDays.map(d => DAY_SHORT[d] ?? d).join(' ')}
                          {'  '}{formatTime(section.startTime)}–{formatTime(section.endTime)}
                        </Text>
                        {section.location && (
                          <Text style={[styles.sectionMeta, { color: colors.mutedForeground }]}>{section.location}</Text>
                        )}
                        {section.seatsOpen != null && (
                          <Text style={[styles.sectionMeta, { color: section.seatsOpen > 0 ? '#16A34A' : '#DC2626' }]}>
                            {section.seatsOpen > 0 ? `${section.seatsOpen} seats open` : 'Full'}
                            {section.seatsTotal != null ? ` / ${section.seatsTotal}` : ''}
                          </Text>
                        )}
                      </View>
                      {addMut.isPending ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : !alreadyAdded ? (
                        <Feather name="plus" size={20} color={colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    screenTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', color: colors.foreground },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    addButtonText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
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
    summaryRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
    summaryUnits: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.mutedForeground },
    deleteBtn: { padding: 4 },
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

    // Modal
    modalContainer: { flex: 1 },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
    },
    modalBack: { width: 36 },
    modalClose: { width: 36, alignItems: 'flex-end' },
    modalTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },

    contextBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    contextText: { fontSize: 13, fontFamily: 'Inter_500Medium' },

    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      margin: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: colors.radius,
      borderWidth: 1,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      paddingVertical: 0,
    },
    searchEmpty: {
      textAlign: 'center',
      marginTop: 32,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },

    courseResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    courseResultCode: { fontSize: 13, fontFamily: 'Inter_700Bold' },
    courseResultTitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 },
    courseResultDept: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
    courseResultUnits: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginLeft: 12 },

    selectedCourseCard: {
      margin: 16,
      padding: 14,
      borderRadius: colors.radius,
      borderWidth: 1,
    },
    selectedCourseCode: { fontSize: 14, fontFamily: 'Inter_700Bold' },
    selectedCourseTitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },

    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sectionNum: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
    sectionMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  });
}
