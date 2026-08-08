import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignIn, useSSO, useAuth } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

export default function SignInPage() {
  useWarmUpBrowser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  if (isSignedIn) {
    router.replace('/(home)');
    return null;
  }

  const handleSignIn = async () => {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;
    if (signIn.status === 'complete') {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl('/');
          router.replace(url.startsWith('http') ? '/(home)' : (url as never));
        },
      });
    }
  };

  const handleGoogle = useCallback(async () => {
    setSsoLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId) {
        setActive!({
          session: createdSessionId,
          navigate: async ({ decorateUrl }) => {
            router.replace('/(home)');
          },
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSsoLoading(false);
    }
  }, [startSSOFlow, router]);

  const styles = makeStyles(colors, insets);
  const canSubmit = email.trim().length > 0 && password.length > 0 && fetchStatus !== 'fetching';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>CV</Text>
          </View>
          <Text style={styles.appName}>CampusVal</Text>
          <Text style={styles.tagline}>SCU Academic Advising</Text>
        </View>

        {/* Google SSO */}
        <Pressable
          style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}
          onPress={handleGoogle}
          disabled={ssoLoading}
        >
          {ssoLoading ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={colors.foreground} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Email */}
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@scu.edu"
            placeholderTextColor={colors.mutedForeground}
            autoCorrect={false}
          />
          {errors?.fields?.identifier && (
            <Text style={styles.errorText}>{errors.fields.identifier.message}</Text>
          )}
        </View>

        {/* Password */}
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
            />
            <Pressable
              onPress={() => setShowPassword(v => !v)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color={colors.mutedForeground}
              />
            </Pressable>
          </View>
          {errors?.fields?.password && (
            <Text style={styles.errorText}>{errors.fields.password.message}</Text>
          )}
        </View>

        {/* General error */}
        {errors?.global && errors.global.length > 0 && (
          <View style={styles.alertBox}>
            <Text style={styles.alertText}>{errors.global[0]?.message ?? 'Sign-in failed.'}</Text>
          </View>
        )}

        {/* Submit */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            (!canSubmit) && styles.primaryDisabled,
            pressed && canSubmit && styles.pressed,
          ]}
          onPress={handleSignIn}
          disabled={!canSubmit}
        >
          {fetchStatus === 'fetching' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Sign In</Text>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable>
              <Text style={styles.footerLink}>Sign up</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    brand: { alignItems: 'center', marginBottom: 40 },
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
    appName: { fontSize: 28, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
    tagline: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground },
    googleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingVertical: 14,
      backgroundColor: colors.card,
    },
    googleButtonText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.foreground },
    dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    field: { marginBottom: 16 },
    label: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.foreground, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: colors.foreground,
      backgroundColor: colors.card,
    },
    passwordRow: { flexDirection: 'row', alignItems: 'center' },
    passwordInput: { flex: 1 },
    eyeButton: { position: 'absolute', right: 12, padding: 4 },
    errorText: { fontSize: 12, color: colors.destructive, marginTop: 4, fontFamily: 'Inter_400Regular' },
    alertBox: {
      backgroundColor: '#FEF2F2',
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: '#FECACA',
      padding: 12,
      marginBottom: 16,
    },
    alertText: { color: '#DC2626', fontSize: 13, fontFamily: 'Inter_400Regular' },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryDisabled: { opacity: 0.4 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    pressed: { opacity: 0.75 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
    footerText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
    footerLink: { fontSize: 14, color: colors.primary, fontFamily: 'Inter_600SemiBold' },
  });
}
