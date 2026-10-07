import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ScrollView } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Link, Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * New accounts are created on the CampusVal website. The sign-in instance asks for more at
 * sign-up than this screen ever collected (a username and a phone number as well as the email
 * and a password), so a sign-up started here could never finish; the website's sign-up asks for
 * everything the instance requires. Once the account exists, the student signs in here with an
 * emailed code or Google.
 */
const domain = process.env.EXPO_PUBLIC_DOMAIN;
const webSignUpUrl = domain ? `https://${domain}/sign-up` : null;

export default function SignUpPage() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    // Navigate declaratively: calling router.replace while rendering updates the navigator mid-render.
    return <Redirect href="/(home)" />;
  }

  const styles = makeStyles(colors, insets);

  return (
    <ScrollView contentContainerStyle={styles.container} style={styles.flex}>
      <View style={styles.brand}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>CV</Text>
        </View>
        <Text style={styles.appName} accessibilityRole="header">
          Create your account
        </Text>
        <Text style={styles.tagline}>SCU Academic Planning</Text>
      </View>

      <Text style={styles.body}>
        New to CampusVal? Create your account on the CampusVal website with your SCU email. Then come back and sign in here
        with an emailed code or Google.
      </Text>

      {webSignUpUrl ? (
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          onPress={() => void WebBrowser.openBrowserAsync(webSignUpUrl)}
          accessibilityRole="link"
          accessibilityHint="Opens the CampusVal website"
          testID="sign-up-on-web"
        >
          <Ionicons name="open-outline" size={18} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Create my account</Text>
        </Pressable>
      ) : (
        <Text style={styles.body}>Create your account on the CampusVal website, then sign in here.</Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/(auth)/sign-in" asChild>
          <Pressable accessibilityRole="link" style={styles.linkButton} testID="sign-up-to-sign-in">
            <Text style={styles.footerLink}>Sign in</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    container: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 32),
      paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 32),
    },
    brand: { alignItems: 'center', marginBottom: 32 },
    logoCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    logoText: { fontSize: 26, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
    appName: { fontSize: 26, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
    tagline: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    body: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', color: colors.foreground, marginBottom: 20 },
    primaryButton: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    pressed: { opacity: 0.75 },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    footerText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    footerLink: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_600SemiBold' },
    linkButton: { minHeight: 44, justifyContent: 'center' },
  });
}
