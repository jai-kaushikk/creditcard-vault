import { router, usePathname } from 'expo-router';
import type { ComponentRef, RefObject } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/state/settings';
import { fonts } from '@/theme/tokens';
import { Glass } from './Glass';
import { Icon, type IconName } from './Icon';
import { T } from './Text';

const TABS: { href: '/' | '/friends' | '/ledger' | '/settings'; label: string; icon: IconName }[] = [
  { href: '/', label: 'Vault', icon: 'vault' },
  { href: '/friends', label: 'Friends', icon: 'friends' },
  { href: '/ledger', label: 'Ledger', icon: 'ledger' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

/** The floating liquid-glass tab bar; content scrolls underneath it. */
export function TabBar({ blurTarget }: { blurTarget: RefObject<ComponentRef<typeof View> | null> }) {
  const { c } = useTheme();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, 12) + 4 }}>
      <Glass blurTarget={blurTarget}>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, gap: 4 }}>
          {TABS.map((t) => {
            const active = t.href === '/' ? path === '/' : path.startsWith(t.href);
            return (
              <Pressable
                key={t.href}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t.label}
                onPress={() => router.navigate(t.href)}
                style={{ flex: 1, minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: active ? c.glassTint : 'transparent' }}
              >
                <Icon name={t.icon} color={active ? c.vault : c.inkMuted} />
                <T variant="caption" color={active ? 'vault' : 'inkMuted'} style={{ fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold }}>{t.label}</T>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}
