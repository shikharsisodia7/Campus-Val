import React from 'react';
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
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from '@workspace/api-client-react';
import { useUser, useClerk } from '@clerk/expo';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const REQUIRED_TO_GRADUATE = 175;

const TERM_LABELS: Record<string, string> = {
  fall: 'Fall',
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
};

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso: string): number {
  const now = new Date();
  const target = new Date(iso + 'T12:00:00');
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { signOut } = useClerk();

  const { data, isLoading, isError, refetch, isRefetching } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), retry: 1 },
  });

  const styles = makeStyles(colors, insets);

  const topPadding = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const bottomPadding = insets.bottom + (Platform.OS === 'web' ? 34 : 80);

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.flex, styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={styles.emptyTitle}>Couldn't load dashboard</Text>
        <Text style={styles.emptyText}>Check your connection and try again.</Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { profile, currentRegistrationWindow, upcomingDeadlines, warnings,
    progressPercent, totalUnitsAllSources, unitsToGraduation,
    nextTerm, nextTermYear, classification } = data;

  const windowStatus = currentRegistrationWindow?.status;

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
          <Text style={styles.greeting}>
            Hello, {profile?.name?.split(' ')[0] ?? user?.firstName ?? 'there'}
          </Text>
          {profile && (
            <Text style={styles.subGreeting}>
              {profile.major} · {classification ?? profile.studentType}
            </Text>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.6 }]}
          onPress={() => signOut()}
        >
          <Feather name="log-out" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Registration Window Banner */}
      {currentRegistrationWindow && (
        <View style={[
          styles.regBanner,
          windowStatus === 'open' && styles.regBannerOpen,
          windowStatus === 'upcoming' && styles.regBannerUpcoming,
          windowStatus === 'closed' && styles.regBannerClosed,
        ]}>
          <View style={styles.regBannerTop}>
            <Ionicons
              name={windowStatus === 'open' ? 'checkmark-circle' : windowStatus === 'upcoming' ? 'time' : 'lock-closed'}
              size={22}
              color={
                windowStatus === 'open' ? '#166534' :
                windowStatus === 'upcoming' ? '#854D0E' :
                colors.mutedForeground
              }
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[
                styles.regHeadline,
                windowStatus === 'open' && { color: '#166534' },
                windowStatus === 'upcoming' && { color: '#854D0E' },
                windowStatus === 'closed' && { color: colors.mutedForeground },
              ]}>
                {currentRegistrationWindow.headline}
              </Text>
              {currentRegistrationWindow.detail ? (
                <Text style={styles.regDetail}>{currentRegistrationWindow.detail}</Text>
              ) : null}
            </View>
          </View>
          {currentRegistrationWindow.myWaveDate && (
            <View style={styles.regWaveRow}>
              <Feather name="calendar" size={14} color={colors.mutedForeground} />
              <Text style={styles.regWaveText}>
                Your wave: {currentRegistrationWindow.myWaveLabel ?? formatDate(currentRegistrationWindow.myWaveDate)}
                {' '}
                ({daysUntil(currentRegistrationWindow.myWaveDate) > 0
                  ? `in ${daysUntil(currentRegistrationWindow.myWaveDate)} days`
                  : 'today'})
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Progress Card */}
      {profile && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="award" size={18} color={colors.secondary} />
            <Text style={styles.cardTitle}>Degree Progress</Text>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressUnits}>
              {totalUnitsAllSources ?? profile.unitsCompletedAtSCU} / {REQUIRED_TO_GRADUATE} units
            </Text>
            <Text style={styles.progressPct}>
              {Math.round(progressPercent ?? 0)}%
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(100, progressPercent ?? 0)}%` as any },
              ]}
            />
          </View>
          <Text style={styles.progressSub}>
            {unitsToGraduation > 0
              ? `${unitsToGraduation} units remaining`
              : 'Graduation requirements met'}
          </Text>
          <View style={styles.divider} />
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {TERM_LABELS[nextTerm] ?? nextTerm} {nextTermYear}
              </Text>
              <Text style={styles.statLabel}>Next Term</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {profile.expectedGradTerm
                  ? `${TERM_LABELS[profile.expectedGradTerm] ?? ''} ${profile.expectedGradYear}`
                  : '—'}
              </Text>
              <Text style={styles.statLabel}>Expected Grad</Text>
            </View>
          </View>
        </View>
      )}

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="warning-outline" size={18} color="#CA8A04" />
            <Text style={styles.cardTitle}>Notices</Text>
          </View>
          {warnings.map((w, i) => (
            <View key={i} style={styles.warningRow}>
              <Ionicons name="alert-circle" size={14} color="#CA8A04" style={{ marginTop: 2 }} />
              <Text style={styles.warningText}>{w}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Upcoming Deadlines */}
      {upcomingDeadlines && upcomingDeadlines.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="clock" size={18} color={colors.primary} />
            <Text style={styles.cardTitle}>Upcoming Deadlines</Text>
          </View>
          {upcomingDeadlines.map((d, i) => {
            const days = daysUntil(d.date);
            return (
              <View key={i} style={[styles.deadlineRow, i < upcomingDeadlines.length - 1 && styles.deadlineBorder]}>
                <View style={styles.deadlineDateChip}>
                  <Text style={styles.deadlineDays}>
                    {days <= 0 ? 'Today' : `${days}d`}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deadlineTitle}>{d.title}</Text>
                  <Text style={styles.deadlineDate}>{formatDate(d.date)}</Text>
                  {d.description && (
                    <Text style={styles.deadlineDesc}>{d.description}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* No profile state */}
      {!profile && (
        <View style={styles.card}>
          <View style={styles.center}>
            <Ionicons name="person-circle-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { marginTop: 8 }]}>Profile not set up</Text>
            <Text style={styles.emptyText}>Set up your profile on the web to see your degree progress here.</Text>
          </View>
        </View>
      )}
    </ScrollView>
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
    greeting: { fontSize: 26, fontFamily: 'Inter_700Bold', color: colors.foreground },
    subGreeting: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    signOutBtn: { padding: 8 },
    regBanner: {
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      padding: 14,
      marginBottom: 16,
    },
    regBannerOpen: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
    regBannerUpcoming: { backgroundColor: '#FEFCE8', borderColor: '#FDE047' },
    regBannerClosed: { backgroundColor: colors.muted, borderColor: colors.border },
    regBannerTop: { flexDirection: 'row', alignItems: 'flex-start' },
    regHeadline: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flexWrap: 'wrap' },
    regDetail: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 4 },
    regWaveRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
    regWaveText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.foreground },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
    progressUnits: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.foreground },
    progressPct: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.primary },
    progressBar: {
      height: 8,
      backgroundColor: colors.muted,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 6,
    },
    progressFill: { height: 8, backgroundColor: colors.primary, borderRadius: 4 },
    progressSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
    statsRow: { flexDirection: 'row', gap: 12 },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.foreground, textAlign: 'center' },
    statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    warningRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    warningText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.foreground, lineHeight: 18 },
    deadlineRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, alignItems: 'flex-start' },
    deadlineBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
    deadlineDateChip: {
      minWidth: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deadlineDays: { fontSize: 12, fontFamily: 'Inter_700Bold', color: colors.primary },
    deadlineTitle: { fontSize: 14, fontFamily: 'Inter_500Medium', color: colors.foreground },
    deadlineDate: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    deadlineDesc: { fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: 2 },
    emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.foreground, marginTop: 12 },
    emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, textAlign: 'center', marginTop: 6 },
    retryButton: {
      marginTop: 16,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingHorizontal: 24,
      paddingVertical: 10,
    },
    retryText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  });
}
