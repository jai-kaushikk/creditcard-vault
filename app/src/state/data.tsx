import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from '@/lib/api';
import { serverConfigured } from '@/lib/config';
import { open, randomId, seal } from '@/lib/crypto';
import { effectiveStatus, netWith, totals, type Txn } from '@/lib/ledger';
import { getJSON, setJSON } from '@/lib/secure';
import { useNow } from '@/lib/useNow';
import { useAuth } from './auth';
import { useLock } from './lock';
import { useVault, type Card } from './vault';

export type Friend = { id: string; name: string; email: string; publicKey: string; demo?: boolean };
export type OutgoingShare = {
  id: string;
  cardId: string;
  friendId: string;
  limitMinor: number;
  endsAt: string;
  includeCvv: boolean;
  createdAt: string;
  active: boolean;
};

type CardSharePayload = {
  shareId: string;
  fromName: string;
  card: Pick<Card, 'nickname' | 'network' | 'number' | 'expiry' | 'cvv' | 'holder' | 'face' | 'cardRef'>;
  limitMinor: number;
  endsAt: string;
};

const FRIENDS = 'cv.friends.v1';
const SHARES = 'cv.shares.v1';
const TXNS = 'cv.txns.v1';
const DEMO = 'cv.demo.v1';
const POLL_MS = 4000;

type Ctx = {
  me: string;
  demo: boolean;
  online: boolean;
  syncError: string | null;
  /** Shared clock, updated every few seconds. */
  now: number;
  friends: Friend[];
  friend: (id: string) => Friend | undefined;
  txns: Txn[];
  shares: OutgoingShare[];
  otpFor: (txnId: string) => string | undefined;
  net: (friendId: string) => number;
  totals: { owedToMe: number; iOwe: number };
  addFriend: (email: string, name: string) => Promise<Friend>;
  shareCard: (card: Card, friend: Friend, terms: { limitMinor: number; days: number; includeCvv: boolean }) => Promise<void>;
  stopSharing: (shareId: string) => Promise<void>;
  requestOtp: (card: Card, amountMinor: number, merchant: string) => Promise<Txn>;
  shareOtp: (txnId: string, otp: string) => Promise<void>;
  declineOtp: (txnId: string) => Promise<void>;
  reportResult: (txnId: string, outcome: 'success' | 'failed') => Promise<void>;
  confirmCharge: (txnId: string, charged: boolean) => Promise<void>;
  settleUp: (friendId: string, amountMinor: number, method: string) => Promise<void>;
  confirmRepayment: (txnId: string) => Promise<void>;
  refresh: () => Promise<void>;
  loadDemo: () => Promise<void>;
  clearAll: () => Promise<void>;
};

