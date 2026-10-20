import Constants from 'expo-constants';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar, Notice, Panel, Row, StatusBadge, Toggle } from '@/components/bits';
import { Button } from '@/components/Button';
import { Screen, Title } from '@/components/layout';
import { T } from '@/components/Text';
import { googleConfigured, serverConfigured } from '@/lib/config';
import { formatMoney } from '@/lib/money';
import { enableSystemNotifications } from '@/lib/notify';
import { confirmAction, isWeb } from '@/lib/platform';
import { useAuth } from '@/state/auth';
import { useData } from '@/state/data';
import { useSettings } from '@/state/settings';
import { fonts } from '@/theme/tokens';

const LOCK_STEPS = [0, 60, 300, 900];
const LIMIT_STEPS = [200000, 500000, 1000000, 2500000];
const DAY_STEPS = [1, 7, 14, 30];
const next = <V,>(steps: V[], v: V) => steps[(steps.indexOf(v) + 1) % steps.length];
const lockLabel = (s: number) => (s === 0 ? 'Immediately' : s < 120 ? '1 minute' : `${s / 60} minutes`);

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T variant="caption" color="inkMuted" style={{ letterSpacing: 0.7, fontFamily: fonts.semibold, marginTop: 8, marginLeft: 4 }}>{label.toUpperCase()}</T>
      <Panel padded={false}>{children}</Panel>
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, update, c } = useSettings();
  const { user, signOut } = useAuth();
  const data = useData();
  const [notifyState, setNotifyState] = useState<'unknown' | 'on' | 'blocked'>('unknown');

  const wipe = async () => {
    const ok = await confirmAction(
      isWeb ? 'Delete everything in this browser?' : 'Delete everything on this phone?',
      'Your cards, friends and ledger copy are removed from this device. This can’t be undone.',
      'Delete',
      true,
    );
    if (!ok) return;
    await data.clearAll();
    await signOut();
  };

  return (
    <Screen tabs>
      <Title>Settings</Title>
      <Panel style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={user?.name ?? 'You'} size={48} tone="vault" />
        <View style={{ flex: 1 }}>
          <T variant="body" style={{ fontFamily: fonts.semibold }}>{user?.name}</T>
          <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }}>
            {user?.mode === 'google' ? user.email : 'Offline on this device'}
          </T>
        </View>
      </Panel>

      <Group label="Appearance">
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', margin: 8, padding: 4, gap: 4, borderRadius: 999, backgroundColor: c.surfaceSunken }}>
          {(['system', 'light', 'dark'] as const).map((a) => (
            <Pressable
              key={a}
              accessibilityRole="radio"
              accessibilityState={{ selected: settings.appearance === a }}
              onPress={() => update({ appearance: a })}
              style={{ flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: settings.appearance === a ? c.surfaceRaised : 'transparent' }}
            >
              <T variant="label" color={settings.appearance === a ? 'ink' : 'inkMuted'}>{a[0].toUpperCase() + a.slice(1)}</T>
            </Pressable>
          ))}
        </View>
        <Row last title="Glass effects" subtitle="Off uses solid bars and sheets" right={<Toggle label="Glass effects" value={settings.glass} onChange={(v) => update({ glass: v })} />} />
      </Group>

      {isWeb ? (
        <Notice
          tone="wait"
          icon="lock"
          title="Browser version"
          body="Cards are encrypted in this browser, but there’s no fingerprint or Face ID lock and screenshots aren’t blocked. Use it only on your own device, and delete everything before you hand the device to anyone."
        />
      ) : (
        <Group label="Security">
          <Row title="Lock with biometrics" subtitle="To open the app and reveal numbers" right={<Toggle label="Lock with biometrics" value={settings.biometricLock} onChange={(v) => update({ biometricLock: v })} />} />
          <Row title="Hide in app switcher" subtitle="Also blocks screenshots on Android" right={<Toggle label="Hide in app switcher" value={settings.hideInSwitcher} onChange={(v) => update({ hideInSwitcher: v })} />} />
          <Row last title="Lock after" subtitle="Time in the background" chevron right={<T variant="label" color="inkMuted">{lockLabel(settings.lockAfterSeconds)}</T>} onPress={() => update({ lockAfterSeconds: next(LOCK_STEPS, settings.lockAfterSeconds) })} />
        </Group>
      )}

      <Group label="Sharing defaults">
        <Row title="Ask me for every OTP" subtitle="Can’t be turned off" right={<T variant="label" color="vault">Always on</T>} />
        <Row title="Limit per payment" chevron right={<T variant="label" color="inkMuted">{formatMoney(settings.defaultLimitMinor)}</T>} onPress={() => update({ defaultLimitMinor: next(LIMIT_STEPS, settings.defaultLimitMinor) })} />
        <Row last title="Access lasts" chevron right={<T variant="label" color="inkMuted">{settings.defaultShareDays} days</T>} onPress={() => update({ defaultShareDays: next(DAY_STEPS, settings.defaultShareDays) })} />
      </Group>

      <Group label="Connection">
        <Row title="Google sign-in" right={<StatusBadge status={googleConfigured ? 'settled' : 'expired'} label={googleConfigured ? 'Set up' : 'Not set up'} />} />
        <Row
          title="Notifications"
          subtitle={isWeb ? 'While a CardVault tab is open, even in the background' : 'OTP and friend requests, while CardVault is open or recently used'}
          chevron={notifyState !== 'on'}
          onPress={async () => setNotifyState((await enableSystemNotifications()) ? 'on' : 'blocked')}
          right={<T variant="label" color={notifyState === 'blocked' ? 'owe' : 'inkMuted'}>{notifyState === 'on' ? 'On' : notifyState === 'blocked' ? 'Blocked in settings' : 'Turn on'}</T>}
        />
        <Row title="CardVault server" subtitle={serverConfigured ? 'Friends, OTP sharing and ledger sync' : 'Not configured in this build'} right={<StatusBadge status={data.online ? 'settled' : 'expired'} label={data.online ? 'Connected' : 'Offline'} />} />
        <Row
          last
          title={data.demo ? 'Demo data is on' : 'Load demo data'}
          subtitle={data.demo ? 'Sample cards, friends and payments' : 'Look around before you add real cards'}
          chevron={!data.demo}
          onPress={data.demo ? undefined : data.loadDemo}
          right={data.demo ? <StatusBadge status="pending" label="Demo" /> : undefined}
        />
      </Group>

      <View style={{ gap: 8, marginTop: 8 }}>
        <Button block label="Sign out" onPress={signOut} />
        <Button block variant="danger" icon="trash" label={isWeb ? 'Delete everything in this browser' : 'Delete everything on this phone'} onPress={wipe} />
      </View>
      <T variant="caption" color="inkMuted" style={{ textAlign: 'center' }}>
        CardVault {Constants.expoConfig?.version ?? ''} · cards are stored only on this device
      </T>
    </Screen>
  );
}
