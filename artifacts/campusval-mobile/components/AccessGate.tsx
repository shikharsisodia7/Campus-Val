import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useClerk, useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { useGetMyAccess, getGetMyAccessQueryKey } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

/**
 * Same rule as the web app's AccessGate: the server refuses every data request
 * from an account outside the current access population (pilot = invited
 * participants only), and this screen says so once instead of every tab
 * failing. Fails closed: nothing of the app renders until the server says yes.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data, isLoading, isError, refetch } = useGetMyAccess({
    query: { queryKey: getGetMyAccessQueryKey(), retry: 1, staleTime: 5 * 60 * 1000 },
  });

  if (isLoading) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (data?.allowed) return <>{children}</>;

  const title = isError || !data
    ? "We couldn't confirm your access"
    : data.accessMode === 'pilot'
      ? 'CampusVal is in a controlled pilot'
      : 'Access not available';
  const body = isError || !data
    ? 'CampusVal could not reach its server to check your account. Try again in a moment.'
    : data.message ?? 'This account does not have access to CampusVal.';

  return (
    <View
      style={[styles.flex, styles.center, styles.pad, { backgroundColor: colors.background }]}
      testID="pilot-access-denied"
    >
      <Feather name="shield" size={36} color={colors.mutedForeground} />
      <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">{title}</Text>
      <Text style={[styles.body, { color: colors.foreground }]}>{body}</Text>
      {data && !data.allowed && data.accessMode === 'pilot' && (
        <Text style={[styles.body, { color: colors.mutedForeground }]}>
          If you were invited, sign in with the address your invitation was sent to.
        </Text>
      )}
      {user?.primaryEmailAddress?.emailAddress ? (
        <Text style={[styles.small, { color: colors.mutedForeground }]}>
          Signed in as {user.primaryEmailAddress.emailAddress}
        </Text>
      ) : null}
      <View style={styles.row}>
        {(isError || !data) && (
          <Pressable
            accessibilityRole="button"
            style={[styles.button, { borderColor: colors.border }]}
            onPress={() => refetch()}
          >
            <Text style={{ color: colors.foreground, fontWeight: '600' }}>Try again</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => signOut()}
        >
          <Text style={{ color: colors.primaryForeground, fontWeight: '600' }}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: 28, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  small: { fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  button: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
});
