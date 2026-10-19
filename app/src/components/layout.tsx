import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/state/settings';
import { fonts, radius } from '@/theme/tokens';
import { Button } from './Button';
import { Glass } from './Glass';
import { T } from './Text';

/** A scrolling screen with the app ground, safe-area padding and an optional sticky footer. */
export function Screen({
  children,
  footer,
  tabs,
  scroll = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Leave room for the floating tab bar. */
  tabs?: boolean;
  scroll?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = tabs ? 120 : footer ? 16 : insets.bottom + 24;
  const body = (
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: bottomPad, gap: 16 }}>{children}</View>
  );
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never">{body}</ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 16, backgroundColor: c.surface, gap: 8 }}>{footer}</View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function TopBar({ back = 'Back', right }: { back?: string | null; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 40 }}>
      {back ? (
        <Button variant="glass" size="sm" icon="chevronLeft" label={back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      ) : (
        <View />
      )}
      {right}
    </View>
  );
}

export function Title({ children, sub }: { children: string; sub?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <T variant="display" accessibilityRole="header">{children}</T>
      {sub ? <T variant="body" color="inkMuted">{sub}</T> : null}
    </View>
  );
}

export function Field({ label, hint, mono, error, ...input }: TextInputProps & { label: string; hint?: string; mono?: boolean; error?: string | null }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label" color="inkMuted">{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.inkMuted}
        {...input}
        style={{
          height: 48,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          borderWidth: error ? 2 : 1,
          borderColor: error ? c.danger : c.lineStrong,
          backgroundColor: c.surfaceRaised,
          color: c.ink,
          fontFamily: mono ? fonts.mono : fonts.regular,
          fontSize: 15,
          letterSpacing: mono ? 1 : 0,
        }}
      />
      {error ? <T variant="caption" color="danger">{error}</T> : hint ? <T variant="caption" color="inkMuted">{hint}</T> : null}
    </View>
  );
}

/** A bottom sheet over a dimmed screen, for modal routes. */
export function Sheet({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="Close" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }} onPress={() => router.back()} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Glass strong radius={radius.lg} style={{ marginBottom: -radius.lg }}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 720 }} contentContainerStyle={{ padding: 24, paddingTop: 12, paddingBottom: insets.bottom + 24 + radius.lg, gap: 16 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.lineStrong, alignSelf: 'center', marginBottom: 4 }} />
            <View style={{ gap: 4 }}>
              <T variant="caption" color="inkMuted" style={{ letterSpacing: 0.7, fontFamily: fonts.semibold }}>{kicker.toUpperCase()}</T>
              <T variant="title" accessibilityRole="header">{title}</T>
            </View>
            {children}
          </ScrollView>
        </Glass>
      </KeyboardAvoidingView>
    </View>
  );
}

export function Facts({ items }: { items: [string, string][] }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
          <T variant="label" color="inkMuted" style={{ fontFamily: fonts.medium }}>{k}</T>
          <T variant="label" style={{ flexShrink: 1, textAlign: 'right' }}>{v}</T>
        </View>
      ))}
    </View>
  );
}
