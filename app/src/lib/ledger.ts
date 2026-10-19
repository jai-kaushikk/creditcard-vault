// The ledger is a list of transactions shared by two people. The server stores
// these rows; balances are computed on the phone from them.

export type TxnKind = 'card_payment' | 'repayment';
export type TxnStatus = 'pending' | 'confirmed' | 'expired' | 'disputed' | 'settled';

export type Txn = {
  id: string;
  kind: TxnKind;
  /** card_payment: the card owner. repayment: the person being paid back. */
  lenderId: string;
  /** card_payment: who paid with the card. repayment: who is paying back. */
  borrowerId: string;
  amountMinor: number;
  currency: string;
  merchant?: string | null;
  category?: string | null;
  /** Opaque id the owner's phone made for the card; never the number. */
  cardRef?: string | null;
  method?: string | null;
  /** Who recorded the row; the other person confirms a repayment. */
  createdBy?: string | null;
  status: TxnStatus;
  requestedAt: string;
  otpSharedAt?: string | null;
  borrowerResult?: 'success' | 'failed' | null;
  lenderEvidence?: 'sms_match' | 'manual' | 'objected' | null;
  confirmedAt?: string | null;
};

export const OTP_TTL_MS = 3 * 60 * 1000;

const COUNTS: TxnStatus[] = ['confirmed', 'settled'];

/** Positive: the friend owes me. Negative: I owe the friend. */
export function netWith(txns: Txn[], me: string, friend: string): number {
  let net = 0;
  for (const t of txns) {
    if (!COUNTS.includes(t.status)) continue;
    const mine = t.lenderId === me && t.borrowerId === friend;
    const theirs = t.lenderId === friend && t.borrowerId === me;
    if (!mine && !theirs) continue;
    const sign = t.kind === 'card_payment' ? 1 : -1;
    net += (mine ? 1 : -1) * sign * t.amountMinor;
  }
  return net;
}

export function totals(txns: Txn[], me: string, friendIds: string[]) {
  let owedToMe = 0;
  let iOwe = 0;
  for (const f of friendIds) {
    const n = netWith(txns, me, f);
    if (n > 0) owedToMe += n;
    else iOwe -= n;
  }
  return { owedToMe, iOwe };
}

/** The other person in a transaction, from my side. */
export function counterparty(t: Txn, me: string): string {
  return t.lenderId === me ? t.borrowerId : t.lenderId;
}

/** From my side: money owed to me (lent), by me (owe), or a repayment (neutral). */
export function direction(t: Txn, me: string): 'lent' | 'owe' | 'neutral' {
  if (t.kind === 'repayment') return 'neutral';
  return t.lenderId === me ? 'lent' : 'owe';
}

/** An OTP request nobody answered within the window has expired. */
export function effectiveStatus(t: Txn, now = Date.now()): TxnStatus {
  if (
    t.kind === 'card_payment' &&
    t.status === 'pending' &&
    !t.otpSharedAt &&
    now - Date.parse(t.requestedAt) > OTP_TTL_MS
  ) {
    return 'expired';
  }
  return t.status;
}

/** What the card owner still has to do for this transaction, if anything. */
export function ownerTodo(t: Txn, me: string, now = Date.now()): 'share_otp' | 'confirm_charge' | null {
  if (t.lenderId !== me || t.kind !== 'card_payment') return null;
  if (effectiveStatus(t, now) !== 'pending') return null;
  if (!t.otpSharedAt) return 'share_otp';
  if (t.borrowerResult === 'success' && !t.lenderEvidence) return 'confirm_charge';
  return null;
}