const DataContext = createContext<Ctx | null>(null);
const now = () => new Date().toISOString();

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const { locked } = useLock();
  const vault = useVault();
  const me = user?.id ?? 'me';
  const [friends, setFriends] = useState<Friend[]>([]);
  const [shares, setShares] = useState<OutgoingShare[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [demo, setDemo] = useState(false);
  const [otps, setOtps] = useState<Record<string, string>>({});
  const [syncError, setSyncError] = useState<string | null>(null);
  // Re-evaluates time-based states (OTP expiry, share end dates) every few seconds.
  const nowMs = useNow(5000);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Load the local copies.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const pending = timers.current;
    (async () => {
      setFriends((await getJSON<Friend[]>(FRIENDS)) ?? []);
      setShares((await getJSON<OutgoingShare[]>(SHARES)) ?? []);
      const cached = await AsyncStorage.getItem(TXNS);
      setTxns(cached ? JSON.parse(cached) : []);
      setDemo((await AsyncStorage.getItem(DEMO)) === '1');
    })().catch(() => {});
    return () => pending.forEach(clearTimeout);
  }, [status]);

  const saveTxns = useCallback((next: Txn[] | ((prev: Txn[]) => Txn[])) => {
    setTxns((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      AsyncStorage.setItem(TXNS, JSON.stringify(value)).catch(() => {});
      return value;
    });
  }, []);
  const patchTxn = useCallback((id: string, patch: Partial<Txn>) => {
    saveTxns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [saveTxns]);
  const upsertTxn = useCallback((t: Txn) => {
    saveTxns((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]));
  }, [saveTxns]);
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const saveFriends = useCallback(async (next: Friend[]) => {
    setFriends(next);
    await setJSON(FRIENDS, next);
  }, []);
  const saveShares = useCallback(async (next: OutgoingShare[]) => {
    setShares(next);
    await setJSON(SHARES, next);
  }, []);

  const online = serverConfigured && user?.mode === 'google' && !demo;

  // Server sync: transactions plus the sealed-message inbox.
  const refresh = useCallback(async () => {
    if (!online) return;
    try {
      const { transactions } = await api.transactions();
      saveTxns(transactions);
      const { messages } = await api.inbox();
      for (const m of messages) {
        if (m.kind === 'otp' && m.txnId) {
          const body = await open<{ otp: string }>(m.payload);
          if (body) setOtps((prev) => ({ ...prev, [m.txnId!]: body.otp }));
        } else if (m.kind === 'card_share') {
          const body = await open<CardSharePayload>(m.payload);
          if (!body) continue;
          await vault.upsert({
            ...body.card,
            id: `shr_${body.shareId}`,
            source: 'shared',
            createdAt: m.sentAt,
            sharedBy: { userId: m.from, name: body.fromName, shareId: body.shareId, limitMinor: body.limitMinor, endsAt: body.endsAt },
          });
        } else if (m.kind === 'card_unshare') {
          const body = await open<{ shareId: string }>(m.payload);
          if (body) await vault.removeCard(`shr_${body.shareId}`);
        }
      }
      setSyncError(null);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
    }
  }, [online, saveTxns, vault]);

  useEffect(() => {
    if (!online || locked) return;
    const first = setTimeout(refresh, 0);
    const id = setInterval(() => {
      if (AppState.currentState === 'active') refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [online, locked, refresh]);

  const friend = useCallback((id: string) => friends.find((f) => f.id === id), [friends]);

  const publicKeyOf = useCallback(async (id: string) => {
    const f = friends.find((x) => x.id === id);
    if (f?.publicKey) return f.publicKey;
    return (await api.getUser(id)).publicKey;
  }, [friends]);

  const addFriend = useCallback(async (email: string, name: string) => {
    if (!online) throw new Error('Adding friends needs the CardVault server and Google sign-in.');
    const found = await api.lookupByEmail(email.trim().toLowerCase());
    if (found.id === me) throw new Error('That’s you.');
    const f: Friend = { id: found.id, name: name.trim() || email.split('@')[0], email: email.trim(), publicKey: found.publicKey };
    await saveFriends([...friends.filter((x) => x.id !== f.id), f]);
    return f;
  }, [online, me, friends, saveFriends]);

  const shareCard = useCallback<Ctx['shareCard']>(async (card, f, { limitMinor, days, includeCvv }) => {
    const terms = { limitMinor, includeCvv, endsAt: new Date(Date.now() + days * 86_400_000).toISOString() };
    const share: OutgoingShare = {
      id: randomId('shr'),
      cardId: card.id,
      friendId: f.id,
      ...terms,
      createdAt: now(),
      active: true,
    };
    if (online) {
      const payload: CardSharePayload = {
        shareId: share.id,
        fromName: user?.name ?? 'A friend',
        card: {
          nickname: card.nickname,
          network: card.network,
          number: card.number,
          expiry: card.expiry,
          cvv: terms.includeCvv ? card.cvv : undefined,
          holder: card.holder,
          face: card.face,
          cardRef: card.cardRef,
        },
        limitMinor: terms.limitMinor,
        endsAt: terms.endsAt,
      };
      await api.send(f.id, 'card_share', seal(f.publicKey, payload));
    }
    await saveShares([...shares.filter((s) => !(s.cardId === card.id && s.friendId === f.id)), share]);
  }, [online, user, shares, saveShares]);

  const stopSharing = useCallback(async (shareId: string) => {
    const s = shares.find((x) => x.id === shareId);
    if (!s) return;
    if (online) {
      await api.send(s.friendId, 'card_unshare', seal(await publicKeyOf(s.friendId), { shareId }));
    }
    await saveShares(shares.map((x) => (x.id === shareId ? { ...x, active: false } : x)));
  }, [online, shares, saveShares, publicKeyOf]);

  const requestOtp = useCallback<Ctx['requestOtp']>(async (card, amountMinor, merchant) => {
    if (!card.sharedBy) throw new Error('Only cards shared with you need an OTP from their owner.');
    if (amountMinor > card.sharedBy.limitMinor) throw new Error('That’s above the limit for this card.');
    if (online) {
      const t = await api.requestOtp({
        lenderId: card.sharedBy.userId,
        amountMinor,
        currency: 'INR',
        merchant,
        cardRef: card.cardRef,
        idempotencyKey: randomId('idem'),
      });
      upsertTxn(t);
      return t;
    }
    const t: Txn = {
      id: randomId('txn'),
      kind: 'card_payment',
      lenderId: card.sharedBy.userId,
      borrowerId: me,
      amountMinor,
      currency: 'INR',
      merchant,
      cardRef: card.cardRef,
      status: 'pending',
      requestedAt: now(),
    };
    upsertTxn(t);
    // Demo: the friend approves and shares an OTP a moment later.
    later(2500, () => {
      patchTxn(t.id, { otpSharedAt: now() });
      setOtps((prev) => ({ ...prev, [t.id]: String(100000 + Math.floor(Math.random() * 900000)) }));
    });
    return t;
  }, [online, me, upsertTxn, patchTxn, later]);

  const shareOtp = useCallback(async (txnId: string, otp: string) => {
    const t = txns.find((x) => x.id === txnId);
    if (!t) return;
    if (online) {
      upsertTxn(await api.shareOtp(txnId, seal(await publicKeyOf(t.borrowerId), { otp })));
      return;
    }
    patchTxn(txnId, { otpSharedAt: now() });
    // Demo: the friend finishes checkout and reports success.
    later(2600, () => patchTxn(txnId, { borrowerResult: 'success' }));
  }, [online, txns, upsertTxn, patchTxn, publicKeyOf, later]);

  const declineOtp = useCallback(async (txnId: string) => {
    if (online) upsertTxn(await api.decline(txnId));
    else patchTxn(txnId, { status: 'expired' });
  }, [online, upsertTxn, patchTxn]);

  const reportResult = useCallback(async (txnId: string, outcome: 'success' | 'failed') => {
    setOtps((prev) => {
      const { [txnId]: _gone, ...rest } = prev;
      return rest;
    });
    if (online) {
      upsertTxn(await api.borrowerResult(txnId, outcome));
      return;
    }
    if (outcome === 'failed') {
      patchTxn(txnId, { borrowerResult: 'failed', status: 'expired' });
      return;
    }
    patchTxn(txnId, { borrowerResult: 'success' });
    // Demo: the owner's phone sees the bank charge and confirms.
    later(1500, () => patchTxn(txnId, { lenderEvidence: 'sms_match', status: 'confirmed', confirmedAt: now() }));
  }, [online, upsertTxn, patchTxn, later]);

  const confirmCharge = useCallback(async (txnId: string, charged: boolean) => {
    if (online) {
      upsertTxn(await api.lenderEvidence(txnId, charged ? 'manual' : 'objected'));
      return;
    }
    patchTxn(txnId, charged
      ? { lenderEvidence: 'manual', status: 'confirmed', confirmedAt: now() }
      : { lenderEvidence: 'objected', status: 'disputed' });
  }, [online, upsertTxn, patchTxn]);

  const settleUp = useCallback(async (friendId: string, amountMinor: number, method: string) => {
    const owedToMe = netWith(txns, me, friendId) > 0;
    if (online) {
      upsertTxn(await api.repay({
        counterpartyId: friendId,
        role: owedToMe ? 'payee' : 'payer',
        amountMinor,
        currency: 'INR',
        method,
        idempotencyKey: randomId('idem'),
      }));
      return;
    }
    const t: Txn = {
      id: randomId('txn'),
      kind: 'repayment',
      lenderId: owedToMe ? me : friendId,
      borrowerId: owedToMe ? friendId : me,
      amountMinor,
      currency: 'INR',
      method,
      createdBy: me,
      status: 'pending',
      requestedAt: now(),
    };
    upsertTxn(t);
    later(2000, () => patchTxn(t.id, { status: 'confirmed', confirmedAt: now() }));
  }, [online, txns, me, upsertTxn, patchTxn, later]);

  const confirmRepayment = useCallback(async (txnId: string) => {
    if (online) upsertTxn(await api.confirmRepayment(txnId));
    else patchTxn(txnId, { status: 'confirmed', confirmedAt: now() });
  }, [online, upsertTxn, patchTxn]);

  const loadDemo = useCallback(async () => {
    const seed = demoSeed(me);
    for (const c of seed.cards) await vault.upsert(c);
    await saveFriends(seed.friends);
    await saveShares(seed.shares);
    saveTxns(seed.txns);
    await AsyncStorage.setItem(DEMO, '1');
    setDemo(true);
  }, [me, vault, saveFriends, saveShares, saveTxns]);

  const clearAll = useCallback(async () => {
    timers.current.forEach(clearTimeout);
    await vault.wipe();
    await saveFriends([]);
    await saveShares([]);
    saveTxns([]);
    setOtps({});
    await AsyncStorage.removeItem(DEMO);
    setDemo(false);
  }, [vault, saveFriends, saveShares, saveTxns]);

  const value = useMemo<Ctx>(() => {
    const live = txns.map((t) => ({ ...t, status: effectiveStatus(t, nowMs) }));
    return {
      me,
      demo,
      online,
      syncError,
      friends,
      friend,
      txns: live,
      now: nowMs,
      shares: shares.filter((s) => s.active && Date.parse(s.endsAt) > nowMs),
      otpFor: (id) => otps[id],
      net: (friendId) => netWith(live, me, friendId),
      totals: totals(live, me, friends.map((f) => f.id)),
      addFriend,
      shareCard,
      stopSharing,
      requestOtp,
      shareOtp,
      declineOtp,
      reportResult,
      confirmCharge,
      settleUp,
      confirmRepayment,
      refresh,
      loadDemo,
      clearAll,
    };
  }, [me, demo, online, syncError, friends, friend, txns, shares, otps, nowMs, addFriend, shareCard, stopSharing,
    requestOtp, shareOtp, declineOtp, reportResult, confirmCharge, settleUp, confirmRepayment, refresh, loadDemo, clearAll]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}

// ---- Demo data: lets the APK be explored before a server is running. ----

function luhnComplete(prefix: string): string {
  let sum = 0;
  for (let i = 0; i < prefix.length; i++) {
    let d = Number(prefix[prefix.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return prefix + String((10 - (sum % 10)) % 10);
}

function demoSeed(me: string) {
  const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
  const friends: Friend[] = [
    { id: 'demo_rahul', name: 'Rahul Verma', email: 'rahul@example.com', publicKey: '', demo: true },
    { id: 'demo_meera', name: 'Meera Iyer', email: 'meera@example.com', publicKey: '', demo: true },
    { id: 'demo_priya', name: 'Priya Nair', email: 'priya@example.com', publicKey: '', demo: true },
    { id: 'demo_kabir', name: 'Kabir Shah', email: 'kabir@example.com', publicKey: '', demo: true },
  ];
  const cards: Card[] = [
    { id: 'demo_hdfc', cardRef: 'demo_hdfc', nickname: 'HDFC Millennia', network: 'visa', number: luhnComplete('431581002290482'), expiry: '08/29', cvv: '318', holder: 'Demo User', face: 'onyx', createdAt: ago(9000), source: 'own', demo: true },
    { id: 'demo_icici', cardRef: 'demo_icici', nickname: 'Amazon Pay ICICI', network: 'visa', number: luhnComplete('462745003311093'), expiry: '02/28', holder: 'Demo User', face: 'jade', createdAt: ago(8000), source: 'own', demo: true },
    {
      id: 'shr_demo_axis', cardRef: 'demo_axis', nickname: 'Rahul’s Axis', network: 'mastercard', number: luhnComplete('524193005518772'), expiry: '05/30', cvv: '742', holder: 'Rahul Verma', face: 'slate', createdAt: ago(7000), source: 'shared', demo: true,
      sharedBy: { userId: 'demo_rahul', name: 'Rahul', shareId: 'demo_axis', limitMinor: 500000, endsAt: inDays(12) },
    },
  ];
  const shares: OutgoingShare[] = [
    { id: 'demo_share_hdfc', cardId: 'demo_hdfc', friendId: 'demo_rahul', limitMinor: 500000, endsAt: inDays(12), includeCvv: false, createdAt: ago(9000), active: true },
  ];
  const t = (id: string, p: Partial<Txn>): Txn => ({
    id, kind: 'card_payment', lenderId: me, borrowerId: 'demo_rahul', amountMinor: 0, currency: 'INR', status: 'confirmed', requestedAt: ago(60), ...p,
  });
  const txns: Txn[] = [
    t('demo_t1', { merchant: 'Amazon', cardRef: 'demo_hdfc', amountMinor: 240000, status: 'pending', requestedAt: ago(0.5) }),
    t('demo_t2', { merchant: 'Swiggy', cardRef: 'demo_hdfc', amountMinor: 75000, requestedAt: ago(60 * 26), otpSharedAt: ago(60 * 26) }),
    t('demo_t3', { merchant: 'Nykaa', lenderId: 'demo_priya', borrowerId: me, cardRef: 'x', amountMinor: 120000, requestedAt: ago(60 * 24 * 5) }),
    t('demo_t4', { merchant: 'Myntra', lenderId: 'demo_rahul', borrowerId: me, cardRef: 'demo_axis', amountMinor: 120000, requestedAt: ago(60 * 24 * 7) }),
    t('demo_t5', { merchant: 'Croma', borrowerId: 'demo_meera', cardRef: 'demo_icici', amountMinor: 240000, requestedAt: ago(60 * 24 * 8) }),
    t('demo_t6', { merchant: 'Flipkart', cardRef: 'demo_hdfc', amountMinor: 360000, requestedAt: ago(60 * 24 * 10) }),
  ];
  return { friends, cards, shares, txns };
}
