import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useState } from 'react';
import { View } from 'react-native';
import { Amount, Notice, Panel } from '@/components/bits';
import { Button } from '@/components/Button';
import { CreditCardView } from '@/components/CreditCardView';
import { Field, Screen, TopBar } from '@/components/layout';
import { LedgerList, LedgerRow } from '@/components/rows';
import { T } from '@/components/Text';
import { formatCardNumber } from '@/lib/cardNumber';
import { formatMoney, parseAmount } from '@/lib/money';
import { useData } from '@/state/data';
import { useLock } from '@/state/lock';
import { useTheme } from '@/state/settings';
import { useVault } from '@/state/vault';
import { radius, type as typo } from '@/theme/tokens';

export default function PayWithFriendsCard() {
  usePreventScreenCapture('pay');
  const { cardId } = useLocalSearchParams<{ cardId: string }>();
  const { c } = useTheme();
  const { cards } = useVault();
  const data = useData();
  const { confirm } = useLock();
  const card = cards.find((x) => x.id === cardId);
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [txnId, setTxnId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!card?.sharedBy) {
    return (
      <Screen>
        <TopBar back="Vault" />
        <Notice tone="info" title="This shared card has ended." body="Ask your friend to share it again." />
      </Screen>
    );
  }
  const owner = card.sharedBy.name;
  const txn = txnId ? data.txns.find((t) => t.id === txnId) : undefined;
  const otp = txnId ? data.otpFor(txnId) : undefined;
  const amountMinor = parseAmount(amount);
  const overLimit = amountMinor !== null && amountMinor > card.sharedBy.limitMinor;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const copyDetails = async () => {
    if (!(await confirm('Copy card details'))) return;
    await Clipboard.setStringAsync(`${formatCardNumber(card.number)}  ${card.expiry}${card.cvv ? `  ${card.cvv}` : ''}`);
    setCopied(true);
  };

  let body: React.ReactNode;
  if (!txn) {
    body = (
      <Panel style={{ gap: 14 }}>
        <Button block size="sm" icon="copy" label={copied ? 'Copied — paste at checkout' : 'Copy card details'} onPress={copyDetails} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Amount (₹)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} error={overLimit ? `Over ${formatMoney(card.sharedBy.limitMinor)}` : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Merchant" value={merchant} onChangeText={setMerchant} placeholder="Amazon" />
          </View>
        </View>
        <T variant="caption" color="inkMuted">
          Up to {formatMoney(card.sharedBy.limitMinor)} a payment · access until {new Date(card.sharedBy.endsAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
        </T>
        <Button
          variant="primary"
          block
          label={`Ask ${owner} for the OTP`}
          disabled={!amountMinor || overLimit || !merchant.trim()}
          busy={busy}
          onPress={() => run(async () => setTxnId((await data.requestOtp(card, amountMinor!, merchant.trim())).id))}
        />
      </Panel>
    );
  } else if (txn.status === 'confirmed' || txn.status === 'settled') {
    body = (
      <Panel style={{ gap: 14 }}>
        <Notice tone="good" icon="check" title="Payment successful" body="Recorded in both ledgers." />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T variant="label" color="inkMuted">You owe {owner}</T>
          <Amount minor={txn.amountMinor} direction="owe" size="lg" signed={false} />
        </View>
        <LedgerList>
          <LedgerRow txn={txn} me={data.me} friendName={owner} last />
        </LedgerList>
        <Button block label="Done" onPress={() => { setTxnId(null); setAmount(''); setMerchant(''); }} />
      </Panel>
    );
  } else if (txn.status === 'expired' || txn.status === 'disputed') {
    body = (
      <Panel style={{ gap: 14 }}>
        <Notice
          tone={txn.status === 'disputed' ? 'bad' : 'info'}
          icon={txn.status === 'disputed' ? 'alert' : 'clock'}
          title={txn.status === 'disputed' ? 'Sent for review' : 'Nothing was recorded'}
          body={txn.status === 'disputed' ? `${owner} and you disagree about this payment.` : `${owner} didn’t share an OTP in time, or the payment failed.`}
        />
        <Button variant="primary" block label="Try again" onPress={() => setTxnId(null)} />
      </Panel>
    );
  } else if (txn.borrowerResult === 'success') {
    body = (
      <Panel>
        <Notice tone="wait" title={`Waiting for ${owner} to confirm the charge`} body="Their phone checks the bank SMS, or they confirm it themselves." />
      </Panel>
    );
  } else if (otp) {
    body = (
      <Panel style={{ gap: 14 }}>
        <T variant="caption" color="inkMuted" style={{ letterSpacing: 0.7 }}>FROM {owner.toUpperCase()}</T>
        <T variant="body" style={{ fontFamily: 'SchibstedGrotesk_600SemiBold' }}>Enter this OTP on the bank page</T>
        <View style={{ backgroundColor: c.surfaceSunken, borderRadius: radius.md, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T accessibilityLabel={`One-time password ${otp.split('').join(' ')}`} style={[typo.otp, { color: c.ink }]}>
            {otp.length === 6 ? `${otp.slice(0, 3)} ${otp.slice(3)}` : otp}
          </T>
          <T variant="caption" color="inkMuted">Shown once</T>
        </View>
        <T variant="body" style={{ fontFamily: 'SchibstedGrotesk_600SemiBold' }}>Did the payment go through?</T>
        <Button variant="primary" block label="Payment went through" busy={busy} onPress={() => run(() => data.reportResult(txn.id, 'success'))} />
        <Button block label="It failed" disabled={busy} onPress={() => run(() => data.reportResult(txn.id, 'failed'))} />
      </Panel>
    );
  } else {
    body = (
      <Panel>
        <Notice tone="wait" title={`Waiting for ${owner}`} body={`They get the request now and have 3 minutes to share the OTP for ${formatMoney(txn.amountMinor)} at ${txn.merchant}.`} />
      </Panel>
    );
  }

  return (
    <Screen>
      <TopBar back="Vault" />
      <T variant="title" accessibilityRole="header">Pay with {owner}’s card</T>
      <View style={{ alignItems: 'center' }}>
        <CreditCardView {...card} tag={`From ${owner}`} />
      </View>
      {body}
      {error ? <Notice tone="bad" icon="alert" title="Couldn’t do that" body={error} /> : null}
    </Screen>
  );
}
