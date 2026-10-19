import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { Txn } from './rules.ts';
import type { Account, Store, TxnEvent } from './store.ts';

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
    publicKey: String(r.public_key),
    status: r.status as Account['status'],
    createdAt: iso(r.created_at)!,
  };
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

  async upsertAccount(a: Omit<Account, 'createdAt' | 'status'>) {
    const { rows } = await this.pool.query(
      `insert into accounts (id, email_hash, public_key) values ($1, $2, $3)
       on conflict (id) do update set email_hash = excluded.email_hash, public_key = excluded.public_key
       returning *`,
      [a.id, a.emailHash, a.publicKey],
    );
    return toAccount(rows[0]);
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
