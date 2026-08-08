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
  useListPlans,
  useGetPlan,
  useDeletePlanItem,
  useAddPlanItem,
  useUpdatePlanItem,
  useListCourses,
  getListCoursesQueryKey,
  getListPlansQueryKey,
  getGetPlanQueryKey,
} from '@workspace/api-client-react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const TERM_ORDER: Record<string, number> = { fall: 0, winter: 1, spring: 2, summer: 3, completed: 99 };
const TERM_LABELS: Record<string, string> = {
  fall: 'Fall', winter: 'Winter', spring: 'Spring', summer: 'Summer', completed: 'Completed',
};

type PlanItem = {
  id: number;
  itemType: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  units?: number | null;
  requirementLabel?: string | null;
  academicYear: number;
  term: string;
  bucket: string;
  note?: string | null;
};

type TermGroup = {
  key: string;
  academicYear: number;
  term: string;
  label: string;
  items: PlanItem[];
};

type CourseOption = {
  code: string;
  title: string;
  units: number;
  department: string;
};

type TermOption = {
  academicYear: number;
  term: string;
  label: string;
};

function groupByTerm(items: PlanItem[]): TermGroup[] {
  const map = new Map<string, TermGroup>();
  for (const item of items) {
    const key = `${item.academicYear}-${item.term}`;
    if (!map.has(key)) {
      const yearLabel =
        item.term === 'completed'
          ? 'Completed'
          : item.academicYear === 0
          ? ''
          : `${item.academicYear}–${item.academicYear + 1}`;
      const label = item.term === 'completed'
        ? 'Completed Before Plan'
        : `${TERM_LABELS[item.term] ?? item.term} ${yearLabel}`;
      map.set(key, { key, academicYear: item.academicYear, term: item.term, label, items: [] });
    }
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.academicYear !== b.academicYear) return a.academicYear - b.academicYear;
    return (TERM_ORDER[a.term] ?? 99) - (TERM_ORDER[b.term] ?? 99);
  });
}

function unitSum(items: PlanItem[]): number {
  return items.reduce((s, i) => s + (i.units ?? 0), 0);
}

