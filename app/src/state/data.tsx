import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, type FriendRow, type MailMessage, type UserHit } from '@/lib/api';
import { config, serverConfigured } from '@/lib/config';
import { open, randomId, seal } from '@/lib/crypto';
import { effectiveStatus, netWith, OTP_TTL_MS, totals, type Txn } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { enableSystemNotifications, systemNotify } from '@/lib/notify';
import { getJSON, setJSON } from '@/lib/secure';
import { useNow } from '@/lib/useNow';
import { useAuth } from './auth';
import { useLock } from './lock';
import { useVault, type Card } from './vault';

export type Friend = { id: string; name: string; email: string; photo?: string | null; publicKey: string; demo?: boolean };
export type FriendRequest = { id: string; name: string; email: string; photo?: string | null; direction: 'incoming' | 'outgoing'; at: string };
export type AppNotification = { id: string; title: string; body: string; href?: string; at: string; read: boolean };
export type OutgoingShare = {
  id: string;
  cardId: string;
  friendId: string;
  /** Kept so the share can still be stopped after unfriending. */
  friendPublicKey?: string;
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

/** Something that might deserve a notification; `key` makes each one fire once. */
type Candidate = { key: string; title: string; body: string; href?: string };

const FRIENDS = 'cv.friends.v1';
const FORMER = 'cv.friends.former.v1';
const SHARES = 'cv.shares.v1';
const TXNS = 'cv.txns.v1';
const DEMO = 'cv.demo.v1';
const NOTES = 'cv.notifications.v1';
const SEEN = 'cv.notifications.seen.v1';
const POLL_MS = 4000;
/** In the background (Android keeps the app alive for a while; browsers keep tabs running) sync less often. */
const BACKGROUND_POLL_MS = 20_000;

type Ctx = {
  me: string;
  demo: boolean;
  online: boolean;
  syncError: string | null;
  /** Shared clock, updated every few seconds. */
  now: number;
  friends: Friend[];
  requests: FriendRequest[];
  friend: (id: string) => Friend | undefined;
  txns: Txn[];
  shares: OutgoingShare[];
  otpFor: (txnId: string) => string | undefined;
  net: (friendId: string) => number;
  totals: { owedToMe: number; iOwe: number };
  notifications: AppNotification[];
  unread: number;
  /** The newest notification, shown as a banner while the app is open. */
  banner: AppNotification | null;
  dismissBanner: () => void;
  markAllRead: () => void;
  requestFriend: (to: { email: string } | { id: string }) => Promise<'friend' | 'outgoing' | 'incoming'>;
  /** People on CardVault whose name or email starts with what's typed. */
  searchPeople: (q: string) => Promise<UserHit[]>;
  acceptFriend: (id: string) => Promise<void>;
  /** Declines a request or cancels one you sent. */
  declineFriend: (id: string) => Promise<void>;
  removeFriend: (id: string) => Promise<void>;
  inviteLink: () => Promise<string>;
  acceptInvite: (code: string) => Promise<Friend>;
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
const displayName = (r: { name: string | null; email: string | null }) => r.name?.trim() || r.email?.split('@')[0] || 'CardVault user';
const firstName = (name: string) => name.split(' ')[0];

function toFriend(r: FriendRow): Friend {
  return { id: r.id, name: displayName(r), email: r.email ?? '', photo: r.photo, publicKey: r.publicKey };
}

/** What in the latest sync is worth telling the user about. */
function candidatesFrom(txns: Txn[], rows: FriendRow[], me: string, name: (id: string) => string): Candidate[] {
  const out: Candidate[] = [];
  for (const r of rows) {
    if (r.state === 'incoming') out.push({ key: `fr-in:${r.id}`, title: `${displayName(r)} sent you a friend request`, body: 'Accept it to share cards and OTPs.', href: '/friends' });
    if (r.state === 'friend') out.push({ key: `fr-ok:${r.id}`, title: `You and ${firstName(displayName(r))} are now friends`, body: 'You can share cards with each other.', href: '/friends' });
  }
  const t0 = Date.now();
  for (const t of txns) {
    const who = firstName(name(t.lenderId === me ? t.borrowerId : t.lenderId));
    const amount = formatMoney(t.amountMinor, t.currency);
    if (t.kind === 'card_payment') {
      if (t.lenderId === me && t.status === 'pending' && !t.otpSharedAt && t0 - Date.parse(t.requestedAt) < OTP_TTL_MS) {
        out.push({ key: `otp-req:${t.id}`, title: `${who} needs an OTP`, body: `${amount} at ${t.merchant ?? 'a shop'}. Open to share it before it expires.`, href: `/otp/${t.id}` });
      }
      if (t.lenderId === me && t.status === 'pending' && t.borrowerResult === 'success' && !t.lenderEvidence) {
        out.push({ key: `charge:${t.id}`, title: `Did your bank charge ${amount}?`, body: `${who} says the payment at ${t.merchant ?? 'the shop'} went through.`, href: `/otp/${t.id}` });
      }
      if (t.status === 'confirmed') {
        out.push(t.lenderId === me
          ? { key: `ok:${t.id}`, title: `${who} owes you ${amount}`, body: `Payment at ${t.merchant ?? 'a shop'} recorded in both ledgers.`, href: '/ledger' }
          : { key: `ok:${t.id}`, title: `You owe ${who} ${amount}`, body: `Payment at ${t.merchant ?? 'a shop'} recorded in both ledgers.`, href: '/ledger' });
      }
      if (t.status === 'disputed') out.push({ key: `dispute:${t.id}`, title: `Payment of ${amount} disputed`, body: `You and ${who} disagree about it. It isn’t counted until it’s sorted out.`, href: '/ledger' });
    } else if (t.createdBy && t.createdBy !== me) {
      if (t.status === 'pending') out.push({ key: `repay:${t.id}`, title: `${who} recorded a ${amount} repayment`, body: 'Confirm it in your ledger once you see it.', href: '/ledger' });
    } else if (t.status === 'confirmed') {
      out.push({ key: `repaid:${t.id}`, title: `${who} confirmed your ${amount} repayment`, body: 'Your ledger is up to date.', href: '/ledger' });
    }
  }
  return out;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const { locked } = useLock();
  const vault = useVault();
  const me = user?.id ?? 'me';
  const [friends, setFriends] = useState<Friend[]>([]);
  const [former, setFormer] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [shares, setShares] = useState<OutgoingShare[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [demo, setDemo] = useState(false);
  const [otps, setOtps] = useState<Record<string, string>>({});
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [banner, setBanner] = useState<AppNotification | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Keys of things already notified. null until the first sync, which only records what's there.
  const seen = useRef<Set<string> | null>(null);
  const lastSync = useRef(0);
  // Re-evaluates time-based states (OTP expiry, share end dates) every few seconds.
  const nowMs = useNow(5000);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Load the local copies.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const pending = timers.current;
    (async () => {
      setFriends((await getJSON<Friend[]>(FRIENDS)) ?? []);
      setFormer((await getJSON<Friend[]>(FORMER)) ?? []);
      setShares((await getJSON<OutgoingShare[]>(SHARES)) ?? []);
      const cached = await AsyncStorage.getItem(TXNS);
      setTxns(cached ? JSON.parse(cached) : []);
      setDemo((await AsyncStorage.getItem(DEMO)) === '1');
      const notes = await AsyncStorage.getItem(NOTES);
      setNotifications(notes ? JSON.parse(notes) : []);
      const keys = await AsyncStorage.getItem(SEEN);
      seen.current = keys ? new Set(JSON.parse(keys)) : null;
      setLoaded(true);
    })().catch(() => setLoaded(true));
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
  const saveNotifications = useCallback((next: (prev: AppNotification[]) => AppNotification[]) => {
    setNotifications((prev) => {
      const value = next(prev).slice(0, 60);
      AsyncStorage.setItem(NOTES, JSON.stringify(value)).catch(() => {});
      return value;
    });
  }, []);

  /** Turns new candidates into notifications: in the list, as a banner, and as a system notification. */
  const publish = useCallback((cands: Candidate[], { always = false } = {}) => {
    const first = seen.current === null;
    const keys = seen.current ?? new Set<string>();
    const fresh = cands.filter((c) => !keys.has(c.key));
    fresh.forEach((c) => keys.add(c.key));
    seen.current = keys;
    AsyncStorage.setItem(SEEN, JSON.stringify([...keys].slice(-1500))).catch(() => {});
    // The first sync on a device only records what's already there, unless it just arrived.
    if (!fresh.length || (first && !always)) return;
    const at = now();
    const made = fresh.map((c) => ({ id: c.key, title: c.title, body: c.body, href: c.href, at, read: false }));
    saveNotifications((prev) => [...made, ...prev.filter((p) => !made.some((m) => m.id === p.id))]);
    setBanner(made[0]);
    for (const n of made) systemNotify(n).catch(() => {});
  }, [saveNotifications]);

  const online = serverConfigured && user?.mode === 'google' && !demo;
  const friend = useCallback((id: string) => friends.find((f) => f.id === id) ?? former.find((f) => f.id === id), [friends, former]);

  // Server sync: friends, transactions and the sealed-message inbox.
  const refresh = useCallback(async () => {
    if (!online) return;
    lastSync.current = Date.now();
    try {
      const [{ transactions }, { friends: rows }] = await Promise.all([api.transactions(), api.friends()]);
      saveTxns(transactions);

      const accepted = rows.filter((r) => r.state === 'friend').map(toFriend);
      const ids = new Set(accepted.map((f) => f.id));
      const gone = friends.filter((f) => !ids.has(f.id) && !f.demo);
      if (gone.length) {
        const nextFormer = [...gone, ...former.filter((f) => !gone.some((g) => g.id === f.id))].slice(0, 100);
        setFormer(nextFormer);
        await setJSON(FORMER, nextFormer);
      }
      await saveFriends(accepted);
      setRequests(rows.filter((r) => r.state !== 'friend').map((r) => ({
        id: r.id, name: displayName(r), email: r.email ?? '', photo: r.photo, direction: r.state === 'incoming' ? 'incoming' : 'outgoing', at: r.since,
      })));
      // After an unfriend (from either side): their cards leave this device and mine stop being shared.
      for (const c of vault.cards) {
        if (c.source === 'shared' && c.sharedBy && !c.demo && !ids.has(c.sharedBy.userId)) await vault.removeCard(c.id);
      }
      const orphaned = shares.filter((s) => s.active && !ids.has(s.friendId));
      if (orphaned.length) {
        for (const s of orphaned) {
          if (s.friendPublicKey) await api.send(s.friendId, 'card_unshare', seal(s.friendPublicKey, { shareId: s.id })).catch(() => {});
        }
        await saveShares(shares.map((s) => (orphaned.includes(s) ? { ...s, active: false } : s)));
      }

      const nameOf = (id: string) => accepted.find((f) => f.id === id)?.name ?? friend(id)?.name ?? 'A friend';
      publish(candidatesFrom(transactions, rows, me, nameOf));

      const { messages } = await api.inbox();
      const arrived: Candidate[] = [];
      for (const m of messages as MailMessage[]) {
        if (m.kind === 'otp' && m.txnId) {
          const body = await open<{ otp: string }>(m.payload);
          if (!body) continue;
          setOtps((prev) => ({ ...prev, [m.txnId!]: body.otp }));
          const t = transactions.find((x) => x.id === m.txnId);
          const card = vault.cards.find((c) => c.source === 'shared' && c.cardRef === t?.cardRef);
          arrived.push({ key: `otp-in:${m.txnId}`, title: `${firstName(nameOf(m.from))} sent the OTP`, body: 'Open CardVault to see it and finish paying.', href: card ? `/pay/${card.id}` : '/' });
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
          arrived.push({ key: `share:${body.shareId}:${m.id}`, title: `${firstName(body.fromName)} shared ${body.card.nickname} with you`, body: `Up to ${formatMoney(body.limitMinor)} a payment. They approve each one with an OTP.`, href: `/card/shr_${body.shareId}` });
        } else if (m.kind === 'card_unshare') {
          const body = await open<{ shareId: string }>(m.payload);
          if (body) await vault.removeCard(`shr_${body.shareId}`);
        }
      }
      if (arrived.length) publish(arrived, { always: true });
      setSyncError(null);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed');
    }
  }, [online, me, friends, former, friend, shares, saveTxns, saveFriends, saveShares, vault, publish]);

  // Ask for system notification permission once someone is signed in to the server.
  useEffect(() => {
    if (online) enableSystemNotifications().catch(() => {});
  }, [online]);

  // Keep the latest refresh in a ref so the polling timer doesn't restart on every state change.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!online || locked || !loaded) return;
    const first = setTimeout(() => refreshRef.current(), 0);
    const id = setInterval(() => {
      const gap = AppState.currentState === 'active' ? POLL_MS : BACKGROUND_POLL_MS;
      if (Date.now() - lastSync.current >= gap - 500) refreshRef.current();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [online, locked, loaded]);

  const publicKeyOf = useCallback(async (id: string) => {
    const f = friend(id);
    if (f?.publicKey) return f.publicKey;
    return (await api.getUser(id)).publicKey;
  }, [friend]);

  const needServer = useCallback(() => {
    if (!online) throw new Error('Friends connect through the CardVault server. Sign in with Google to add them.');
  }, [online]);

  const requestFriend = useCallback(async (to: { email: string } | { id: string }) => {
    needServer();
    const r = await api.requestFriend('email' in to ? { email: to.email.trim() } : to);
    await refreshRef.current();
    return r.state;
  }, [needServer]);

  const searchPeople = useCallback(async (q: string) => {
    if (!online || q.trim().length < 2) return [];
    return (await api.searchUsers(q.trim())).users;
  }, [online]);

  const acceptFriend = useCallback(async (id: string) => {
    needServer();
    await api.acceptFriend(id);
    await refreshRef.current();
  }, [needServer]);

  const declineFriend = useCallback(async (id: string) => {
    needServer();
    await api.removeFriend(id);
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }, [needServer]);

  const inviteLink = useCallback(async () => {
    needServer();
    const { code } = await api.createInvite();
    return `${config.apiUrl}/invite/${code}`;
  }, [needServer]);

  const acceptInvite = useCallback(async (code: string) => {
    needServer();
    const r = await api.acceptInvite(code);
    await refreshRef.current();
    return { id: r.friend.id, name: displayName(r.friend), email: r.friend.email ?? '', photo: r.friend.photo, publicKey: '' };
  }, [needServer]);

  const shareCard = useCallback<Ctx['shareCard']>(async (card, f, { limitMinor, days, includeCvv }) => {
    const terms = { limitMinor, includeCvv, endsAt: new Date(Date.now() + days * 86_400_000).toISOString() };
    const share: OutgoingShare = {
      id: randomId('shr'),
      cardId: card.id,
      friendId: f.id,
      friendPublicKey: f.publicKey || undefined,
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
      await api.send(s.friendId, 'card_unshare', seal(s.friendPublicKey ?? (await publicKeyOf(s.friendId)), { shareId }));
    }
    await saveShares(shares.map((x) => (x.id === shareId ? { ...x, active: false } : x)));
  }, [online, shares, saveShares, publicKeyOf]);

  const removeFriend = useCallback(async (id: string) => {
    if (!online) {
      await saveFriends(friends.filter((f) => f.id !== id));
      return;
    }
    // Stop my shares and drop theirs first, while we still know their key.
    for (const s of shares.filter((x) => x.active && x.friendId === id)) await stopSharing(s.id).catch(() => {});
    for (const c of vault.cards.filter((x) => x.sharedBy?.userId === id)) await vault.removeCard(c.id);
    await api.removeFriend(id);
    await refreshRef.current();
  }, [online, friends, shares, saveFriends, stopSharing, vault]);

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
    setRequests([]);
    setFormer([]);
    await setJSON(FORMER, []);
    saveNotifications(() => []);
    setBanner(null);
    await AsyncStorage.removeItem(DEMO);
    setDemo(false);
  }, [vault, saveFriends, saveShares, saveTxns, saveNotifications]);

  const dismissBanner = useCallback(() => setBanner(null), []);
  const markAllRead = useCallback(() => saveNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true }))), [saveNotifications]);

  const value = useMemo<Ctx>(() => {
    const live = txns.map((t) => ({ ...t, status: effectiveStatus(t, nowMs) }));
    return {
      me,
      demo,
      online,
      syncError,
      friends,
      requests,
      friend,
      txns: live,
      now: nowMs,
      shares: shares.filter((s) => s.active && Date.parse(s.endsAt) > nowMs),
      otpFor: (id) => otps[id],
      net: (friendId) => netWith(live, me, friendId),
      totals: totals(live, me, friends.map((f) => f.id)),
      notifications,
      unread: notifications.filter((n) => !n.read).length,
      banner,
      dismissBanner,
      markAllRead,
      requestFriend,
      searchPeople,
      acceptFriend,
      declineFriend,
      removeFriend,
      inviteLink,
      acceptInvite,
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
  }, [me, demo, online, syncError, friends, requests, friend, txns, shares, otps, nowMs, notifications, banner, dismissBanner, markAllRead,
    requestFriend, searchPeople, acceptFriend, declineFriend, removeFriend, inviteLink, acceptInvite, shareCard, stopSharing,
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
