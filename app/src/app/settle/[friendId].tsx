import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Chip, Notice } from '@/components/bits';
import { Button } from '@/components/Button';
import { Field, Sheet } from '@/components/layout';
import { T } from '@/components/Text';
import { formatMoney, parseAmount } from '@/lib/money';
import { useData } from '@/state/data';

const METHODS = ['UPI', 'Cash', 'Bank transfer'];

export default function SettleUp() {
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const data = useData();
  const friend = data.friend(friendId);
  const net = data.net(friendId);
  const [choice, setChoice] = useState<'full' | 'half' | 'other'>('full');
  const [other, setOther] = useState('');
  const [method, setMethod] = useState('UPI');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = friend?.name.split(' ')[0] ?? 'Friend';
  const owed = Math.abs(net);
  const theyOweMe = net > 0;
  const amount = choice === 'full' ? owed : choice === 'half' ? Math.round(owed / 2) : parseAmount(other) ?? 0;
  const tooMuch = amount > owed;

  if (!friend || net === 0) {
    return (
      <Sheet kicker="Settle up" title={friend ? `You and ${name} are settled` : 'Nothing to settle'}>
        <Button variant="primary" block label="Close" onPress={() => router.back()} />
      </Sheet>
    );
  }
  if (sent) {
    return (
      <Sheet kicker="Settle up" title={`Waiting for ${name}`}>
        <Notice tone="wait" title={`${formatMoney(amount)} by ${method}`} body={`Sent to ${name} to confirm. The balance updates when they do.`} />
        <Button variant="primary" block label="Back to ledger" onPress={() => router.back()} />
      </Sheet>
    );
  }

  return (
    <Sheet kicker="Settle up" title={theyOweMe ? `${name} paid you back` : `You paid ${name} back`}>
      <T variant="body" color="inkMuted">
        {theyOweMe ? `${name} owes you ${formatMoney(owed)}.` : `You owe ${name} ${formatMoney(owed)}.`} Record a repayment made outside the app.
      </T>
      <View style={{ gap: 8 }}>
        <T variant="label" color="inkMuted">How much?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={`All · ${formatMoney(owed)}`} selected={choice === 'full'} onPress={() => setChoice('full')} />
          <Chip label={`Half · ${formatMoney(Math.round(owed / 2))}`} selected={choice === 'half'} onPress={() => setChoice('half')} />
          <Chip label="Other" selected={choice === 'other'} onPress={() => setChoice('other')} />
        </View>
        {choice === 'other' ? (
          <Field label="Amount (₹)" keyboardType="decimal-pad" value={other} onChangeText={setOther} error={tooMuch ? `More than ${formatMoney(owed)}` : null} />
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        <T variant="label" color="inkMuted">How?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {METHODS.map((m) => (
            <Chip key={m} label={m} selected={m === method} onPress={() => setMethod(m)} />
          ))}
        </View>
      </View>
      <T variant="label" color="inkMuted" style={{ fontFamily: 'SchibstedGrotesk_400Regular' }}>{name} confirms with one tap. Then the balance updates in both ledgers.</T>
      {error ? <Notice tone="bad" icon="alert" title="Not saved" body={error} /> : null}
      <Button
        variant="primary"
        block
        label={`Mark ${formatMoney(amount)} as paid`}
        disabled={!amount || tooMuch}
        busy={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await data.settleUp(friend.id, amount, method);
            setSent(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Couldn’t record it.');
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button variant="quiet" block label="Cancel" onPress={() => router.back()} />
    </Sheet>
  );
}
