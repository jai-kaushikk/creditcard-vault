import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { TTL, type MailMessage, type OutgoingMail, type Relay } from './mailbox.ts';
import type { Txn } from './rules.ts';
import { pair, type Account, type Friendship, type Invite, type NewAccount, type Store, type TxnEvent } from './store.ts';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

function toTxn(r: Record<string, unknown>): Txn {
  return {
    id: String(r.id),
    kind: r.kind as Txn['kind'],
    lenderId: String(r.lender_id),
    borrowerId: String(r.borrower_id),
    amountMinor: Number(r.amount_minor),
    currency: String(r.currency),
    merchant: (r.merchant as string) ?? null,
    category: (r.category as string) ?? null,
    cardRef: (r.card_ref as string) ?? null,
    method: (r.method as string) ?? null,
    createdBy: String(r.created_by),
    status: r.status as Txn['status'],
    requestedAt: iso(r.requested_at)!,
    otpSharedAt: iso(r.otp_shared_at),
    borrowerResult: (r.borrower_result as Txn['borrowerResult']) ?? null,
    lenderEvidence: (r.lender_evidence as Txn['lenderEvidence']) ?? null,
    confirmedAt: iso(r.confirmed_at),
    idempotencyKey: String(r.idempotency_key),
  };
}

function toAccount(r: Record<string, unknown>): Account {
  return {
    id: String(r.id),
    emailHash: String(r.email_hash),
    email: (r.email as string) ?? null,
    name: (r.name as string) ?? null,
    photo: (r.photo_url as string) ?? null,
    publicKey: String(r.public_key),
    status: r.status as Account['status'],
    createdAt: iso(r.created_at)!,
  };
}

function toFriendship(r: Record<string, unknown>): Friendship {
  return {
    a: String(r.user_a),
    b: String(r.user_b),
    requestedBy: String(r.requested_by),
    status: r.status as Friendship['status'],
    createdAt: iso(r.created_at)!,
    acceptedAt: iso(r.accepted_at),
  };
}

function toInvite(r: Record<string, unknown>): Invite {
  return { code: String(r.code), fromId: String(r.from_id), createdAt: iso(r.created_at)!, expiresAt: iso(r.expires_at)! };
}

export class PgStore implements Store {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  /** For tests and maintenance scripts. */
  query(sql: string, params?: unknown[]) {
    return this.pool.query(sql, params);
  }

  async migrate() {
    const sql = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
    await this.pool.query(sql);
  }

