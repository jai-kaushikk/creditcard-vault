import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '@/state/settings';
import { type, type Palette } from '@/theme/tokens';

type Variant = keyof typeof type;

export function T({
  variant = 'body',
  color = 'ink',
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: keyof Palette | (string & {}); style?: TextStyle | TextStyle[] }) {
  const { c } = useTheme();
  const resolved = (c as Record<string, string>)[color] ?? color;
  return <Text {...rest} style={[type[variant], { color: resolved }, style]} />;
}
