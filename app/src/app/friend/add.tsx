import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { View } from 'react-native';
import { Notice, Panel } from '@/components/bits';
import { Button } from '@/components/Button';
import { Field, Screen, Title, TopBar } from '@/components/layout';
import { T } from '@/components/Text';
import { shareText } from '@/lib/platform';
import { useAuth } from '@/state/auth';
import { useData } from '@/state/data';
import { fonts } from '@/theme/tokens';

export default function AddFriend() {
  const data = useData();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'invite' | 'copy' | 'request' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: 'good' | 'info'; title: string; body?: string } | null>(null);
  const [notOnApp, setNotOnApp] = useState(false);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const run = async (what: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    setResult(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const invite = () =>
    run('invite', async () => {
      const url = await data.inviteLink();
      const how = await shareText(`${user?.name?.split(' ')[0] ?? 'I'} invited you to CardVault, to share cards and split what we spend:`, url);
      if (how === 'copied') setResult({ tone: 'good', title: 'Invite link copied', body: 'Paste it into WhatsApp or a message. It works for 14 days.' });
    });

  const copy = () =>
    run('copy', async () => {
      await Clipboard.setStringAsync(await data.inviteLink());
      setResult({ tone: 'good', title: 'Invite link copied', body: 'Anyone who opens it can add you as a friend for the next 14 days.' });
    });

  const request = () =>
    run('request', async () => {
      setNotOnApp(false);
      try {
        const state = await data.requestFriend(email);
        setResult(state === 'friend'
          ? { tone: 'good', title: 'You’re friends now', body: 'They had already asked you, so you’re connected.' }
          : { tone: 'info', title: 'Friend request sent', body: 'You’ll be connected as soon as they accept it.' });
        setEmail('');
      } catch (e) {
        if (e instanceof Error && /not on CardVault|nobody/i.test(e.message)) {
          setNotOnApp(true);
          return;
        }
        throw e;
      }
    });

  return (
    <Screen>
      <TopBar back="Back" />
      <Title sub="Friends have to agree both ways before you can share cards or OTPs.">Add a friend</Title>
      {!data.online ? (
        <Notice tone="info" icon="lock" title="Needs the CardVault server" body="Sign in with Google to add friends. Demo data shows how it works." />
      ) : null}

      <Panel style={{ gap: 12 }}>
        <T variant="body" style={{ fontFamily: fonts.semibold }}>Send an invite link</T>
        <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }}>
          Works whether or not they have CardVault. Without the app, the link offers the Android download or the web version.
        </T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button style={{ flex: 1 }} block variant="primary" icon="share" label="Share link" disabled={!data.online} busy={busy === 'invite'} onPress={invite} />
          <Button style={{ flex: 1 }} block icon="link" label="Copy" disabled={!data.online} busy={busy === 'copy'} onPress={copy} />
        </View>
      </Panel>

      <Panel style={{ gap: 12 }}>
        <T variant="body" style={{ fontFamily: fonts.semibold }}>Or send a request by email</T>
        <Field label="Their Google email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} placeholder="rahul@gmail.com" />
        <Button block icon="userPlus" label="Send friend request" disabled={!validEmail || !data.online} busy={busy === 'request'} onPress={request} />
      </Panel>

      {notOnApp ? (
        <Panel style={{ gap: 12 }}>
          <Notice tone="wait" icon="alert" title="They’re not on CardVault yet" body="Send them your invite link instead. You’ll be friends as soon as they open it and sign in." />
          <Button variant="primary" block icon="share" label="Share invite link" busy={busy === 'invite'} onPress={invite} />
        </Panel>
      ) : null}
      {result ? <Notice tone={result.tone} icon="check" title={result.title} body={result.body} /> : null}
      {error ? <Notice tone="bad" icon="alert" title="That didn’t work" body={error} /> : null}
    </Screen>
  );
}
