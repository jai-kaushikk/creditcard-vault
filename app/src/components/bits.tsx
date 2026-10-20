import { Image, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { formatMoney } from '@/lib/money';
import type { TxnStatus } from '@/lib/ledger';
import { useTheme } from '@/state/settings';
import { fonts, radius } from '@/theme/tokens';
import { Icon } from './Icon';
import { T } from './Text';

export function Avatar({ name, size = 40, tone, photo }: { name: string; size?: number; tone?: 'vault' | 'lent' | 'owe' | 'neutral'; photo?: string | null }) {
  const { c } = useTheme();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const t = tone ?? (['vault', 'lent', 'neutral'] as const)[hash % 3];
  const bg = { vault: c.vaultSoft, lent: c.lentSoft, owe: c.oweSoft, neutral: c.surfaceSunken }[t];
  const fg = { vault: c.vault, lent: c.lent, owe: c.owe, neutral: c.ink }[t];
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
  if (photo) {
    return <Image accessibilityIgnoresInvertColors source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }} />;
  }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <T color={fg} style={{ fontFamily: fonts.bold, fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.5) }}>{initials}</T>
    </View>
  );
}

const STATUS: Record<TxnStatus | 'shared', { label: string; glyph: string }> = {
  pending: { label: 'Pending', glyph: '○' },
  confirmed: { label: 'Confirmed', glyph: '●' },
  settled: { label: 'Settled', glyph: '✓' },
  disputed: { label: 'Disputed', glyph: '!' },
  expired: { label: 'Expired', glyph: '–' },
  shared: { label: 'Shared', glyph: '↗' },
};

export function StatusBadge({ status, label }: { status: TxnStatus | 'shared'; label?: string }) {
  const { c } = useTheme();
  const colors = {
    pending: [c.brassSoft, c.brassInk],
    confirmed: [c.lentSoft, c.lent],
    settled: [c.vaultSoft, c.vault],
    shared: [c.vaultSoft, c.vault],
    disputed: [c.dangerSoft, c.danger],
    expired: [c.surfaceSunken, c.inkMuted],
  }[status];
  const s = STATUS[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors[0], alignSelf: 'flex-start' }}>
      <T color={colors[1]} style={{ fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold }}>{s.glyph}</T>
      <T variant="caption" color={colors[1]} style={{ fontFamily: fonts.semibold }}>{label ?? s.label}</T>
    </View>
  );
}

export function Amount({
  minor,
  direction = 'neutral',
  size = 'sm',
  signed = true,
}: {
  minor: number;
  direction?: 'lent' | 'owe' | 'neutral';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  signed?: boolean;
}) {
  const { c } = useTheme();
  const color = { lent: c.lent, owe: c.owe, neutral: c.ink }[direction];
  const sign = signed ? (direction === 'lent' ? '+' : direction === 'owe' ? '−' : '') : '';
  const dims = { sm: [15, 22], md: [20, 26], lg: [32, 38], xl: [40, 44] }[size];
  const words = direction === 'lent' ? ' owed to you' : direction === 'owe' ? ' you owe' : '';
  return (
    <T
      accessibilityLabel={`${formatMoney(minor)}${words}`}
      color={color}
      style={{ fontFamily: fonts.bold, fontSize: dims[0], lineHeight: dims[1], fontVariant: ['tabular-nums'], letterSpacing: size === 'sm' ? 0 : -0.3 }}
    >
      {sign}
      {formatMoney(minor)}
    </T>
  );
}

export function Panel({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { c } = useTheme();
  return <View style={[{ backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: padded ? 16 : 0 }, style]}>{children}</View>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
      <T variant="headline" accessibilityRole="header">{title}</T>
      {action ? (
        <Pressable accessibilityRole="button" hitSlop={12} onPress={onAction}>
          <T variant="label" color="vault">{action}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A tappable row inside a Panel group. */
export function Row({
  title,
  subtitle,
  right,
  onPress,
  last,
  chevron,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
  chevron?: boolean;
}) {
  const { c } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 52, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1 }}>
        <T variant="body" style={{ fontFamily: fonts.semibold }}>{title}</T>
        {subtitle ? <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }}>{subtitle}</T> : null}
      </View>
      {right}
      {chevron ? <Icon name="chevronRight" size={18} color={c.inkMuted} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={{
        width: 52,
        height: 32,
        borderRadius: 16,
        backgroundColor: value ? c.vault : c.surfaceSunken,
        borderWidth: value ? 0 : 1,
        borderColor: c.lineStrong,
        justifyContent: 'center',
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, marginLeft: value ? 24 : 4, backgroundColor: value ? c.onVault : c.lineStrong }} />
    </Pressable>
  );
}

/** Selectable pill (friend chips, limit choices, filters). */
export function Chip({ label, selected, onPress, left }: { label: string; selected: boolean; onPress: () => void; left?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: left ? 4 : 16,
        paddingRight: 16,
        borderRadius: 999,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.vault : c.lineStrong,
        backgroundColor: selected ? c.vaultSoft : c.surfaceRaised,
      }}
    >
      {left}
      <T variant="label" color={selected ? 'vault' : 'ink'}>{label}</T>
    </Pressable>
  );
}

export function Notice({ tone = 'info', title, body, icon = 'clock' }: { tone?: 'info' | 'wait' | 'good' | 'bad'; title: string; body?: string; icon?: 'clock' | 'check' | 'alert' | 'lock' }) {
  const { c } = useTheme();
  const bg = { info: c.surfaceSunken, wait: c.brassSoft, good: c.vaultSoft, bad: c.dangerSoft }[tone];
  const fg = { info: c.ink, wait: c.brassInk, good: c.vault, bad: c.danger }[tone];
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.md, backgroundColor: bg }}>
      <Icon name={icon} size={20} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body" style={{ fontFamily: fonts.semibold }}>{title}</T>
        {body ? <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }}>{body}</T> : null}
      </View>
    </View>
  );
}
