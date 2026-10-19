import { router } from 'expo-router';
import { View } from 'react-native';
import { Amount, Notice, Panel } from '@/components/bits';
import { Button } from '@/components/Button';
import { Screen, Title } from '@/components/layout';
import { BalanceCard } from '@/components/rows';
import { T } from '@/components/Text';
import { useData } from '@/state/data';
import { fonts } from '@/theme/tokens';

export default function FriendsScreen() {
  const data = useData();
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
        <Button variant="glass" size="sm" icon="plus" label="Add" onPress={() => router.push('/friend/add')} />
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

      {data.friends.length === 0 ? (
        <Notice
          tone="info"
          icon="lock"
          title="No friends yet"
          body={data.online ? 'Add a friend by the email they use with Google on CardVault.' : 'Friends connect through the CardVault server. Until one is set up, try the demo data from the Vault tab.'}
        />
      ) : null}

      {groups.map(([label, list]) =>
        list.length ? (
          <View key={label} style={{ gap: 12 }}>
            <T variant="caption" color="inkMuted" style={{ letterSpacing: 0.7, fontFamily: fonts.semibold, marginTop: 8 }}>{label.toUpperCase()}</T>
            {list.map(({ f, net }) => (
              <BalanceCard
                key={f.id}
                name={f.name}
                net={net}
                onPress={() => router.navigate({ pathname: '/ledger', params: { friend: f.id } })}
                actionLabel={net < 0 ? 'Settle up' : undefined}
                onAction={() => router.push(`/settle/${f.id}`)}
              />
            ))}
          </View>
        ) : null,
      )}
    </Screen>
  );
}
