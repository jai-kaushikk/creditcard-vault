import { Pressable, View } from 'react-native';
import { direction as dirOf, type Txn } from '@/lib/ledger';
import { useTheme } from '@/state/settings';
import { fonts, radius } from '@/theme/tokens';
import { Amount, Avatar, StatusBadge } from './bits';
import { Button } from './Button';
import { T } from './Text';

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function LedgerRow({ txn, me, friendName, onPress, last }: { txn: Txn; me: string; friendName: string; onPress?: () => void; last?: boolean }) {
  const { c } = useTheme();
  const dir = dirOf(txn, me);
  const title =
    txn.kind === 'repayment'
      ? txn.lenderId === me
        ? `${friendName} paid you back`
        : `You paid ${friendName} back`
      : `${txn.merchant ?? 'Payment'} · ${friendName}`;
  const sub = [when(txn.requestedAt), txn.kind === 'repayment' ? txn.method : txn.lenderId === me ? 'your card' : `${friendName}’s card`]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: c.surfaceRaised, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Avatar name={friendName} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="body" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>{title}</T>
        <T variant="caption" color="inkMuted" numberOfLines={1}>{sub}</T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Amount minor={txn.amountMinor} direction={dir} />
        <StatusBadge status={txn.status} />
      </View>
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable>
  ) : (
    body
  );
}

export function LedgerList({ children }: { children: React.ReactNode }) {
  return <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>{children}</View>;
}

export function BalanceCard({
  name,
  net,
  onPress,
  actionLabel,
  onAction,
}: {
  name: string;
  net: number;
  onPress?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { c } = useTheme();
  const dir = net > 0 ? 'lent' : net < 0 ? 'owe' : 'neutral';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={{ backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} size={44} />
        <View style={{ flex: 1 }}>
          <T variant="body" style={{ fontFamily: fonts.semibold }}>{name}</T>
          {net === 0 ? (
            <T variant="body" color="inkMuted" style={{ fontFamily: fonts.semibold }}>All settled</T>
          ) : (
            <>
              <T variant="caption" color="inkMuted">{dir === 'lent' ? 'owes you' : 'you owe'}</T>
              <Amount minor={Math.abs(net)} direction={dir} size="md" signed={false} />
            </>
          )}
        </View>
        {actionLabel && net !== 0 ? <Button size="sm" label={actionLabel} onPress={onAction} /> : null}
      </View>
    </Pressable>
  );
}
