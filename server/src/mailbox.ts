import { randomUUID } from 'node:crypto';

// Sealed messages between phones (card shares, OTPs). The server can't read
// them; each is deleted on delivery or when it expires. In production they sit
// in the relay_messages table (see pgStore.ts) so a scaled-to-zero or
// redeployed server doesn't lose them; this in-memory relay is for dev/tests.

export type Sealed = { epk: string; nonce: string; box: string };
export type MailKind = 'card_share' | 'card_unshare' | 'otp';
export type MailMessage = { id: string; from: string; to: string; kind: MailKind; txnId: string | null; payload: Sealed; sentAt: string; expiresAt: number };

export type OutgoingMail = { from: string; to: string; kind: MailKind; txnId?: string | null; payload: Sealed };

export interface Relay {
  send(msg: OutgoingMail): Promise<MailMessage>;
  /** Returns and removes everything waiting for this user. */
  drain(userId: string): Promise<MailMessage[]>;
}

export const TTL: Record<MailKind, number> = {
  otp: 5 * 60 * 1000,
  card_share: 24 * 60 * 60 * 1000,
  card_unshare: 7 * 24 * 60 * 60 * 1000,
};
const MAX_PER_INBOX = 200;

export class Mailbox implements Relay {
  private boxes = new Map<string, MailMessage[]>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async send(msg: OutgoingMail): Promise<MailMessage> {
    const t = this.now();
    const m: MailMessage = { id: randomUUID(), txnId: null, ...msg, sentAt: new Date(t).toISOString(), expiresAt: t + TTL[msg.kind] };
    const box = this.live(msg.to);
    box.push(m);
    if (box.length > MAX_PER_INBOX) box.splice(0, box.length - MAX_PER_INBOX);
    this.boxes.set(msg.to, box);
    return m;
  }

  async drain(userId: string): Promise<MailMessage[]> {
    const box = this.live(userId);
    this.boxes.delete(userId);
    return box;
  }

  private live(userId: string): MailMessage[] {
    const t = this.now();
    return (this.boxes.get(userId) ?? []).filter((m) => m.expiresAt > t);
  }
}
