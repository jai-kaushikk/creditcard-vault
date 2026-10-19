import { randomUUID } from 'node:crypto';

// Sealed messages between phones (card shares, OTPs). Held in memory only,
// never written to the database, deleted on delivery or when they expire.
// One server instance: if you run several, put this in Redis instead.

export type Sealed = { epk: string; nonce: string; box: string };
export type MailKind = 'card_share' | 'card_unshare' | 'otp';
export type MailMessage = { id: string; from: string; to: string; kind: MailKind; txnId: string | null; payload: Sealed; sentAt: string; expiresAt: number };

const TTL: Record<MailKind, number> = {
  otp: 5 * 60 * 1000,
  card_share: 24 * 60 * 60 * 1000,
  card_unshare: 7 * 24 * 60 * 60 * 1000,
};
const MAX_PER_INBOX = 200;

export class Mailbox {
  private boxes = new Map<string, MailMessage[]>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  send(msg: { from: string; to: string; kind: MailKind; txnId?: string | null; payload: Sealed }): MailMessage {
    const t = this.now();
    const m: MailMessage = { id: randomUUID(), txnId: null, ...msg, sentAt: new Date(t).toISOString(), expiresAt: t + TTL[msg.kind] };
    const box = this.live(msg.to);
    box.push(m);
    if (box.length > MAX_PER_INBOX) box.splice(0, box.length - MAX_PER_INBOX);
    this.boxes.set(msg.to, box);
    return m;
  }

  /** Returns and removes everything waiting for this user. */
  drain(userId: string): MailMessage[] {
    const box = this.live(userId);
    this.boxes.delete(userId);
    return box;
  }

  private live(userId: string): MailMessage[] {
    const t = this.now();
    return (this.boxes.get(userId) ?? []).filter((m) => m.expiresAt > t);
  }
}
