import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Amount, Avatar, Notice, Panel } from '@/components/bits';
import { Bell } from '@/components/Bell';
import { Button } from '@/components/Button';
import { Screen, Title } from '@/components/layout';
import { BalanceCard } from '@/components/rows';
import { T } from '@/components/Text';
import { useData, type FriendRequest } from '@/state/data';
import { fonts } from '@/theme/tokens';

function RequestRow({ r }: { r: FriendRequest }) {
  const data = useData();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (what: 'accept' | 'decline') => {
    setBusy(what);
    setError(null);
    try {
      await (what === 'accept' ? data.acceptFriend(r.id) : data.declineFriend(r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work.');
      setBusy(null);
    }
  };
  return (
    <Panel style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={r.name} photo={r.photo} size={44} />
        <View style={{ flex: 1 }}>
          <T variant="body" style={{ fontFamily: fonts.semibold }}>{r.name}</T>
          <T variant="caption" color="inkMuted">{r.direction === 'incoming' ? `${r.email} · wants to be friends` : `${r.email} · waiting for them to accept`}</T>
        </View>
      </View>
      {r.direction === 'incoming' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button style={{ flex: 1 }} block size="sm" variant="primary" icon="check" label="Accept" busy={busy === 'accept'} disabled={!!busy} onPress={() => act('accept')} />
          <Button style={{ flex: 1 }} block size="sm" label="Decline" busy={busy === 'decline'} disabled={!!busy} onPress={() => act('decline')} />
        </View>
      ) : (
        <Button size="sm" variant="quiet" label="Cancel request" busy={busy === 'decline'} onPress={() => act('decline')} />
      )}
      {error ? <Notice tone="bad" icon="alert" title={error} /> : null}
    </Panel>
  );
}

export default function FriendsScreen() {
  const data = useData();
  const incoming = data.requests.filter((r) => r.direction === 'incoming');
  const outgoing = data.requests.filter((r) => r.direction === 'outgoing');
  const withNet = data.friends.map((f) => ({ f, net: data.net(f.id) }));
  const groups: [string, typeof withNet][] = [
    ['Owe you', withNet.filter((x) => x.net > 0)],
    ['You owe', withNet.filter((x) => x.net < 0)],
    ['All settled', withNet.filter((x) => x.net === 0)],
  ];

  return (
    <Screen tabs>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title>Friends</Title>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button variant="glass" size="sm" icon="plus" label="Add" onPress={() => router.push('/friend/add')} />
          <Bell />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Panel style={{ flex: 1, paddingVertical: 12 }}>
          <T variant="label" color="inkMuted" style={{ fontFamily: fonts.medium }}>Owed to you</T>
          <Amount minor={data.totals.owedToMe} direction="lent" size="md" signed={false} />
        </Panel>
        <Panel style={{ flex: 1, paddingVertical: 12 }}>
          <T variant="label" color="inkMuted" style={{ fontFamily: fonts.medium }}>You owe</T>
          <Amount minor={data.totals.iOwe} direction="owe" size="md" signed={false} />
        </Panel>
      </View>

      {incoming.length ? (
        <View style={{ gap: 12 }}>
          <T variant="caption" color="inkMuted" style={{ letterSpacing: 0.7, fontFamily: fonts.semibold, marginTop: 8 }}>FRIEND REQUESTS</T>
          {incoming.map((r) => <RequestRow key={r.id} r={r} />)}
        </View>
      ) : null}

      {data.friends.length === 0 && !data.requests.length ? (
        <Notice
          tone="info"
          icon="lock"
          title="No friends yet"
          body={data.online ? 'Send an invite link, or a friend request to the email they use with Google.' : 'Friends connect through the CardVault server. Until one is set up, try the demo data from Settings.'}
        />
      ) : null}
      {data.online && data.friends.length === 0 ? (
        <Button variant="primary" block icon="userPlus" label="Invite a friend" onPress={() => router.push('/friend/add')} />
      ) : null}

      {groups.map(([label, list]) =>
        list.length ? (
          <View key={label} style={{ gap: 12 }}>
            <T variant="caption" color="inkMuted" style={{ letterSpacing: 0.7, fontFamily: fonts.semibold, marginTop: 8 }}>{label.toUpperCase()}</T>
            {list.map(({ f, net }) => (
              <BalanceCard
                key={f.id}
                name={f.name}
                photo={f.photo}
                net={net}
                onPress={() => router.navigate({ pathname: '/ledger', params: { friend: f.id } })}
                actionLabel={net < 0 ? 'Settle up' : undefined}
                onAction={() => router.push(`/settle/${f.id}`)}
              />
            ))}
          </View>
        ) : null,
      )}

      {outgoing.length ? (
        <View style={{ gap: 12 }}>
          <T variant="caption" color="inkMuted" style={{ letterSpacing: 0.7, fontFamily: fonts.semibold, marginTop: 8 }}>SENT</T>
          {outgoing.map((r) => <RequestRow key={r.id} r={r} />)}
        </View>
      ) : null}
    </Screen>
  );
}
