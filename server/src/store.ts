import type { Txn } from './rules.ts';

/** The minimum needed to route messages and sign people in. */
export type Account = {
  id: string;
  emailHash: string;
  publicKey: string;
  status: 'active' | 'suspended';
  createdAt: string;
};

export type TxnEvent = { txnId: string; actor: string; type: string; at: string; meta?: Record<string, unknown> };

export interface Store {
  upsertAccount(a: Omit<Account, 'createdAt' | 'status'>): Promise<Account>;
  accountById(id: string): Promise<Account | null>;
  accountByEmailHash(hash: string): Promise<Account | null>;
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
  txns = new Map<string, Txn>();
  events: TxnEvent[] = [];

  async upsertAccount(a: Omit<Account, 'createdAt' | 'status'>) {
    const prev = this.accounts.get(a.id);
    const next: Account = { status: 'active', createdAt: new Date().toISOString(), ...prev, ...a };
    this.accounts.set(a.id, next);
    return next;
  }
  async accountById(id: string) {
    return this.accounts.get(id) ?? null;
  }
  async accountByEmailHash(hash: string) {
    return [...this.accounts.values()].find((a) => a.emailHash === hash) ?? null;
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
