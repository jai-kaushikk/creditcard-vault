import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Amount, Notice, Panel, SectionHeader } from '@/components/bits';
import { Button } from '@/components/Button';
import { CreditCardView } from '@/components/CreditCardView';
import { Glass } from '@/components/Glass';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/layout';
import { BalanceCard } from '@/components/rows';
import { T } from '@/components/Text';
import { ownerTodo, OTP_TTL_MS } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { useNow } from '@/lib/useNow';
import { useData } from '@/state/data';
import { useTheme } from '@/state/settings';
import { useVault } from '@/state/vault';
import { fonts, radius } from '@/theme/tokens';

export default function VaultScreen() {
  const { c } = useTheme();
  const { own, sharedWithMe, ready } = useVault();
  const data = useData();
  const now = useNow(1000);
  const todos = data.txns.filter((t) => ownerTodo(t, data.me, now));
  const shareTag = (cardId: string) => {
    const s = data.shares.find((x) => x.cardId === cardId);
    const f = s && data.friend(s.friendId);
    return f ? `Shared with ${f.name.split(' ')[0]}` : null;
  };
  const friendsByBalance = [...data.friends].sort((a, b) => Math.abs(data.net(b.id)) - Math.abs(data.net(a.id))).slice(0, 3);

  return (
    <Screen tabs>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T variant="display" accessibilityRole="header">Vault</T>
        <Glass>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Icon name="lock" size={14} color={c.vault} strokeWidth={2} />
            <T variant="caption" color="vault" style={{ fontFamily: fonts.semibold }}>{data.demo ? 'Demo' : 'Locked'}</T>
          </View>
        </Glass>
      </View>

      {todos.map((t) => {
        const f = data.friend(t.borrowerId);
        const todo = ownerTodo(t, data.me, now);
        const left = Math.max(0, Math.round((Date.parse(t.requestedAt) + OTP_TTL_MS - now) / 1000));
        return (
          <Pressable key={t.id} accessibilityRole="button" onPress={() => router.push(`/otp/${t.id}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingVertical: 12, borderRadius: radius.md, backgroundColor: c.brassSoft }}>
              <Icon name="clock" color={c.brassInk} />
              <View style={{ flex: 1 }}>
                <T variant="body" style={{ fontFamily: fonts.semibold }}>
                  {todo === 'share_otp' ? `${f?.name.split(' ')[0] ?? 'A friend'} needs an OTP` : `Did ${f?.name.split(' ')[0] ?? 'your friend'}’s payment go through?`}
                </T>
                <T variant="caption" color="brassInk">
                  {formatMoney(t.amountMinor)} at {t.merchant}
                  {todo === 'share_otp' ? ` · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : ' · confirm the charge'}
                </T>
              </View>
              <Icon name="chevronRight" color={c.brassInk} />
            </View>
          </Pressable>
        );
      })}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Panel style={{ flex: 1, paddingVertical: 12 }}>
          <T variant="label" color="inkMuted" style={{ fontFamily: fonts.medium }}>Friends owe you</T>
          <Amount minor={data.totals.owedToMe} direction="lent" size="md" signed={false} />
        </Panel>
        <Panel style={{ flex: 1, paddingVertical: 12 }}>
          <T variant="label" color="inkMuted" style={{ fontFamily: fonts.medium }}>You owe</T>
          <Amount minor={data.totals.iOwe} direction="owe" size="md" signed={false} />
        </Panel>
      </View>

      <SectionHeader title={`My cards · ${own.length}`} action="Add card" onAction={() => router.push('/card/add')} />
      {ready && own.length === 0 ? (
        <Panel style={{ gap: 12 }}>
          <T variant="body">Your cards stay on this phone, encrypted and locked. Add one to start.</T>
          <Button variant="primary" icon="plus" label="Add a card" onPress={() => router.push('/card/add')} />
          {!data.demo ? <Button variant="quiet" label="Load demo data to look around" onPress={data.loadDemo} /> : null}
        </Panel>
      ) : (
        <View style={{ height: 202 + Math.max(0, own.length - 1) * 40, alignItems: 'center' }}>
          {own.map((card, i) => (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              onPress={() => router.push(`/card/${card.id}`)}
              style={{ position: 'absolute', top: i * 40 }}
            >
              <CreditCardView {...card} tag={shareTag(card.id)} width={Math.min(340, 320)} />
            </Pressable>
          ))}
        </View>
      )}

      {sharedWithMe.length > 0 ? (
        <>
          <SectionHeader title="Shared with me" />
          {sharedWithMe.map((card) => (
            <Pressable key={card.id} accessibilityRole="button" onPress={() => router.push(`/pay/${card.id}`)} style={{ alignItems: 'center' }}>
              <CreditCardView {...card} tag={`From ${card.sharedBy?.name ?? 'a friend'}`} />
            </Pressable>
          ))}
        </>
      ) : null}

      {data.friends.length > 0 ? (
        <>
          <SectionHeader title="Friends" action="See all" onAction={() => router.navigate('/friends')} />
          {friendsByBalance.map((f) => (
            <BalanceCard key={f.id} name={f.name} net={data.net(f.id)} onPress={() => router.navigate({ pathname: '/ledger', params: { friend: f.id } })} />
          ))}
        </>
      ) : null}

      {data.syncError ? <Notice tone="bad" icon="alert" title="Can’t reach the CardVault server" body={data.syncError} /> : null}
    </Screen>
  );
}