  async upsertAccount(a: NewAccount) {
    const { rows } = await this.pool.query(
      `insert into accounts (id, email_hash, email, name, photo_url, public_key) values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set email_hash = excluded.email_hash, email = excluded.email, name = excluded.name,
         photo_url = excluded.photo_url, public_key = excluded.public_key
       returning *`,
      [a.id, a.emailHash, a.email, a.name, a.photo, a.publicKey],
    );
    return toAccount(rows[0]);
  }
  async accountsByIds(ids: string[]) {
    if (!ids.length) return [];
    const { rows } = await this.pool.query('select * from accounts where id = any($1)', [ids]);
    return rows.map(toAccount);
  }
  async friendship(x: string, y: string) {
    const { rows } = await this.pool.query('select * from friendships where user_a = $1 and user_b = $2', pair(x, y));
    return rows[0] ? toFriendship(rows[0]) : null;
  }
  async friendshipsOf(userId: string) {
    const { rows } = await this.pool.query('select * from friendships where user_a = $1 or user_b = $1', [userId]);
    return rows.map(toFriendship);
  }
  async saveFriendship(f: Friendship) {
    await this.pool.query(
      `insert into friendships (user_a, user_b, requested_by, status, created_at, accepted_at) values ($1, $2, $3, $4, $5, $6)
       on conflict (user_a, user_b) do update set requested_by = excluded.requested_by, status = excluded.status,
         created_at = excluded.created_at, accepted_at = excluded.accepted_at`,
      [f.a, f.b, f.requestedBy, f.status, f.createdAt, f.acceptedAt],
    );
  }
  async deleteFriendship(x: string, y: string) {
    await this.pool.query('delete from friendships where user_a = $1 and user_b = $2', pair(x, y));
  }
  async addInvite(i: Invite) {
    await this.pool.query('insert into invites (code, from_id, created_at, expires_at) values ($1, $2, $3, $4)', [
      i.code, i.fromId, i.createdAt, i.expiresAt,
    ]);
  }
  async inviteByCode(code: string) {
    const { rows } = await this.pool.query('select * from invites where code = $1', [code]);
    return rows[0] ? toInvite(rows[0]) : null;
  }
  async latestInviteFrom(userId: string) {
    const { rows } = await this.pool.query('select * from invites where from_id = $1 order by expires_at desc limit 1', [userId]);
    return rows[0] ? toInvite(rows[0]) : null;
  }
  async accountById(id: string) {
    const { rows } = await this.pool.query('select * from accounts where id = $1', [id]);
    return rows[0] ? toAccount(rows[0]) : null;
  }
  async accountByEmailHash(hash: string) {
    const { rows } = await this.pool.query('select * from accounts where email_hash = $1', [hash]);
    return rows[0] ? toAccount(rows[0]) : null;
  }
  async insertTxn(t: Txn) {
    const { rows } = await this.pool.query(
      `insert into transactions (id, kind, lender_id, borrower_id, amount_minor, currency, merchant, category, card_ref, method,
         created_by, status, requested_at, otp_shared_at, borrower_result, lender_evidence, confirmed_at, idempotency_key)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning *`,
      [t.id, t.kind, t.lenderId, t.borrowerId, t.amountMinor, t.currency, t.merchant, t.category, t.cardRef, t.method,
        t.createdBy, t.status, t.requestedAt, t.otpSharedAt, t.borrowerResult, t.lenderEvidence, t.confirmedAt, t.idempotencyKey],
    );
    return toTxn(rows[0]);
  }
  async txnById(id: string) {
    const { rows } = await this.pool.query('select * from transactions where id = $1', [id]);
    return rows[0] ? toTxn(rows[0]) : null;
  }
  async txnByIdempotencyKey(key: string) {
    const { rows } = await this.pool.query('select * from transactions where idempotency_key = $1', [key]);
    return rows[0] ? toTxn(rows[0]) : null;
  }
  async updateTxn(t: Txn) {
    const { rows } = await this.pool.query(
      `update transactions set status = $2, otp_shared_at = $3, borrower_result = $4, lender_evidence = $5, confirmed_at = $6
       where id = $1 returning *`,
      [t.id, t.status, t.otpSharedAt, t.borrowerResult, t.lenderEvidence, t.confirmedAt],
    );
    return toTxn(rows[0]);
  }
  async txnsFor(userId: string) {
    const { rows } = await this.pool.query(
      'select * from transactions where lender_id = $1 or borrower_id = $1 order by requested_at desc limit 500',
      [userId],
    );
    return rows.map(toTxn);
  }
  async countRecentRequests(lenderId: string, sinceIso: string) {
    const { rows } = await this.pool.query(
      `select count(*)::int as n from transactions where kind = 'card_payment' and lender_id = $1 and requested_at >= $2`,
      [lenderId, sinceIso],
    );
    return rows[0].n as number;
  }
  async addEvent(e: TxnEvent) {
    await this.pool.query('insert into transaction_events (transaction_id, actor, type, at, meta) values ($1, $2, $3, $4, $5)', [
      e.txnId, e.actor, e.type, e.at, JSON.stringify(e.meta ?? {}),
    ]);
  }
  async close() {
    await this.pool.end();
  }
}

/** Sealed messages in Postgres: deleted on delivery, expired ones swept on every read. */
export class PgRelay implements Relay {
  private db: PgStore;
  private now: () => number;

  constructor(db: PgStore, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  async send(msg: OutgoingMail): Promise<MailMessage> {
    const t = this.now();
    const m: MailMessage = { id: randomUUID(), txnId: null, ...msg, sentAt: new Date(t).toISOString(), expiresAt: t + TTL[msg.kind] };
    await this.db.query(
      `insert into relay_messages (id, to_id, from_id, kind, txn_id, payload, sent_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [m.id, m.to, m.from, m.kind, m.txnId, JSON.stringify(m.payload), m.sentAt, new Date(m.expiresAt).toISOString()],
    );
    return m;
  }

  async drain(userId: string): Promise<MailMessage[]> {
    const nowIso = new Date(this.now()).toISOString();
    await this.db.query('delete from relay_messages where expires_at <= $1', [nowIso]);
    const { rows } = await this.db.query('delete from relay_messages where to_id = $1 returning *', [userId]);
    return rows
      .map((r) => ({
        id: String(r.id),
        from: String(r.from_id),
        to: String(r.to_id),
        kind: r.kind as MailMessage['kind'],
        txnId: (r.txn_id as string) ?? null,
        payload: r.payload as MailMessage['payload'],
        sentAt: iso(r.sent_at)!,
        expiresAt: Date.parse(iso(r.expires_at)!),
      }))
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }
}
