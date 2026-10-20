import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import type { Relay } from '../src/mailbox.ts';
import { PgRelay, PgStore } from '../src/pgStore.ts';
import { MemoryStore, type Store } from '../src/store.ts';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const sealed = { epk: 'e'.repeat(44), nonce: 'n'.repeat(32), box: 'ciphertext' };
const KEY = 'k'.repeat(44);

// Runs against Postgres when TEST_DATABASE_URL is set (CI does), else in memory.
const pgUrl = process.env.TEST_DATABASE_URL;
const stores: Store[] = [];
test.after(async () => {
  for (const s of stores) await s.close();
});

async function setup() {
  let clock = Date.parse('2026-10-19T10:00:00Z');
  let store: Store;
  let mailbox: Relay | undefined;
  if (pgUrl) {
    const pg = new PgStore(pgUrl);
    await pg.migrate();
    await pg.query('truncate relay_messages, transaction_events, transactions, accounts');
    store = pg;
    mailbox = new PgRelay(pg, () => clock);
  } else {
    store = new MemoryStore();
  }
  stores.push(store);
  const app = buildApp({
    store,
    mailbox,
    secret: SECRET,
    now: () => clock,
    // The fake verifier treats the token as "sub|email".
    verifyGoogle: async (token) => {
      const [sub, email] = token.split('|');
      if (!email) throw new Error('bad token');
      return { sub, email };
    },
  });
  const signIn = async (sub: string, email: string) => {
    const res = await app.inject({ method: 'POST', url: '/v1/auth/google', payload: { idToken: `${sub}|${email}`, publicKey: KEY } });
    assert.equal(res.statusCode, 200, res.body);
    const { token, userId } = res.json();
    const call = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
      app.inject({ method, url, payload: payload as object, headers: { authorization: `Bearer ${token}` } });
    return { userId: userId as string, call };
  };
  return { app, store, signIn, tick: (ms: number) => (clock += ms) };
}

