import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { Avatar, Notice, Panel } from '@/components/bits';
import { Button } from '@/components/Button';
import { GoogleButton } from '@/components/GoogleButton';
import { Screen } from '@/components/layout';
import { T } from '@/components/Text';
import { api, type InvitePeek } from '@/lib/api';
import { ANDROID_DOWNLOAD_URL, ANDROID_PACKAGE } from '@/lib/config';
import { isWeb } from '@/lib/platform';
import { useAuth } from '@/state/auth';
import { useData } from '@/state/data';
import { useTheme } from '@/state/settings';
import { fonts } from '@/theme/tokens';

/** In a browser on Android: opens the app if it's installed, else the download page. */
function openInAppUrl(code: string) {
  const fallback = encodeURIComponent(ANDROID_DOWNLOAD_URL);
  return `intent://invite/${encodeURIComponent(code)}#Intent;scheme=cardvault;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

export default function Invite() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { c } = useTheme();
  const { status, user } = useAuth();
  const data = useData();
  const [peek, setPeek] = useState<InvitePeek | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useWeb, setUseWeb] = useState(false);
  const android = isWeb && typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  useEffect(() => {
    let live = true;
    api.peekInvite(code)
      .then((p) => live && setPeek(p))
      .catch((e: Error) => live && setGone(e.message));
    return () => {
      live = false;
    };
  }, [code]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await data.acceptInvite(code);
      router.replace('/friends');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t add them.');
      setBusy(false);
    }
  };

  const who = peek?.name ?? 'A friend';
  const signedInWithGoogle = status === 'signedIn' && user?.mode === 'google';

  let actions: React.ReactNode;
  if (status === 'loading') {
    actions = <ActivityIndicator color={c.vault} />;
  } else if (signedInWithGoogle) {
    actions = (
      <>
        <Button variant="primary" block icon="userPlus" label={`Add ${who} as a friend`} busy={busy} onPress={accept} />
        <Button variant="quiet" block label="Not now" onPress={() => router.replace('/')} />
      </>
    );
  } else if (status === 'signedIn') {
    actions = <Notice tone="info" icon="lock" title="Sign in with Google to add friends" body="You’re using CardVault offline on this device. Sign out in Settings, then sign in with Google." />;
  } else if (android && !useWeb) {
    actions = (
      <>
        <Button variant="primary" block icon="download" label="Get the Android app" onPress={() => Linking.openURL(ANDROID_DOWNLOAD_URL)} />
        <Button block label="I have the app: open it" onPress={() => Linking.openURL(openInAppUrl(code))} />
        <Button variant="quiet" block icon="globe" label="Use the web version instead" onPress={() => setUseWeb(true)} />
      </>
    );
  } else {
    actions = (
      <>
        <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular, textAlign: 'center' }}>
          Sign in with Google to accept. {isWeb ? 'This is the web version; on Android you can get the app instead.' : ''}
        </T>
        <GoogleButton onError={setError} />
        {isWeb && !android ? (
          <Button variant="quiet" block icon="download" label="Get the Android app" onPress={() => Linking.openURL(ANDROID_DOWNLOAD_URL)} />
        ) : null}
      </>
    );
  }

  return (
    <Screen>
      <View style={{ height: 24 }} />
      {gone ? (
        <Notice tone="info" icon="clock" title="This invite has expired" body="Ask your friend to send a new link from CardVault." />
      ) : !peek ? (
        <ActivityIndicator color={c.vault} />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Avatar name={who} photo={peek.photo} size={72} tone="vault" />
            <T variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>{who} invited you to CardVault</T>
            <T variant="body" color="inkMuted" style={{ textAlign: 'center' }}>
              Share credit cards with friends you trust, approve every payment with your OTP, and keep a fair ledger of who owes what.
            </T>
          </View>
          <Panel style={{ gap: 10 }}>{actions}</Panel>
          {isWeb ? (
            <T variant="caption" color="inkMuted" style={{ textAlign: 'center' }}>
              On iPhone, open this in Safari and use Share → Add to Home Screen. The web version has no Face ID lock, so use it only on your own device.
            </T>
          ) : null}
        </>
      )}
      {error ? <Notice tone="bad" icon="alert" title="That didn’t work" body={error} /> : null}
    </Screen>
  );
}
