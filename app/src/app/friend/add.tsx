import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Avatar, Notice, Panel } from '@/components/bits';
import { Button } from '@/components/Button';
import { Field, Screen, Title, TopBar } from '@/components/layout';
import { T } from '@/components/Text';
import type { UserHit } from '@/lib/api';
import { shareText } from '@/lib/platform';
import { useAuth } from '@/state/auth';
import { useData } from '@/state/data';
import { useTheme } from '@/state/settings';
import { fonts } from '@/theme/tokens';

const ACTION: Record<UserHit['state'], string> = { none: 'Add', outgoing: 'Requested', incoming: 'Accept', friend: 'Friends' };

function PersonRow({ hit, onChange }: { hit: UserHit; onChange: (state: UserHit['state']) => void }) {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = hit.name ?? hit.email?.split('@')[0] ?? 'CardVault user';
  const act = async () => {
    setBusy(true);
    setError(null);
    try {
      if (hit.state === 'incoming') {
        await data.acceptFriend(hit.id);
        onChange('friend');
      } else {
        onChange(await data.requestFriend({ id: hit.id }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} photo={hit.photo} size={40} />
        <View style={{ flex: 1 }}>
          <T variant="body" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>{name}</T>
          <T variant="caption" color="inkMuted" numberOfLines={1}>{hit.email}</T>
        </View>
        <Button
          size="sm"
          variant={hit.state === 'none' || hit.state === 'incoming' ? 'primary' : 'quiet'}
          icon={hit.state === 'none' ? 'userPlus' : hit.state === 'friend' || hit.state === 'outgoing' ? 'check' : undefined}
          label={ACTION[hit.state]}
          disabled={hit.state === 'friend' || hit.state === 'outgoing'}
          busy={busy}
          onPress={act}
        />
      </View>
      {error ? <T variant="caption" color="owe">{error}</T> : null}
    </View>
  );
}

export default function AddFriend() {
  const data = useData();
  const { c } = useTheme();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [hits, setHits] = useState<UserHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const latest = useRef(0);
  const { searchPeople } = data;

  // Suggests people on CardVault as you type a name or email.
  useEffect(() => {
    const q = email.trim();
    const n = ++latest.current;
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setHits(null);
        return;
      }
      setSearching(true);
      try {
        const found = await searchPeople(q);
        if (n === latest.current) setHits(found);
      } catch {
        if (n === latest.current) setHits([]);
      } finally {
        if (n === latest.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [email, searchPeople]);
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
        const state = await data.requestFriend({ email });
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
        <T variant="body" style={{ fontFamily: fonts.semibold }}>Find someone on CardVault</T>
        <Field
          label="Name or email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          value={email}
          onChangeText={setEmail}
          placeholder="Rahul or rahul@gmail.com"
          editable={data.online}
        />
        {searching && !hits ? <ActivityIndicator color={c.vault} /> : null}
        {hits?.map((h) => (
          <PersonRow key={h.id} hit={h} onChange={(state) => setHits((prev) => prev?.map((x) => (x.id === h.id ? { ...x, state } : x)) ?? null)} />
        ))}
        {hits && hits.length === 0 ? (
          <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }}>
            {validEmail ? 'Nobody with that email has joined yet. Try sending the request, or share your invite link.' : 'No one on CardVault matches that yet. Try their email, or share your invite link.'}
          </T>
        ) : null}
        {validEmail && hits?.length === 0 ? (
          <Button block icon="userPlus" label={`Send request to ${email.trim()}`} disabled={!data.online} busy={busy === 'request'} onPress={request} />
        ) : null}
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
