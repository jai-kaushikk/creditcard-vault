import { config, serverConfigured } from './config';
import type { Sealed } from './crypto';
import type { Txn } from './ledger';
import { getJSON, remove, setJSON } from './secure';

// Thin client for the CardVault server (../../server). The server stores
// transactions only; card data and OTPs pass through it as sealed ciphertext.

const SESSION_KEY = 'cv.session.v1';
export type Session = { token: string; userId: string };

let session: Session | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called when the server rejects the session, so the app can ask for sign-in again. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function loadSession(): Promise<Session | null> {
  session = await getJSON<Session>(SESSION_KEY);
  return session;
}

export async function clearSession(): Promise<void> {
  session = null;
  await remove(SESSION_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!serverConfigured) throw new ApiError(0, 'No server is configured in this build.');
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      // Only with a body: Fastify rejects an empty body labelled as JSON.
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401 && session && path !== '/v1/auth/google') onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export type Profile = { id: string; email: string | null; name: string | null; photo: string | null };
export type FriendRow = Profile & { publicKey: string; state: 'friend' | 'incoming' | 'outgoing'; since: string };
export type InvitePeek = { name: string; photo: string | null; expiresAt: string };
/** Someone on CardVault, from search. Strangers' emails come back masked ("ra•••@gmail.com"). */
export type UserHit = { id: string; name: string | null; email: string | null; photo: string | null; state: FriendRow['state'] | 'none' };
export type MailMessage = {
  id: string;
  from: string;
  kind: 'card_share' | 'card_unshare' | 'otp';
  txnId?: string | null;
  payload: Sealed;
  sentAt: string;
};

export const api = {
  async signInWithGoogle(idToken: string, publicKey: string): Promise<Session> {
    const s = await call<Session>('POST', '/v1/auth/google', { idToken, publicKey });
    session = s;
    await setJSON(SESSION_KEY, s);
    return s;
  },
  me: () => call<Profile>('GET', '/v1/me'),
  friends: () => call<{ friends: FriendRow[] }>('GET', '/v1/friends'),
  /** By email, or by account id from search. */
  requestFriend: (to: { email: string } | { id: string }) => call<{ state: FriendRow['state']; friend: Profile }>('POST', '/v1/friends/requests', to),
  searchUsers: (q: string) => call<{ users: UserHit[] }>('POST', '/v1/users/search', { q }),
  acceptFriend: (id: string) => call<{ state: 'friend' }>('POST', `/v1/friends/${encodeURIComponent(id)}/accept`, {}),
  /** Declines, cancels or unfriends. */
  removeFriend: (id: string) => call<{ ok: true }>('DELETE', `/v1/friends/${encodeURIComponent(id)}`),
  getUser: (id: string) => call<Profile & { publicKey: string }>('GET', `/v1/users/${encodeURIComponent(id)}`),
  createInvite: () => call<{ code: string; expiresAt: string }>('POST', '/v1/invites', {}),
  peekInvite: (code: string) => call<InvitePeek>('GET', `/v1/invites/${encodeURIComponent(code)}`),
  acceptInvite: (code: string) => call<{ state: 'friend'; friend: Profile }>('POST', `/v1/invites/${encodeURIComponent(code)}/accept`, {}),
  transactions: () => call<{ transactions: Txn[] }>('GET', '/v1/transactions'),
  requestOtp: (body: { lenderId: string; amountMinor: number; currency: string; merchant: string; cardRef: string; idempotencyKey: string }) =>
    call<Txn>('POST', '/v1/transactions', body),
  shareOtp: (txnId: string, payload: Sealed) => call<Txn>('POST', `/v1/transactions/${txnId}/otp`, { payload }),
  decline: (txnId: string) => call<Txn>('POST', `/v1/transactions/${txnId}/decline`, {}),
  borrowerResult: (txnId: string, outcome: 'success' | 'failed') => call<Txn>('POST', `/v1/transactions/${txnId}/result`, { outcome }),
  lenderEvidence: (txnId: string, evidence: 'manual' | 'objected') => call<Txn>('POST', `/v1/transactions/${txnId}/evidence`, { evidence }),
  dispute: (txnId: string, reason: string) => call<Txn>('POST', `/v1/transactions/${txnId}/dispute`, { reason }),
  /** role: am I the one paying back ('payer') or the one being paid ('payee')? */
  repay: (body: { counterpartyId: string; role: 'payer' | 'payee'; amountMinor: number; currency: string; method: string; idempotencyKey: string }) =>
    call<Txn>('POST', '/v1/repayments', body),
  confirmRepayment: (txnId: string) => call<Txn>('POST', `/v1/repayments/${txnId}/confirm`, {}),
  send: (to: string, kind: MailMessage['kind'], payload: Sealed) => call<{ id: string }>('POST', '/v1/mailbox', { to, kind, payload }),
  inbox: () => call<{ messages: MailMessage[] }>('GET', '/v1/mailbox'),
};
