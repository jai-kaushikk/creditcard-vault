import type { Txn } from './rules.ts';

/** Who someone is (from Google) and the key their phone seals messages to. */
export type Account = {
  id: string;
  emailHash: string;
  /** Null only for accounts that haven't signed in since emails were stored. */
  email: string | null;
  name: string | null;
  photo: string | null;
  publicKey: string;
  status: 'active' | 'suspended';
  createdAt: string;
};
export type NewAccount = Omit<Account, 'createdAt' | 'status'>;

/** One row per pair of people; `a` sorts before `b`. Declining or unfriending deletes it. */
export type Friendship = {
  a: string;
  b: string;
  requestedBy: string;
  status: 'pending' | 'accepted';
  createdAt: string;
  acceptedAt: string | null;
};

export type Invite = { code: string; fromId: string; createdAt: string; expiresAt: string };

export const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

export type TxnEvent = { txnId: string; actor: string; type: string; at: string; meta?: Record<string, unknown> };

export interface Store {
  upsertAccount(a: NewAccount): Promise<Account>;
  accountById(id: string): Promise<Account | null>;
  accountsByIds(ids: string[]): Promise<Account[]>;
  accountByEmailHash(hash: string): Promise<Account | null>;
  friendship(x: string, y: string): Promise<Friendship | null>;
  friendshipsOf(userId: string): Promise<Friendship[]>;
  saveFriendship(f: Friendship): Promise<void>;
  deleteFriendship(x: string, y: string): Promise<void>;
  addInvite(i: Invite): Promise<void>;
  inviteByCode(code: string): Promise<Invite | null>;
  latestInviteFrom(userId: string): Promise<Invite | null>;
  insertTxn(t: Txn): Promise<Txn>;
  txnById(id: string): Promise<Txn | null>;
  txnByIdempotencyKey(key: string): Promise<Txn | null>;
  updateTxn(t: Txn): Promise<Txn>;
  txnsFor(userId: string): Promise<Txn[]>;
  countRecentRequests(lenderId: string, sinceIso: string): Promise<number>;
  addEvent(e: TxnEvent): Promise<void>;
  close(): Promise<void>;
}

/** For local development and tests. Data is lost on restart. */
export class MemoryStore implements Store {
  accounts = new Map<string, Account>();
  friendships = new Map<string, Friendship>();
  invites = new Map<string, Invite>();
  txns = new Map<string, Txn>();
  events: TxnEvent[] = [];

  async upsertAccount(a: NewAccount) {
    const prev = this.accounts.get(a.id);
    const next: Account = { status: 'active', createdAt: new Date().toISOString(), ...prev, ...a };
    this.accounts.set(a.id, next);
    return next;
  }
  async accountById(id: string) {
    return this.accounts.get(id) ?? null;
  }
  async accountsByIds(ids: string[]) {
    return ids.flatMap((id) => this.accounts.get(id) ?? []);
  }
  async accountByEmailHash(hash: string) {
    return [...this.accounts.values()].find((a) => a.emailHash === hash) ?? null;
  }
  async friendship(x: string, y: string) {
    return this.friendships.get(pair(x, y).join('|')) ?? null;
  }
  async friendshipsOf(userId: string) {
    return [...this.friendships.values()].filter((f) => f.a === userId || f.b === userId);
  }
  async saveFriendship(f: Friendship) {
    this.friendships.set(`${f.a}|${f.b}`, f);
  }
  async deleteFriendship(x: string, y: string) {
    this.friendships.delete(pair(x, y).join('|'));
  }
  async addInvite(i: Invite) {
    this.invites.set(i.code, i);
  }
  async inviteByCode(code: string) {
    return this.invites.get(code) ?? null;
  }
  async latestInviteFrom(userId: string) {
    return [...this.invites.values()].filter((i) => i.fromId === userId).sort((p, q) => q.expiresAt.localeCompare(p.expiresAt))[0] ?? null;
  }
  async insertTxn(t: Txn) {
    this.txns.set(t.id, t);
    return t;
  }
  async txnById(id: string) {
    return this.txns.get(id) ?? null;
  }
  async txnByIdempotencyKey(key: string) {
    return [...this.txns.values()].find((t) => t.idempotencyKey === key) ?? null;
  }
  async updateTxn(t: Txn) {
    this.txns.set(t.id, t);
    return t;
  }
  async txnsFor(userId: string) {
    return [...this.txns.values()]
      .filter((t) => t.lenderId === userId || t.borrowerId === userId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }
  async countRecentRequests(lenderId: string, sinceIso: string) {
    return [...this.txns.values()].filter((t) => t.kind === 'card_payment' && t.lenderId === lenderId && t.requestedAt >= sinceIso).length;
  }
  async addEvent(e: TxnEvent) {
    this.events.push(e);
  }
  async close() {}
}
