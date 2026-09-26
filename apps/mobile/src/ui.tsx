import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './theme';

export function Screen({ children, refreshing, onRefresh, padded = true }: { children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void; padded?: boolean }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <ScrollView
        contentContainerStyle={padded ? { padding: 16, paddingBottom: 40, gap: 14 } : undefined}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}
export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = { primary: colors.ink, accent: colors.brand, secondary: colors.white, danger: colors.red }[variant];
  const fg = variant === 'secondary' ? colors.ink : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.line },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[s.input, props.editable === false && { opacity: 0.6 }]} />
      {error ? <Text style={{ color: colors.red, fontSize: 12 }}>{error}</Text> : hint ? <Muted style={{ fontSize: 12 }}>{hint}</Muted> : null}
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <View style={s.error}>
      <Text style={{ color: '#7f1d1d' }}>{children}</Text>
    </View>
  );
}

export function Notice({ title, children, tone = 'amber' }: { title?: string; children?: React.ReactNode; tone?: 'amber' | 'blue' | 'red' }) {
  const bg = { amber: '#fffbeb', blue: '#f0f9ff', red: '#fef2f2' }[tone];
  const border = { amber: '#fde68a', blue: '#bae6fd', red: '#fecaca' }[tone];
  return (
    <View style={{ backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 }}>
      {title && <Text style={{ fontWeight: '700', color: colors.ink }}>{title}</Text>}
      {typeof children === 'string' ? <Text style={{ color: colors.ink }}>{children}</Text> : children}
    </View>
  );
}

const STATUS: Record<string, [string, string]> = {
  ACTIVE: ['#ecfdf5', colors.green],
  APPROVED: ['#ecfdf5', colors.green],
  VERIFIED: ['#ecfdf5', colors.green],
  PAID: ['#ecfdf5', colors.green],
  SETTLED: ['#f0f9ff', '#0369a1'],
  FROZEN: ['#f0f9ff', '#0369a1'],
  PENDING: ['#fffbeb', colors.amber],
  DUE: ['#f1f5f9', '#334155'],
  IN_ARREARS: ['#fef2f2', colors.red],
  OVERDUE: ['#fef2f2', colors.red],
  DECLINED: ['#fef2f2', colors.red],
  REJECTED: ['#fef2f2', colors.red],
  DEFAULTED: ['#fef2f2', colors.red],
};

export function Status({ status }: { status: string }) {
  const [bg, fg] = STATUS[status] ?? ['#f1f5f9', '#334155'];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Text>
    </View>
  );
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Muted>{k}</Muted>
      {typeof v === 'string' || typeof v === 'number' ? <Text style={{ fontWeight: '600', color: colors.ink }}>{v}</Text> : v}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 999, borderWidth: 1, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : colors.white, paddingHorizontal: 12, paddingVertical: 7 }}>
      <Text style={{ color: on ? colors.white : colors.ink, fontSize: 13, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: 2 }}>
        <Image source={require('../assets/mark.png')} style={{ width: 28, height: 28 }} resizeMode="contain" />
      </View>
      <Text style={{ fontWeight: '900', fontSize: 19, letterSpacing: -0.5, color: light ? colors.white : colors.violet }}>
        XTRA<Text style={{ color: light ? colors.orange : colors.brand }}>-CASH</Text>
      </Text>
    </View>
  );
}

/** Parses a rand amount typed by the user into integer cents. */
export function toCents(text: string): number | null {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return text.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * 100);
}

const s = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  h2: { fontSize: 17, fontWeight: '700', color: colors.ink },
  muted: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 6 },
  btn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  error: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 12, padding: 12 },
});
