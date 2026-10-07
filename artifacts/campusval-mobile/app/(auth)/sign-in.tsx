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
import { Link, Redirect, useRouter } from 'expo-router';
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
  const [code, setCode] = useState('');
  // CampusVal's sign-in instance signs in with an emailed one-time code (or Google); passwords are
  // not a sign-in method there, so the app asks for the email first and then the code.
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [ssoLoading, setSsoLoading] = useState(false);

  const handleSendCode = async () => {
    const { error } = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
    if (!error) setStep('code');
  };

  const handleVerify = async () => {
    const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
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

  const useDifferentEmail = () => {
    signIn.reset();
    setCode('');
    setStep('email');
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
          navigate: async () => {
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

  // Every hook above must run on every render. Returning before the hooks (as this used to)
  // makes the render after Clerk flips `isSignedIn` call FEWER hooks than the one before,
  // which React throws on ("Rendered fewer hooks than expected").
  if (isSignedIn) {
    // Navigate declaratively: calling router.replace while rendering updates the navigator mid-render.
    return <Redirect href="/(home)" />;
  }

  const styles = makeStyles(colors, insets);
  const busy = fetchStatus === 'fetching';
  const canSubmit = !busy && (step === 'email' ? /\S+@\S+\.\S+/.test(email.trim()) : code.trim().length >= 6);

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
          <Text style={styles.tagline}>SCU Academic Planning</Text>
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

        {step === 'email' ? (
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@scu.edu"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              accessibilityLabel="Email"
              testID="sign-in-email"
            />
            {errors?.fields?.identifier && (
              <Text style={styles.errorText}>{errors.fields.identifier.message}</Text>
            )}
            <Text style={styles.hint}>We'll email you a 6-digit sign-in code.</Text>
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={styles.label}>Code sent to {email.trim()}</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="123456"
              placeholderTextColor={colors.mutedForeground}
              maxLength={6}
              autoFocus
              accessibilityLabel="Sign-in code"
              testID="sign-in-code"
            />
            {errors?.fields?.code && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                That code didn't work. Check the latest email, or send a new code.
              </Text>
            )}
            <View style={styles.codeActions}>
              <Pressable onPress={() => void handleSendCode()} disabled={busy} accessibilityRole="button" style={styles.linkButton} testID="sign-in-resend">
                <Text style={styles.footerLink}>Send a new code</Text>
              </Pressable>
              <Pressable onPress={useDifferentEmail} accessibilityRole="button" style={styles.linkButton} testID="sign-in-change-email">
                <Text style={styles.footerLink}>Use a different email</Text>
              </Pressable>
            </View>
          </View>
        )}

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
          onPress={() => void (step === 'email' ? handleSendCode() : handleVerify())}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit, busy }}
          testID="sign-in-submit"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>{step === 'email' ? 'Email me a code' : 'Sign In'}</Text>
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
    hint: { fontSize: 12, color: colors.mutedForeground, marginTop: 6, fontFamily: 'Inter_400Regular' },
    codeInput: { fontSize: 22, letterSpacing: 6, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
    codeActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    linkButton: { minHeight: 44, justifyContent: 'center' },
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
