// How a transaction moves between states. Pure functions, so the rules are
// the same whichever store is behind them, and easy to test.

export type TxnKind = 'card_payment' | 'repayment';
export type TxnStatus = 'pending' | 'confirmed' | 'expired' | 'disputed' | 'settled';

export type Txn = {
  id: string;
  kind: TxnKind;
  lenderId: string;
  borrowerId: string;
  amountMinor: number;
  currency: string;
  merchant: string | null;
  category: string | null;
  cardRef: string | null;
  method: string | null;
  createdBy: string;
  status: TxnStatus;
  requestedAt: string;
  otpSharedAt: string | null;
  borrowerResult: 'success' | 'failed' | null;
  lenderEvidence: 'sms_match' | 'manual' | 'objected' | null;
  confirmedAt: string | null;
  idempotencyKey: string;
};

export const OTP_TTL_MS = 3 * 60 * 1000;
/** A borrower's "it went through" stands if the lender hasn't objected in a day. */
export const AUTO_CONFIRM_MS = 24 * 60 * 60 * 1000;
export const MAX_AMOUNT_MINOR = 10_00_000_00; // ₹10,00,000
export const MAX_REQUESTS_PER_LENDER_PER_HOUR = 6;

export class RuleError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Time-based transitions, applied whenever a row is read. */
export function settle(t: Txn, now: number): Txn {
  if (t.kind !== 'card_payment' || t.status !== 'pending') return t;
  if (!t.otpSharedAt && now - Date.parse(t.requestedAt) > OTP_TTL_MS) {
    return { ...t, status: 'expired' };
  }
  if (t.borrowerResult === 'success' && !t.lenderEvidence && t.otpSharedAt && now - Date.parse(t.otpSharedAt) > AUTO_CONFIRM_MS) {
    return { ...t, status: 'confirmed', confirmedAt: new Date(now).toISOString() };
  }
  return t;
}

function requirePending(t: Txn) {
  if (t.status !== 'pending') throw new RuleError(409, `This transaction is already ${t.status}.`);
}

export function shareOtp(t: Txn, actor: string, now: number): Txn {
  if (t.lenderId !== actor) throw new RuleError(403, 'Only the card owner can share the OTP.');
  requirePending(t);
  if (t.otpSharedAt) throw new RuleError(409, 'The OTP was already shared.');
  return { ...t, otpSharedAt: new Date(now).toISOString() };
}

export function decline(t: Txn, actor: string): Txn {
  if (t.lenderId !== actor) throw new RuleError(403, 'Only the card owner can decline.');
  requirePending(t);
  return { ...t, status: 'expired' };
}

export function borrowerResult(t: Txn, actor: string, outcome: 'success' | 'failed', now: number): Txn {
  if (t.borrowerId !== actor) throw new RuleError(403, 'Only the person who paid can report the result.');
  requirePending(t);
  if (!t.otpSharedAt) throw new RuleError(409, 'No OTP has been shared yet.');
  const next: Txn = { ...t, borrowerResult: outcome };
  return resolve(next, now);
}

export function lenderEvidence(t: Txn, actor: string, evidence: 'sms_match' | 'manual' | 'objected', now: number): Txn {
  if (t.lenderId !== actor) throw new RuleError(403, 'Only the card owner can confirm the charge.');
  requirePending(t);
  if (!t.otpSharedAt) throw new RuleError(409, 'No OTP has been shared yet.');
  return resolve({ ...t, lenderEvidence: evidence }, now);
}

/** Both sides have spoken (or one has): decide the outcome. */
function resolve(t: Txn, now: number): Txn {
  const charged = t.lenderEvidence === 'sms_match' || t.lenderEvidence === 'manual';
  const objected = t.lenderEvidence === 'objected';
  if (t.borrowerResult === 'success' && charged) return { ...t, status: 'confirmed', confirmedAt: new Date(now).toISOString() };
  if (t.borrowerResult === 'success' && objected) return { ...t, status: 'disputed' };
  if (t.borrowerResult === 'failed' && charged) return { ...t, status: 'disputed' };
  if (t.borrowerResult === 'failed') return { ...t, status: 'expired' };
  if (objected && !t.borrowerResult) return { ...t, status: 'expired' };
  return t;
}

export function dispute(t: Txn, actor: string): Txn {
  if (t.lenderId !== actor && t.borrowerId !== actor) throw new RuleError(403, 'Not your transaction.');
  if (t.status === 'expired') throw new RuleError(409, 'Nothing was recorded for this transaction.');
  return { ...t, status: 'disputed' };
}

export function confirmRepayment(t: Txn, actor: string, now: number): Txn {
  if (t.kind !== 'repayment') throw new RuleError(400, 'Not a repayment.');
  if (t.lenderId !== actor && t.borrowerId !== actor) throw new RuleError(403, 'Not your repayment.');
  if (t.createdBy === actor) throw new RuleError(403, 'The other person confirms a repayment you recorded.');
  requirePending(t);
  return { ...t, status: 'confirmed', confirmedAt: new Date(now).toISOString() };
}
