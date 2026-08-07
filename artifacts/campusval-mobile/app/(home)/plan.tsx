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
import { useListPlans, useGetPlan } from '@workspace/api-client-react';
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

export default function PlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPadding = insets.bottom + (Platform.OS === 'web' ? 34 : 80);

  const { data: plansData, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = useListPlans({
    query: { retry: 1 },
  });

  const degreePlan = useMemo(
    () => plansData?.plans?.find(p => p.planType === 'degree') ?? plansData?.plans?.[0] ?? null,
    [plansData],
  );

  const { data: planDetail, isLoading: detailLoading, isError: detailError, refetch: refetchDetail, isRefetching } =
    useGetPlan(degreePlan?.id ?? 0, {
      query: { enabled: !!degreePlan?.id, retry: 1 },
    });

  const groups = useMemo(
    () => groupByTerm((planDetail?.items ?? []) as PlanItem[]),
    [planDetail],
  );

  const isLoading = plansLoading || detailLoading;
  const isError = plansError || detailError;

  const refetch = () => {
    refetchPlans();
    if (degreePlan?.id) refetchDetail();
  };

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

  return (
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
          <Text style={styles.emptyText}>Add courses to your degree plan on the web to see them here.</Text>
        </View>
      ) : (
        groups.map(group => (
          <TermGroupCard key={group.key} group={group} colors={colors} styles={styles} />
        ))
      )}
    </ScrollView>
  );
}

function TermGroupCard({ group, colors, styles }: {
  group: TermGroup;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
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
            <View
              key={item.id}
              style={[styles.courseRow, i < group.items.length - 1 && styles.courseBorder]}
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
              {item.units != null && (
                <Text style={styles.courseUnits}>{item.units}u</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

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
      alignItems: 'flex-start',
      paddingVertical: 10,
    },
    courseBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    courseLeft: { flex: 1 },
    courseCode: { fontSize: 13, fontFamily: 'Inter_700Bold', color: colors.primary },
    placeholderCode: { color: colors.mutedForeground },
    courseTitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.foreground, marginTop: 1 },
    courseNote: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 3 },
    courseUnits: {
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      color: colors.mutedForeground,
      marginLeft: 8,
      marginTop: 2,
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
  });
}
