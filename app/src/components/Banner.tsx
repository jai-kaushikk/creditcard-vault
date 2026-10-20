import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '@/state/data';
import { useTheme } from '@/state/settings';
import { fonts } from '@/theme/tokens';
import { Glass } from './Glass';
import { Icon } from './Icon';
import { T } from './Text';

const SHOW_MS = 6000;

/** The newest notification, dropped in at the top while the app is open. */
export function Banner() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { banner, dismissBanner } = useData();

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(dismissBanner, SHOW_MS);
    return () => clearTimeout(t);
  }, [banner, dismissBanner]);

  if (!banner) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        onPress={() => {
          dismissBanner();
          if (banner.href) router.push(banner.href as never);
        }}
      >
        <Glass strong radius={20}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.vaultSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bell" size={18} color={c.vault} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="body" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>{banner.title}</T>
              <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }} numberOfLines={2}>{banner.body}</T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={dismissBanner}>
              <Icon name="x" size={16} color={c.inkMuted} />
            </Pressable>
          </View>
        </Glass>
      </Pressable>
    </View>
  );
}
