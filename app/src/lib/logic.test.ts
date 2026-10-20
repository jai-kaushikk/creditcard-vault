import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, parseAmount } from './money.ts';
import { cardNumberInput, detectNetwork, expiryInput, formatCardNumber, luhnValid, normaliseExpiry } from './cardNumber.ts';
import { parseBankSms } from './sms.ts';
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

test('card number input stops at the network length', () => {
  assert.equal(cardNumberInput('4315 8100 2290 4821 9999'), '4315810022904821');
  assert.equal(cardNumberInput('378282246310005123'), '378282246310005');
  assert.equal(cardNumberInput('3056930902590412'), '30569309025904');
});

test('expiry gets its slash as you type, and loses it on backspace', () => {
  assert.equal(expiryInput('1', ''), '1');
  assert.equal(expiryInput('12', '1'), '12/');
  assert.equal(expiryInput('4', ''), '04/');
  assert.equal(expiryInput('12/2', '12/'), '12/2');
  assert.equal(expiryInput('12/29', '12/2'), '12/29');
  assert.equal(expiryInput('12/290', '12/29'), '12/29');
  assert.equal(expiryInput('12', '12/'), '1');
  assert.equal(expiryInput('0829', ''), '08/29');
});

test('bank SMS: finds the OTP and the amount', () => {
  const hdfc = 'OTP is 482913 for txn of INR 2,400.00 at AMAZON on HDFC Bank card ending 4821. Valid till 10:42. Do not share OTP for security reasons.';
  assert.deepEqual(parseBankSms(hdfc), { otp: '482913', amountMinor: 240000 });
  const icici = '519027 is the OTP for transaction of Rs.750.50 on your ICICI Bank Credit Card XX0937 at SWIGGY. OTPs are SECRET.';
  assert.deepEqual(parseBankSms(icici), { otp: '519027', amountMinor: 75050 });
  const sbi = 'Dear Customer, use one time password 9921 to complete your purchase of Rs 3150 at Myntra. SBI Card';
  assert.deepEqual(parseBankSms(sbi), { otp: '9921', amountMinor: 315000 });
  assert.deepEqual(parseBankSms(' 123456 '), { otp: '123456', amountMinor: null });
  assert.deepEqual(parseBankSms('Your card ending 4821 was used on 12/10/26'), { otp: null, amountMinor: null });
});
