import { BlurView } from 'expo-blur';
import type { ComponentRef, ReactNode, RefObject } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/state/settings';

/**
 * The liquid-glass material: blur + a translucent fill + a light rim.
 * Chrome only (tab bar, nav buttons, chips, sheets) — never content.
 * On Android the blur needs a BlurTargetView ref; without one, the fill alone
 * (≥72% opaque) keeps text legible. With "Glass effects" off it is solid.
 */
export function Glass({
  children,
  style,
  strong,
  radius = 999,
  blurTarget,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
  radius?: number;
  blurTarget?: RefObject<ComponentRef<typeof View> | null>;
}) {
  const { c, scheme, glass } = useTheme();
  const shell: ViewStyle = {
    borderRadius: radius,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: glass ? c.glassStroke : c.line,
  };
  const shadow: ViewStyle = {
    shadowColor: c.shadow,
    shadowOpacity: scheme === 'dark' ? 0.5 : 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    borderRadius: radius,
  };

  if (!glass) {
    return (
      <View style={[shadow, style]}>
        <View style={[shell, { backgroundColor: c.surfaceRaised }]}>{children}</View>
      </View>
    );
  }

  const androidBlur = Platform.OS === 'android' && blurTarget;
  return (
    <View style={[shadow, style]}>
      <View style={shell}>
        {(Platform.OS === 'ios' || Platform.OS === 'web' || androidBlur) && (
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={strong ? 60 : 40}
            tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
            {...(androidBlur ? { blurTarget, blurMethod: 'dimezisBlurViewSdk31Plus' as const } : {})}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: strong ? c.glassFillStrong : c.glassFill }]} />
        <View style={[StyleSheet.absoluteFill, { borderTopWidth: 1, borderTopColor: c.glassHighlight, borderRadius: radius }]} pointerEvents="none" />
        {children}
      </View>
    </View>
  );
}
