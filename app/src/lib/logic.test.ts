import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, parseAmount } from './money.ts';
import { detectNetwork, formatCardNumber, luhnValid, normaliseExpiry } from './cardNumber.ts';
import { effectiveStatus, netWith, ownerTodo, totals, type Txn } from './ledger.ts';

test('formatMoney uses Indian grouping for INR', () => {
  assert.equal(formatMoney(240000), '₹2,400');
  assert.equal(formatMoney(12000000), '₹1,20,000');
  assert.equal(formatMoney(-315050), '₹3,150.50');
  assert.equal(formatMoney(123456789, 'USD'), '$1,234,567.89');
});

test('parseAmount reads what people type', () => {
  assert.equal(parseAmount('2,400'), 240000);
  assert.equal(parseAmount('₹ 1,250.5'), 125050);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('1.2.3'), null);
  assert.equal(parseAmount(''), null);
});

test('card numbers: Luhn, network, grouping, expiry', () => {
  assert.equal(luhnValid('4111 1111 1111 1111'), true);
  assert.equal(luhnValid('4111 1111 1111 1112'), false);
  assert.equal(detectNetwork('4111111111111111'), 'visa');
  assert.equal(detectNetwork('5500000000000004'), 'mastercard');
  assert.equal(detectNetwork('378282246310005'), 'amex');
  assert.equal(detectNetwork('6521000000000000'), 'rupay');
  assert.equal(formatCardNumber('4111111111111111'), '4111 1111 1111 1111');
  assert.equal(formatCardNumber('378282246310005'), '3782 822463 10005');
  assert.equal(normaliseExpiry('829'), '08/29');
  assert.equal(normaliseExpiry('13/29'), null);
});

const base = { currency: 'INR', requestedAt: new Date(0).toISOString() } as const;
const txns: Txn[] = [
  { ...base, id: '1', kind: 'card_payment', lenderId: 'me', borrowerId: 'rahul', amountMinor: 75000, status: 'confirmed' },
  { ...base, id: '2', kind: 'card_payment', lenderId: 'me', borrowerId: 'rahul', amountMinor: 360000, status: 'confirmed' },
  { ...base, id: '3', kind: 'card_payment', lenderId: 'rahul', borrowerId: 'me', amountMinor: 120000, status: 'confirmed' },
  { ...base, id: '4', kind: 'card_payment', lenderId: 'me', borrowerId: 'rahul', amountMinor: 240000, status: 'pending' },
  { ...base, id: '5', kind: 'card_payment', lenderId: 'me', borrowerId: 'priya', amountMinor: 50000, status: 'confirmed' },
  { ...base, id: '6', kind: 'repayment', lenderId: 'me', borrowerId: 'priya', amountMinor: 50000, status: 'confirmed' },
];

test('net balance counts only confirmed rows and subtracts repayments', () => {
  assert.equal(netWith(txns, 'me', 'rahul'), 315000);
  assert.equal(netWith(txns, 'rahul', 'me'), -315000);
  assert.equal(netWith(txns, 'me', 'priya'), 0);
  assert.deepEqual(totals(txns, 'me', ['rahul', 'priya']), { owedToMe: 315000, iOwe: 0 });
});

test('unanswered OTP requests expire after three minutes', () => {
  const now = Date.parse('2026-10-19T10:00:00Z');
  const fresh: Txn = { ...txns[3], requestedAt: new Date(now - 60_000).toISOString() };
  const stale: Txn = { ...txns[3], requestedAt: new Date(now - 4 * 60_000).toISOString() };
  assert.equal(effectiveStatus(fresh, now), 'pending');
  assert.equal(effectiveStatus(stale, now), 'expired');
  assert.equal(ownerTodo(fresh, 'me', now), 'share_otp');
  assert.equal(ownerTodo({ ...fresh, otpSharedAt: 'x', borrowerResult: 'success' }, 'me', now), 'confirm_charge');
  assert.equal(ownerTodo(fresh, 'rahul', now), null);
});
