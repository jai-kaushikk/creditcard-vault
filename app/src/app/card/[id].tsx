import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Avatar, Notice, Panel, Row, StatusBadge } from '@/components/bits';
import { Button } from '@/components/Button';
import { CreditCardView } from '@/components/CreditCardView';
import { Screen, TopBar } from '@/components/layout';
import { LedgerList, LedgerRow } from '@/components/rows';
import { T } from '@/components/Text';
import { formatCardNumber, NETWORK_LABEL } from '@/lib/cardNumber';
import { counterparty } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { useData } from '@/state/data';
import { useLock } from '@/state/lock';
import { useVault } from '@/state/vault';
import { fonts } from '@/theme/tokens';
import { confirmAction, isWeb, notify, usePreventCapture } from '@/lib/platform';

const REVEAL_MS = 30_000;

export default function CardDetail() {
  usePreventCapture('card-detail');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cards, removeCard } = useVault();
  const data = useData();
  const { confirm } = useLock();
  const [revealed, setRevealed] = useState(false);
  const card = cards.find((c) => c.id === id);

  // Hide the number again after 30 seconds.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  if (!card) {
    return (
      <Screen>
        <TopBar back="Vault" />
        <Notice tone="info" title="This card isn’t on this device any more." />
      </Screen>
    );
  }

  const share = data.shares.find((s) => s.cardId === card.id);
  const shareFriend = share ? data.friend(share.friendId) : undefined;
  const recent = data.txns.filter((t) => t.cardRef === card.cardRef).slice(0, 5);

  const toggleReveal = async () => {
    if (revealed) return setRevealed(false);
    if (await confirm('Show the card number')) setRevealed(true);
  };
  const copy = async () => {
    if (!(await confirm('Copy card details'))) return;
    await Clipboard.setStringAsync(`${formatCardNumber(card.number)}  ${card.expiry}`);
    notify('Copied', 'Card number and expiry are on the clipboard. Clear it after you paste.');
  };
  const removeIt = async () => {
    const ok = await confirmAction(`Remove ${card.nickname}?`, 'It’s deleted from this device. Anyone it was shared with keeps their copy until the share ends.', 'Remove', true);
    if (!ok) return;
    await removeCard(card.id);
    router.back();
  };

  return (
    <Screen>
      <TopBar back="Vault" right={<T variant="label" color="inkMuted">{NETWORK_LABEL[card.network]} · Credit</T>} />
      <T variant="title" accessibilityRole="header">{card.nickname}</T>
      <View style={{ alignItems: 'center' }}>
        <CreditCardView {...card} revealed={revealed} tag={shareFriend ? `Shared with ${shareFriend.name.split(' ')[0]}` : null} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} block icon={revealed ? 'eyeOff' : 'eye'} label={revealed ? 'Hide' : 'Reveal'} onPress={toggleReveal} />
        <Button style={{ flex: 1 }} block icon="copy" label="Copy" onPress={copy} />
      </View>
      <T variant="caption" color="inkMuted" style={{ textAlign: 'center', marginTop: -8 }}>{isWeb ? 'Hides again after 30 seconds' : 'Biometrics required · hides again after 30 seconds'}</T>

      <Panel padded={false}>
        <Row title="Valid thru" right={<T variant="label">{card.expiry}</T>} />
        <Row title="CVV" right={<T variant="label" style={{ fontFamily: fonts.mono }}>{card.cvv ? (revealed ? card.cvv : '•••') : 'Not saved'}</T>} />
        <Row last title="Card holder" right={<T variant="label">{card.holder ?? '—'}</T>} />
      </Panel>

      {card.source === 'own' ? (
        <>
          <T variant="headline" accessibilityRole="header" style={{ marginTop: 8 }}>Sharing</T>
          {share && shareFriend ? (
            <Panel style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Avatar name={shareFriend.name} />
                <View style={{ flex: 1 }}>
                  <T variant="body" style={{ fontFamily: fonts.semibold }}>{shareFriend.name}</T>
                  <T variant="label" color="inkMuted" style={{ fontFamily: fonts.regular }}>
                    Until {new Date(share.endsAt).toLocaleDateString([], { day: 'numeric', month: 'short' })} · up to {formatMoney(share.limitMinor)} a payment
                  </T>
                </View>
                <StatusBadge status="shared" />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button style={{ flex: 1 }} block size="sm" label="Edit sharing" onPress={() => router.push(`/share/${card.id}`)} />
                <Button style={{ flex: 1 }} block size="sm" variant="danger" label="Stop sharing" onPress={() => data.stopSharing(share.id)} />
              </View>
            </Panel>
          ) : (
            <Panel style={{ gap: 12 }}>
              <T variant="body" color="inkMuted">Not shared. Friends you share with ask you for the OTP on every payment.</T>
              <Button variant="primary" size="sm" icon="share" label="Share this card" onPress={() => router.push(`/share/${card.id}`)} />
            </Panel>
          )}
        </>
      ) : (
        <Panel style={{ gap: 12 }}>
          <T variant="body">Shared by {card.sharedBy?.name} · up to {formatMoney(card.sharedBy?.limitMinor ?? 0)} a payment</T>
          <Button variant="primary" size="sm" label="Pay with this card" onPress={() => router.push(`/pay/${card.id}`)} />
        </Panel>
      )}

      {recent.length ? (
        <>
          <T variant="headline" accessibilityRole="header" style={{ marginTop: 8 }}>Recent on this card</T>
          <LedgerList>
            {recent.map((t, i) => (
              <LedgerRow key={t.id} txn={t} me={data.me} friendName={data.friend(counterparty(t, data.me))?.name.split(' ')[0] ?? 'Friend'} last={i === recent.length - 1} />
            ))}
          </LedgerList>
        </>
      ) : null}

      <Button variant="quiet" block icon="trash" label="Remove card from this device" onPress={removeIt} />
    </Screen>
  );
}
