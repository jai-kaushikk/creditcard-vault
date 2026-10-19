import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/state/settings';
import { fonts, radius as R } from '@/theme/tokens';
import { Glass } from './Glass';
import { Icon, type IconName } from './Icon';
import { T } from './Text';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'glass';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  disabled,
  busy,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: Variant;
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const h = size === 'sm' ? 36 : 48;
  const fg = {
    primary: c.onVault,
    secondary: c.ink,
    quiet: c.vault,
    danger: c.danger,
    glass: c.ink,
  }[variant];
  const bg = { primary: c.vault, secondary: c.surfaceRaised, quiet: 'transparent', danger: 'transparent', glass: 'transparent' }[variant];
  const border = variant === 'secondary' || variant === 'danger' ? c.lineStrong : 'transparent';
  const inactive = disabled || busy;

  const content = (
    <View style={{ height: h, paddingHorizontal: size === 'sm' ? 16 : 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <T variant={size === 'sm' ? 'label' : 'headline'} color={fg} style={{ fontFamily: fonts.semibold, fontSize: size === 'sm' ? 13 : 15 }} numberOfLines={1}>
        {label}
      </T>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        { alignSelf: block ? 'stretch' : 'flex-start', opacity: inactive ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {variant === 'glass' ? (
        <Glass radius={R.pill}>{content}</Glass>
      ) : (
        <View style={{ backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: size === 'sm' ? R.sm : R.md }}>{content}</View>
      )}
    </Pressable>
  );
}