test('requires a valid session', async () => {
  const { app } = await setup();
  assert.equal((await app.inject({ method: 'GET', url: '/v1/transactions' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/transactions', headers: { authorization: 'Bearer nope' } })).statusCode, 401);
  const bad = await app.inject({ method: 'POST', url: '/v1/auth/google', payload: { idToken: 'garbage', publicKey: KEY } });
  assert.equal(bad.statusCode, 401);
});

test('full flow: share card, request OTP, relay it, confirm, then repay', async () => {
  const { signIn, store } = await setup();
  const aarav = await signIn('g-aarav', 'Aarav@Example.com');
  const rahul = await signIn('g-rahul', 'rahul@example.com');

  // Friend lookup by email is case-insensitive and returns only id + public key.
  const found = await rahul.call('POST', '/v1/users/lookup', { email: 'aarav@example.com' });
  assert.deepEqual(found.json(), { id: aarav.userId, publicKey: KEY });
  assert.equal((await rahul.call('POST', '/v1/users/lookup', { email: 'nobody@example.com' })).statusCode, 404);

  // Card share goes through the mailbox once and is gone after delivery.
  assert.equal((await aarav.call('POST', '/v1/mailbox', { to: rahul.userId, kind: 'card_share', payload: sealed })).statusCode, 201);
  const inbox = (await rahul.call('GET', '/v1/mailbox')).json().messages;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].from, aarav.userId);
  assert.equal((await rahul.call('GET', '/v1/mailbox')).json().messages.length, 0);

  // Rahul asks Aarav for an OTP.
  const req = await rahul.call('POST', '/v1/transactions', {
    lenderId: aarav.userId, amountMinor: 240000, currency: 'INR', merchant: 'Amazon', cardRef: 'crd_1', idempotencyKey: 'idem-1',
  });
  assert.equal(req.statusCode, 201, req.body);
  const txn = req.json();
  assert.equal(txn.status, 'pending');
  // Retrying with the same key returns the same row.
  const again = await rahul.call('POST', '/v1/transactions', {
    lenderId: aarav.userId, amountMinor: 240000, currency: 'INR', merchant: 'Amazon', cardRef: 'crd_1', idempotencyKey: 'idem-1',
  });
  assert.equal(again.json().id, txn.id);

  // Only the owner can share the OTP; it reaches the borrower sealed.
  assert.equal((await rahul.call('POST', `/v1/transactions/${txn.id}/otp`, { payload: sealed })).statusCode, 403);
  assert.equal((await aarav.call('POST', `/v1/transactions/${txn.id}/otp`, { payload: sealed })).statusCode, 200);
  const otpMsg = (await rahul.call('GET', '/v1/mailbox')).json().messages;
  assert.equal(otpMsg[0].kind, 'otp');
  assert.equal(otpMsg[0].txnId, txn.id);

  // Success from the borrower alone keeps it pending; the owner's confirmation records it.
  assert.equal((await rahul.call('POST', `/v1/transactions/${txn.id}/result`, { outcome: 'success' })).json().status, 'pending');
  const done = await aarav.call('POST', `/v1/transactions/${txn.id}/evidence`, { evidence: 'manual' });
  assert.equal(done.json().status, 'confirmed');

  // Both see the same row.
  assert.equal((await aarav.call('GET', '/v1/transactions')).json().transactions[0].id, txn.id);
  assert.equal((await rahul.call('GET', '/v1/transactions')).json().transactions[0].id, txn.id);

  // Rahul records paying back; he can't confirm his own record, Aarav can.
  const rep = (await rahul.call('POST', '/v1/repayments', {
    counterpartyId: aarav.userId, role: 'payer', amountMinor: 240000, currency: 'INR', method: 'UPI', idempotencyKey: 'idem-2',
  })).json();
  assert.equal(rep.lenderId, aarav.userId);
  assert.equal(rep.borrowerId, rahul.userId);
  assert.equal((await rahul.call('POST', `/v1/repayments/${rep.id}/confirm`)).statusCode, 403);
  assert.equal((await aarav.call('POST', `/v1/repayments/${rep.id}/confirm`)).json().status, 'confirmed');

  // The audit trail recorded each step; the database never saw the sealed payloads.
  if (store instanceof MemoryStore) {
    const types = store.events.filter((e) => e.txnId === txn.id).map((e) => e.type);
    assert.deepEqual(types, ['requested', 'otp_shared', 'result_success', 'evidence_manual', 'confirmed']);
    assert.ok(!JSON.stringify([...store.txns.values()]).includes('ciphertext'));
  } else if (store instanceof PgStore) {
    const { rows } = await store.query('select type from transaction_events where transaction_id = $1 order by id', [txn.id]);
    assert.deepEqual(rows.map((r) => r.type), ['requested', 'otp_shared', 'result_success', 'evidence_manual', 'confirmed']);
    const dump = await store.query('select * from transactions');
    assert.ok(!JSON.stringify(dump.rows).includes('ciphertext'));
  }
});

test('disagreement becomes a dispute; silence expires the request', async () => {
  const { signIn, tick } = await setup();
  const a = await signIn('a', 'a@x.com');
  const b = await signIn('b', 'b@x.com');
  const ask = async (key: string) =>
    (await b.call('POST', '/v1/transactions', { lenderId: a.userId, amountMinor: 1000, currency: 'INR', merchant: 'Shop', cardRef: 'c', idempotencyKey: key })).json();

  const t1 = await ask('k1');
  await a.call('POST', `/v1/transactions/${t1.id}/otp`, { payload: sealed });
  await a.call('POST', `/v1/transactions/${t1.id}/evidence`, { evidence: 'sms_match' });
  assert.equal((await b.call('POST', `/v1/transactions/${t1.id}/result`, { outcome: 'failed' })).json().status, 'disputed');

  const t2 = await ask('k2');
  tick(3 * 60 * 1000 + 1);
  const list = (await b.call('GET', '/v1/transactions')).json().transactions;
  assert.equal(list.find((t: { id: string }) => t.id === t2.id).status, 'expired');
  assert.equal((await a.call('POST', `/v1/transactions/${t2.id}/otp`, { payload: sealed })).statusCode, 409);

  // An outsider can't see or touch either transaction.
  const c = await signIn('c', 'c@x.com');
  assert.equal((await c.call('POST', `/v1/transactions/${t1.id}/dispute`, {})).statusCode, 404);
});

test('a borrower success stands after 24 hours without objection', async () => {
  const { signIn, tick } = await setup();
  const a = await signIn('a', 'a@x.com');
  const b = await signIn('b', 'b@x.com');
  const t = (await b.call('POST', '/v1/transactions', { lenderId: a.userId, amountMinor: 5000, currency: 'INR', merchant: 'Cafe', cardRef: 'c', idempotencyKey: 'k' })).json();
  await a.call('POST', `/v1/transactions/${t.id}/otp`, { payload: sealed });
  await b.call('POST', `/v1/transactions/${t.id}/result`, { outcome: 'success' });
  tick(24 * 60 * 60 * 1000 + 1);
  assert.equal((await a.call('GET', '/v1/transactions')).json().transactions[0].status, 'confirmed');
});

test('limits: velocity per card owner, amount cap, no self-requests', async () => {
  const { signIn } = await setup();
  const a = await signIn('a', 'a@x.com');
  const b = await signIn('b', 'b@x.com');
  const ask = (key: string, amountMinor = 1000, lenderId = a.userId) =>
    b.call('POST', '/v1/transactions', { lenderId, amountMinor, currency: 'INR', merchant: 'Shop', cardRef: 'c', idempotencyKey: key });
  for (let i = 0; i < 6; i++) assert.equal((await ask(`v${i}`)).statusCode, 201);
  assert.equal((await ask('v6')).statusCode, 429);
  assert.equal((await ask('big', 10_00_000_01)).statusCode, 400);
  assert.equal((await ask('self', 1000, b.userId)).statusCode, 400);
});

test('relayed messages are delivered once and expire unread', async () => {
  const { signIn, tick } = await setup();
  const a = await signIn('a', 'a@x.com');
  const b = await signIn('b', 'b@x.com');
  await a.call('POST', '/v1/mailbox', { to: b.userId, kind: 'card_share', payload: sealed });
  const t = (await b.call('POST', '/v1/transactions', { lenderId: a.userId, amountMinor: 1000, currency: 'INR', merchant: 'Shop', cardRef: 'c', idempotencyKey: 'k' })).json();
  await a.call('POST', `/v1/transactions/${t.id}/otp`, { payload: sealed });
  tick(6 * 60 * 1000); // the OTP's 5 minutes are up; the card share's 24 hours aren't
  const msgs = (await b.call('GET', '/v1/mailbox')).json().messages;
  assert.deepEqual(msgs.map((m: { kind: string }) => m.kind), ['card_share']);
  assert.deepEqual((await b.call('GET', '/v1/mailbox')).json().messages, []);
});