function defaultTermOptions(): TermOption[] {
  const now = new Date();
  const baseYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const opts: TermOption[] = [];
  for (let y = baseYear; y <= baseYear + 3; y++) {
    for (const term of ['fall', 'winter', 'spring', 'summer']) {
      const yearLabel = `${y}–${y + 1}`;
      opts.push({ academicYear: y, term, label: `${TERM_LABELS[term]} ${yearLabel}` });
    }
  }
  return opts;
}

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);
  const qc = useQueryClient();

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPadding = insets.bottom + (Platform.OS === 'web' ? 34 : 80);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: plansData, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = useListPlans({
    query: { queryKey: getListPlansQueryKey(), retry: 1 },
  });

  const degreePlan = useMemo(
    () => plansData?.plans?.find(p => p.planType === 'degree') ?? plansData?.plans?.[0] ?? null,
    [plansData],
  );

  const { data: planDetail, isLoading: detailLoading, isError: detailError, refetch: refetchDetail, isRefetching } =
    useGetPlan(degreePlan?.id ?? 0, {
      query: { queryKey: getGetPlanQueryKey(degreePlan?.id ?? 0), enabled: !!degreePlan?.id, retry: 1 },
    });

  const groups = useMemo(
    () => groupByTerm((planDetail?.items ?? []) as PlanItem[]),
    [planDetail],
  );

  // ── add-course modal state ─────────────────────────────────────────────────
  const [addModal, setAddModal] = useState(false);
  const [addStep, setAddStep] = useState<'search' | 'term'>('search');
  const [courseQuery, setCourseQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<CourseOption | null>(null);

  // ── move-term modal state ──────────────────────────────────────────────────
  const [moveItem, setMoveItem] = useState<PlanItem | null>(null);

  // ── course search ─────────────────────────────────────────────────────────
  const courseQueryParams = { search: courseQuery };
  const { data: courseList, isFetching: courseFetching } = useListCourses(
    courseQueryParams,
    { query: { queryKey: getListCoursesQueryKey(courseQueryParams), enabled: courseQuery.trim().length > 1 } },
  );

  // ── term options ───────────────────────────────────────────────────────────
  const termOptions = useMemo<TermOption[]>(() => {
    const planned = groups.filter(g => g.term !== 'completed').map(g => ({
      academicYear: g.academicYear,
      term: g.term,
      label: g.label,
    }));
    if (planned.length > 0) return planned;
    return defaultTermOptions().slice(0, 8);
  }, [groups]);

  // ── mutations ──────────────────────────────────────────────────────────────
  const invalidatePlan = () => {
    qc.invalidateQueries({ queryKey: getListPlansQueryKey() });
    if (degreePlan?.id) {
      qc.invalidateQueries({ queryKey: getGetPlanQueryKey(degreePlan.id) });
    }
  };

  const deleteMut = useDeletePlanItem({
    mutation: { onSuccess: invalidatePlan },
  });

  const addMut = useAddPlanItem({
    mutation: {
      onSuccess: () => {
        invalidatePlan();
        closeAddModal();
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? 'Could not add course. Try again.';
        Alert.alert('Error', msg);
      },
    },
  });

  const moveMut = useUpdatePlanItem({
    mutation: {
      onSuccess: () => {
        invalidatePlan();
        setMoveItem(null);
      },
      onError: () => {
        Alert.alert('Error', 'Could not move course. Try again.');
      },
    },
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  const isLoading = plansLoading || detailLoading;
  const isError = plansError || detailError;

  const refetch = () => {
    refetchPlans();
    if (degreePlan?.id) refetchDetail();
  };

  function closeAddModal() {
    setAddModal(false);
    setAddStep('search');
    setCourseQuery('');
    setSelectedCourse(null);
  }

  function handleLongPress(item: PlanItem) {
    const label = item.courseCode ?? item.requirementLabel ?? 'this item';
    Alert.alert(label, 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to Term…',
        onPress: () => setMoveItem(item),
      },
      {
        text: 'Remove from Plan',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Remove Course',
            `Remove ${label} from your degree plan?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => {
                  if (!degreePlan?.id) return;
                  deleteMut.mutate({ id: degreePlan.id, itemId: item.id });
                },
              },
            ],
          );
        },
      },
    ]);
  }

  function handleAddCourseToTerm(opt: TermOption) {
    if (!selectedCourse || !degreePlan?.id) return;
    addMut.mutate({
      id: degreePlan.id,
      data: {
        itemType: 'course',
        courseCode: selectedCourse.code,
        academicYear: opt.academicYear,
        term: opt.term as 'fall' | 'winter' | 'spring' | 'summer' | 'completed',
      },
    });
  }

  function handleMoveToTerm(opt: TermOption) {
    if (!moveItem || !degreePlan?.id) return;
    moveMut.mutate({
      id: degreePlan.id,
      itemId: moveItem.id,
      data: {
        academicYear: opt.academicYear,
        term: opt.term as 'fall' | 'winter' | 'spring' | 'summer' | 'completed',
      },
    });
  }

  // ── render guards ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading degree plan…</Text>
      </View>
    );
  }

  if (isError || !plansData) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={styles.emptyTitle}>Couldn't load plan</Text>
        <Text style={styles.emptyText}>Check your connection and try again.</Text>
        <Pressable style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!degreePlan) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="document-outline" size={48} color={colors.mutedForeground} />
        <Text style={styles.emptyTitle}>No degree plan yet</Text>
        <Text style={styles.emptyText}>Set up your degree plan on the web to see it here.</Text>
      </View>
    );
  }

  const courseResults: CourseOption[] = (courseList ?? []).map((c: { code: string; title: string; units: number; department: string }) => ({
    code: c.code,
    title: c.title,
    units: c.units,
    department: c.department,
  }));

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingTop: topPadding + 16, paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.screenTitle}>Degree Plan</Text>
            <Text style={styles.planName}>{planDetail?.name ?? degreePlan.name}</Text>
          </View>
          {degreePlan && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{degreePlan.itemCount} courses</Text>
            </View>
          )}
        </View>

        {groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="layers-outline" size={40} color={colors.mutedForeground} />
            <Text style={styles.emptyTitle}>No courses added yet</Text>
            <Text style={styles.emptyText}>Tap + to add your first course.</Text>
          </View>
        ) : (
          groups.map(group => (
            <TermGroupCard
              key={group.key}
              group={group}
              colors={colors}
              styles={styles}
              onLongPress={handleLongPress}
              isMutating={deleteMut.isPending || moveMut.isPending}
            />
          ))
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={[styles.fab, { bottom: bottomPadding + 16 }]}
        onPress={() => { setAddModal(true); setAddStep('search'); }}
        accessibilityLabel="Add course to plan"
      >
        <Feather name="plus" size={26} color="#FFFFFF" />
      </Pressable>

      {/* ── Add Course Modal ─────────────────────────────────────────────── */}
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
            {addStep === 'term' ? (
              <Pressable onPress={() => setAddStep('search')} style={styles.modalBack}>
                <Feather name="arrow-left" size={20} color={colors.primary} />
              </Pressable>
            ) : (
              <View style={styles.modalBack} />
            )}
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {addStep === 'search' ? 'Add Course' : 'Pick Term'}
            </Text>
            <Pressable onPress={closeAddModal} style={styles.modalClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {addStep === 'search' && (
            <>
              {/* Search input */}
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
                      setSelectedCourse(item);
                      setAddStep('term');
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

          {addStep === 'term' && selectedCourse && (
            <>
              <View style={[styles.selectedCourseCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                <Text style={[styles.selectedCourseCode, { color: colors.primary }]}>{selectedCourse.code}</Text>
                <Text style={[styles.selectedCourseTitle, { color: colors.foreground }]} numberOfLines={2}>
                  {selectedCourse.title}
                </Text>
              </View>
              <Text style={[styles.termPickLabel, { color: colors.mutedForeground }]}>
                Choose a term to add this course:
              </Text>
              <FlatList
                data={termOptions}
                keyExtractor={item => `${item.academicYear}-${item.term}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.termOptionRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleAddCourseToTerm(item)}
                    disabled={addMut.isPending}
                  >
                    <Text style={[styles.termOptionLabel, { color: colors.foreground }]}>{item.label}</Text>
                    {addMut.isPending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Feather name="plus" size={18} color={colors.primary} />
                    )}
                  </Pressable>
                )}
              />
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Move Term Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={!!moveItem}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMoveItem(null)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.modalBack} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Move to Term</Text>
            <Pressable onPress={() => setMoveItem(null)} style={styles.modalClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {moveItem && (
            <View style={[styles.selectedCourseCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Text style={[styles.selectedCourseCode, { color: colors.primary }]}>
                {moveItem.courseCode ?? 'TBD'}
              </Text>
              <Text style={[styles.selectedCourseTitle, { color: colors.foreground }]} numberOfLines={2}>
                {moveItem.courseTitle ?? moveItem.requirementLabel ?? ''}
              </Text>
              <Text style={[styles.courseResultDept, { color: colors.mutedForeground }]}>
                Currently: {moveItem.term !== 'completed'
                  ? `${TERM_LABELS[moveItem.term] ?? moveItem.term} ${moveItem.academicYear}–${moveItem.academicYear + 1}`
                  : 'Completed'}
              </Text>
            </View>
          )}

          <FlatList
            data={termOptions}
            keyExtractor={item => `${item.academicYear}-${item.term}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isCurrent = moveItem?.academicYear === item.academicYear && moveItem?.term === item.term;
              return (
                <Pressable
                  style={[styles.termOptionRow, { borderBottomColor: colors.border, opacity: isCurrent ? 0.4 : 1 }]}
                  onPress={() => !isCurrent && handleMoveToTerm(item)}
                  disabled={isCurrent || moveMut.isPending}
                >
                  <Text style={[styles.termOptionLabel, { color: colors.foreground }]}>{item.label}</Text>
                  {moveMut.isPending ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : isCurrent ? (
                    <Feather name="check" size={18} color={colors.mutedForeground} />
                  ) : (
                    <Feather name="arrow-right" size={18} color={colors.primary} />
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

// ── TermGroupCard ────────────────────────────────────────────────────────────

function TermGroupCard({
  group, colors, styles, onLongPress, isMutating,
}: {
  group: TermGroup;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
  onLongPress: (item: PlanItem) => void;
  isMutating: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const isCompleted = group.term === 'completed';
  const units = unitSum(group.items);

  return (
    <View style={[styles.termCard, isCompleted && styles.completedCard]}>
      <Pressable
        style={styles.termHeader}
        onPress={() => setExpanded(e => !e)}
      >
        <View style={styles.termHeaderLeft}>
          {isCompleted ? (
            <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
          ) : (
            <View style={styles.termDot} />
          )}
          <Text style={[styles.termLabel, isCompleted && styles.completedLabel]}>
            {group.label}
          </Text>
        </View>
        <View style={styles.termHeaderRight}>
          {units > 0 && (
            <Text style={styles.termUnits}>{units} units</Text>
          )}
          <Feather
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.mutedForeground}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.courseList}>
          {group.items.map((item, i) => (
            <Pressable
              key={item.id}
              style={[styles.courseRow, i < group.items.length - 1 && styles.courseBorder]}
              onLongPress={() => onLongPress(item)}
              delayLongPress={400}
              disabled={isMutating}
            >
              <View style={styles.courseLeft}>
                {item.itemType === 'course' ? (
                  <>
                    <Text style={styles.courseCode}>{item.courseCode}</Text>
                    <Text style={styles.courseTitle}>{item.courseTitle ?? '—'}</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.courseCode, styles.placeholderCode]}>TBD</Text>
                    <Text style={styles.courseTitle}>{item.requirementLabel ?? 'Requirement Placeholder'}</Text>
                  </>
                )}
                {item.note ? (
                  <Text style={styles.courseNote}>{item.note}</Text>
                ) : null}
              </View>
              <View style={styles.courseRowRight}>
                {item.units != null && (
                  <Text style={styles.courseUnits}>{item.units}u</Text>
                )}
                <Feather name="more-vertical" size={14} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

function makeStyles(colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 24 },
    scroll: { paddingHorizontal: 16 },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    screenTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', color: colors.foreground },
    planName: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    badge: {
      backgroundColor: colors.accent,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 4,
      marginTop: 4,
    },
    badgeText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.primary },
    termCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      overflow: 'hidden',
    },
    completedCard: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
    termHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 14,
    },
    termHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    termHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    termDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    termLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    completedLabel: { color: '#166534' },
    termUnits: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground },
    courseList: { paddingHorizontal: 14, paddingBottom: 10 },
    courseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
    },
    courseBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    courseLeft: { flex: 1 },
    courseRowRight: { flexDirection: 'row', alignItems: 'center' },
    courseCode: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.primary },
    placeholderCode: { color: colors.mutedForeground },
    courseTitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.foreground, marginTop: 1 },
    courseNote: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 3 },
    courseUnits: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginLeft: 8,
    },
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

    // FAB
    fab: {
      position: 'absolute',
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 6,
    },

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

    termPickLabel: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      paddingHorizontal: 16,
      marginBottom: 4,
    },
    termOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    termOptionLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  });
}
