import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar, Chip, Notice, Panel, Row, Toggle } from '@/components/bits';
import { Button } from '@/components/Button';
import { CreditCardView } from '@/components/CreditCardView';
import { Screen, TopBar } from '@/components/layout';
import { T } from '@/components/Text';
import { formatMoney } from '@/lib/money';
import { useData } from '@/state/data';
import { useLock } from '@/state/lock';
import { useSettings } from '@/state/settings';
import { useVault } from '@/state/vault';
import { fonts } from '@/theme/tokens';
import { usePreventCapture } from '@/lib/platform';

const LIMITS = [200000, 500000, 1000000];
const DAYS = [1, 7, 14, 30];

export default function ShareCard() {
  usePreventCapture('share-card');
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const { cards } = useVault();
  const data = useData();
  const { settings } = useSettings();
  const { confirm } = useLock();
  const card = cards.find((c) => c.id === cardId);
  const existing = data.shares.find((s) => s.cardId === cardId);
  const [friendId, setFriendId] = useState(existing?.friendId ?? data.friends[0]?.id);
  const [limit, setLimit] = useState(existing?.limitMinor ?? settings.defaultLimitMinor);
  const [days, setDays] = useState(settings.defaultShareDays);
  const [includeCvv, setIncludeCvv] = useState(existing?.includeCvv ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!card) return null;
  const friend = friendId ? data.friend(friendId) : undefined;
  const limits = LIMITS.includes(limit) ? LIMITS : [...LIMITS, limit].sort((a, b) => a - b);
  const dayOptions = DAYS.includes(days) ? DAYS : [...DAYS, days].sort((a, b) => a - b);

  const share = async () => {
    if (!friend) return;
    setError(null);
    if (!(await confirm(`Share ${card.nickname} with ${friend.name}`))) return;
    setBusy(true);
    try {
      await data.shareCard(card, friend, { limitMinor: limit, days, includeCvv });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t share the card.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button variant="primary" block label={friend ? `Share with ${friend.name.split(' ')[0]}` : 'Pick a friend'} disabled={!friend} busy={busy} onPress={share} />}>
      <TopBar back="Card" />
      <T variant="title" accessibilityRole="header">Share {card.nickname}</T>
      <View style={{ alignItems: 'center' }}>
        <CreditCardView {...card} width={240} />
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label" color="inkMuted">With</T>
        {data.friends.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {data.friends.map((f) => (
              <Chip key={f.id} label={f.name.split(' ')[0]} selected={f.id === friendId} onPress={() => setFriendId(f.id)} left={<Avatar name={f.name} size={34} />} />
            ))}
          </View>
        ) : (
          <Notice tone="info" title="Add a friend first" body="Friends find each other by the email they use with Google." />
        )}
        <Button variant="quiet" size="sm" icon="plus" label="Add a friend" onPress={() => router.push('/friend/add')} />
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label" color="inkMuted">Limit per payment</T>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {limits.map((l) => (
            <Chip key={l} label={formatMoney(l)} selected={l === limit} onPress={() => setLimit(l)} />
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <T variant="label" color="inkMuted">Access ends after</T>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {dayOptions.map((d) => (
            <Chip key={d} label={d === 1 ? '1 day' : `${d} days`} selected={d === days} onPress={() => setDays(d)} />
          ))}
        </View>
      </View>

      <Panel padded={false}>
        <Row title="Ask me for every OTP" subtitle="Always on. You approve each payment." right={<T variant="label" color="vault">On</T>} />
        <Row
          last
          title="Include CVV"
          subtitle={card.cvv ? 'Most online checkouts need it' : 'No CVV saved for this card'}
          right={<Toggle label="Include CVV" value={includeCvv && !!card.cvv} onChange={(v) => card.cvv && setIncludeCvv(v)} />}
        />
      </Panel>
      {error ? <Notice tone="bad" icon="alert" title="Not shared" body={error} /> : null}
      <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }}>
        The card is encrypted on your phone to {friend?.name.split(' ')[0] ?? 'your friend'}’s phone. The server relays it once and never stores it. Anyone you share with could note the number, so share only with people you trust.
      </T>
    </Screen>
  );
}
