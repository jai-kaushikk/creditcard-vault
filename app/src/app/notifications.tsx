import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Notice } from '@/components/bits';
import { Icon } from '@/components/Icon';
import { Screen, Title, TopBar } from '@/components/layout';
import { T } from '@/components/Text';
import { useData } from '@/state/data';
import { useTheme } from '@/state/settings';
import { fonts, radius } from '@/theme/tokens';

function ago(iso: string, now: number) {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function Notifications() {
  const { c } = useTheme();
  const data = useData();
  const { markAllRead, notifications } = data;

  // Opening the list counts as reading it; leaving keeps the dots for this visit.
  useEffect(() => () => markAllRead(), [markAllRead]);

  return (
    <Screen>
      <TopBar back="Back" />
      <Title>Notifications</Title>
      {notifications.length === 0 ? (
        <Notice tone="info" icon="clock" title="Nothing yet" body="OTP requests, friend requests and payments show up here." />
      ) : (
        <View style={{ borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surfaceRaised }}>
          {notifications.map((n, i) => (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              onPress={() => n.href && router.push(n.href as never)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                gap: 12,
                padding: 16,
                opacity: pressed ? 0.7 : 1,
                borderBottomWidth: i === notifications.length - 1 ? 0 : 1,
                borderColor: c.line,
              })}
            >
              <View style={{ width: 8, paddingTop: 7 }}>
                {!n.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.vault }} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="body" style={{ fontFamily: n.read ? fonts.medium : fonts.semibold }}>{n.title}</T>
                <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }}>{n.body}</T>
                <T variant="caption" color="inkMuted">{ago(n.at, data.now)}</T>
              </View>
              {n.href ? <Icon name="chevronRight" size={16} color={c.inkMuted} /> : null}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
