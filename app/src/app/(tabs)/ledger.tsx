import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Amount, Avatar, Chip, Notice, Panel } from '@/components/bits';
import { Button } from '@/components/Button';
import { Screen, Title } from '@/components/layout';
import { LedgerList, LedgerRow } from '@/components/rows';
import { T } from '@/components/Text';
import { counterparty } from '@/lib/ledger';
import { confirmAction } from '@/lib/platform';
import { useData } from '@/state/data';
import { fonts } from '@/theme/tokens';

export default function LedgerScreen() {
  const params = useLocalSearchParams<{ friend?: string }>();
  const data = useData();
  const [who, setWho] = useState<string>(params.friend ?? 'all');
  // Opening the ledger for a friend (from Friends or Vault) selects them.
  const [lastParam, setLastParam] = useState(params.friend);
  if (params.friend !== lastParam) {
    setLastParam(params.friend);
    setWho(params.friend ?? 'all');
  }

  const rows = data.txns
    .filter((t) => t.status !== 'expired' || data.now - Date.parse(t.requestedAt) < 86_400_000)
    .filter((t) => who === 'all' || counterparty(t, data.me) === who)
    .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
  const friend = who === 'all' ? undefined : data.friend(who);
  const net = friend ? data.net(friend.id) : 0;
  const nameOf = (id: string) => data.friend(id)?.name.split(' ')[0] ?? 'Friend';
  // Repayments the other person recorded wait for me to confirm them.
  const toConfirm = rows.filter((t) => t.kind === 'repayment' && t.status === 'pending' && t.createdBy && t.createdBy !== data.me);

  return (
    <Screen tabs>
      <Title>Ledger</Title>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" selected={who === 'all'} onPress={() => setWho('all')} />
        {data.friends.map((f) => (
          <Chip key={f.id} label={f.name.split(' ')[0]} selected={who === f.id} onPress={() => setWho(f.id)} />
        ))}
      </ScrollView>

      {friend ? (
        <Panel style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Avatar name={friend.name} photo={friend.photo} size={44} />
            <View style={{ flex: 1 }}>
              <T variant="body" style={{ fontFamily: fonts.semibold }}>{friend.name}</T>
              <T variant="caption" color="inkMuted">{friend.email}</T>
            </View>
          </View>
          <View>
            <T variant="label" color="inkMuted" style={{ fontFamily: fonts.medium }}>
              {net > 0 ? `${nameOf(friend.id)} owes you` : net < 0 ? `You owe ${nameOf(friend.id)}` : 'All settled'}
            </T>
            {net !== 0 ? <Amount minor={Math.abs(net)} direction={net > 0 ? 'lent' : 'owe'} size="lg" signed={false} /> : null}
          </View>
          {net !== 0 ? (
            <Button variant="primary" size="sm" block label={net > 0 ? 'Mark as paid' : 'Settle up'} onPress={() => router.push(`/settle/${friend.id}`)} />
          ) : null}
          {data.friends.some((f) => f.id === friend.id) ? (
            <Button
              variant="quiet"
              size="sm"
              label="Remove friend"
              onPress={async () => {
                const ok = await confirmAction(
                  `Remove ${friend.name}?`,
                  'Cards you share with each other stop being shared, and neither of you can ask the other for OTPs. Your ledger history stays.',
                  'Remove',
                  true,
                );
                if (!ok) return;
                await data.removeFriend(friend.id);
                setWho('all');
              }}
            />
          ) : null}
        </Panel>
      ) : (
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
      )}

      {rows.length ? (
        <LedgerList>
          {rows.map((t, i) => (
            <LedgerRow
              key={t.id}
              txn={t}
              me={data.me}
              friendName={nameOf(counterparty(t, data.me))}
              last={i === rows.length - 1}
              onPress={
                t.kind === 'card_payment' && t.lenderId === data.me && t.status === 'pending'
                  ? () => router.push(`/otp/${t.id}`)
                  : undefined
              }
            />
          ))}
        </LedgerList>
      ) : (
        <Notice tone="info" title="Nothing here yet" body="Payments appear once a friend’s payment with your card goes through, or yours with theirs." />
      )}

      {toConfirm.map((t) => (
        <Panel key={t.id} style={{ gap: 8 }}>
          <T variant="body">
            {t.borrowerId === data.me
              ? `${nameOf(t.lenderId)} says you paid them back by ${t.method ?? 'transfer'}.`
              : `${nameOf(t.borrowerId)} says they paid you back by ${t.method ?? 'transfer'}.`}
          </T>
          <Amount minor={t.amountMinor} size="md" />
          <Button variant="primary" size="sm" label="Yes, that’s right" onPress={() => data.confirmRepayment(t.id)} />
        </Panel>
      ))}

      <T variant="caption" color="inkMuted" style={{ textAlign: 'center' }}>
        Only successful payments are recorded. Declined and expired OTP requests disappear after 24 hours.
      </T>
    </Screen>
  );
}
