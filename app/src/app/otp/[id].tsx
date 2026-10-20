import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { Notice } from '@/components/bits';
import { Button } from '@/components/Button';
import { Facts, Sheet } from '@/components/layout';
import { OtpInput } from '@/components/OtpInput';
import { T } from '@/components/Text';
import { OTP_TTL_MS } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { parseBankSms } from '@/lib/sms';
import { useNow } from '@/lib/useNow';
import { useData } from '@/state/data';
import { useLock } from '@/state/lock';
import { useTheme } from '@/state/settings';
import { useVault } from '@/state/vault';
import { usePreventCapture } from '@/lib/platform';

export default function OtpRequest() {
  usePreventCapture('otp');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const data = useData();
  const { cards } = useVault();
  const { confirm } = useLock();
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsCheck, setSmsCheck] = useState<{ tone: 'good' | 'bad' | 'info'; title: string } | null>(null);
  const now = useNow(1000);

  const txn = data.txns.find((t) => t.id === id);
  const waitingForOtp = !!txn && txn.status === 'pending' && !txn.otpSharedAt;

  /** Reads a copied bank SMS (or just the code) and checks its amount against the request. */
  const fromClipboard = async (auto: boolean) => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    const sms = parseBankSms(text);
    if (!sms.otp) {
      if (!auto) setSmsCheck({ tone: 'info', title: 'No OTP in what you copied. Copy the bank SMS and try again.' });
      return;
    }
    setOtp(sms.otp);
    if (sms.amountMinor && txn) {
      setSmsCheck(sms.amountMinor === txn.amountMinor
        ? { tone: 'good', title: `The SMS is for ${formatMoney(sms.amountMinor)}, which matches the request.` }
        : { tone: 'bad', title: `The SMS is for ${formatMoney(sms.amountMinor)}, but the request is for ${formatMoney(txn.amountMinor)}. Check before you share.` });
    } else {
      setSmsCheck({ tone: 'info', title: auto ? 'Filled in from the SMS you copied. Check it matches.' : 'Pasted. Check it matches the SMS.' });
    }
  };
  const fromClipboardRef = useRef(fromClipboard);
  useEffect(() => {
    fromClipboardRef.current = fromClipboard;
  });

  // Android: copy the SMS in Messages, come back, and the OTP is already filled in.
  useEffect(() => {
    if (Platform.OS !== 'android' || !waitingForOtp) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') fromClipboardRef.current(true);
    });
    return () => sub.remove();
  }, [waitingForOtp]);
  if (!txn) {
    return (
      <Sheet kicker="OTP request" title="This request is gone">
        <Button variant="primary" block label="Close" onPress={() => router.back()} />
      </Sheet>
    );
  }
  const who = data.friend(txn.borrowerId)?.name.split(' ')[0] ?? 'Your friend';
  const card = cards.find((c) => c.cardRef === txn.cardRef);
  const amount = formatMoney(txn.amountMinor);
  const left = Math.max(0, Math.round((Date.parse(txn.requestedAt) + OTP_TTL_MS - now) / 1000));
  const facts = <Facts items={[['Merchant', txn.merchant ?? '—'], ['Amount', amount], ['Card', card ? `${card.nickname} ••${card.number.slice(-4)}` : 'Your card']]} />;

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

  if (txn.status === 'expired') {
    return (
      <Sheet kicker="OTP request" title={txn.otpSharedAt ? 'Payment didn’t go through' : 'The request expired'}>
        {facts}
        <Notice tone="info" title="Nothing was recorded" body={`${who} can try again or pay another way.`} />
        <Button variant="primary" block label="Close" onPress={() => router.back()} />
      </Sheet>
    );
  }
  if (txn.status === 'disputed') {
    return (
      <Sheet kicker="OTP request" title="Sent for review">
        {facts}
        <Notice tone="bad" icon="alert" title="Disputed" body="You and your friend disagree about this payment. It isn’t counted until it’s resolved." />
        <Button variant="primary" block label="Close" onPress={() => router.back()} />
      </Sheet>
    );
  }
  if (txn.status === 'confirmed' || txn.status === 'settled') {
    return (
      <Sheet kicker="OTP request" title={`${amount} added to your ledger`}>
        <Notice tone="good" icon="check" title="Payment successful" body={`${who} owes you ${amount}. It’s in both of your ledgers.`} />
        {facts}
        <Button variant="primary" block label="Done" onPress={() => router.back()} />
      </Sheet>
    );
  }
  if (txn.otpSharedAt && txn.borrowerResult === 'success') {
    return (
      <Sheet kicker="OTP request" title={`Did your bank charge ${amount}?`}>
        <T variant="body" color="inkMuted">{who} says the payment at {txn.merchant} went through. Check your bank SMS or app.</T>
        {facts}
        {error ? <Notice tone="bad" icon="alert" title="Couldn’t save" body={error} /> : null}
        <Button variant="primary" block label="Yes, I was charged" busy={busy} onPress={() => run(() => data.confirmCharge(txn.id, true))} />
        <Button variant="danger" block label="No charge on my card" disabled={busy} onPress={() => run(() => data.confirmCharge(txn.id, false))} />
      </Sheet>
    );
  }
  if (txn.otpSharedAt) {
    return (
      <Sheet kicker="OTP request" title="OTP shared">
        <Notice tone="wait" title={`Shared with ${who}`} body="Waiting for the payment result. Nothing is recorded until it succeeds." />
        {facts}
        <Button block label="Close" onPress={() => router.back()} />
      </Sheet>
    );
  }

  const valid = /^\d{4,8}$/.test(otp);
  return (
    <Sheet kicker="OTP request" title={`${who} needs an OTP`}>
      <T variant="body" color="inkMuted">Your bank just texted you a one-time password. Type it, or paste the SMS, to send it to {who}.</T>
      <OtpInput value={otp} onChange={(v) => { setOtp(v); setSmsCheck(null); }} autoFocus />
      <Button size="sm" icon="copy" label="Paste from SMS" onPress={() => fromClipboard(false)} />
      {smsCheck ? <Notice tone={smsCheck.tone} icon={smsCheck.tone === 'good' ? 'check' : 'alert'} title={smsCheck.title} /> : (
        <T variant="caption" color="inkMuted" style={{ textAlign: 'center' }}>
          Tip: copy the whole bank SMS. CardVault picks out the OTP and checks the amount.
        </T>
      )}
      <View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: c.line, overflow: 'hidden' }}>
          <View style={{ height: 4, width: `${(left / (OTP_TTL_MS / 1000)) * 100}%`, backgroundColor: c.brass }} />
        </View>
        <T variant="caption" color="inkMuted" style={{ marginTop: 6 }}>Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</T>
      </View>
      {facts}
      <T variant="label" color="inkMuted" style={{ fontFamily: 'SchibstedGrotesk_400Regular' }}>
        {who} sees the OTP once. If the payment succeeds, {amount} is recorded as owed to you.
      </T>
      {error ? <Notice tone="bad" icon="alert" title="Not sent" body={error} /> : null}
      <Button
        variant="primary"
        block
        label={`Share OTP with ${who}`}
        disabled={!valid}
        busy={busy}
        onPress={() =>
          run(async () => {
            if (!(await confirm(`Send the OTP to ${who}`))) return;
            await data.shareOtp(txn.id, otp);
          })
        }
      />
      <Button variant="quiet" block label="Decline" disabled={busy} onPress={() => run(async () => { await data.declineOtp(txn.id); router.back(); })} />
    </Sheet>
  );
}
