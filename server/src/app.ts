import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { accountIdFor, emailHash, issueSession, readSession, type VerifyGoogle } from './auth.ts';
import { Mailbox, type Sealed } from './mailbox.ts';
import * as rules from './rules.ts';
import type { Store } from './store.ts';

export type Deps = {
  store: Store;
  mailbox?: Mailbox;
  verifyGoogle: VerifyGoogle;
  /** Signs sessions and keys the email/subject hashes. Keep it secret and stable. */
  secret: string;
  now?: () => number;
  logger?: boolean;
};

const sealedSchema = {
  type: 'object',
  required: ['epk', 'nonce', 'box'],
  additionalProperties: false,
  properties: {
    epk: { type: 'string', maxLength: 64 },
    nonce: { type: 'string', maxLength: 64 },
    box: { type: 'string', maxLength: 8192 },
  },
} as const;
const id = { type: 'string', minLength: 1, maxLength: 64 } as const;
const amount = { type: 'integer', minimum: 1, maximum: rules.MAX_AMOUNT_MINOR } as const;
const currency = { type: 'string', pattern: '^[A-Z]{3}$' } as const;

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export function buildApp(deps: Deps) {
  const { store, verifyGoogle, secret } = deps;
  const mailbox = deps.mailbox ?? new Mailbox(deps.now);
  const now = deps.now ?? Date.now;
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 32 * 1024 });

  app.decorateRequest('userId', '');

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, _req, reply) => {
    if (err instanceof rules.RuleError) return reply.code(err.status).send({ error: err.message });
    if (err.validation) return reply.code(400).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on our side.' });
  });

  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      req.userId = await readSession(token, secret);
    } catch {
      return reply.code(401).send({ error: 'Sign in again.' });
    }
    const account = await store.accountById(req.userId);
    if (!account) return reply.code(401).send({ error: 'Sign in again.' });
    if (account.status !== 'active') return reply.code(403).send({ error: 'This account is suspended.' });
  };

  /** Reads a transaction the caller is part of, applying time-based rules. */
  const loadTxn = async (txnId: string, userId: string) => {
    const t = await store.txnById(txnId);
    if (!t || (t.lenderId !== userId && t.borrowerId !== userId)) throw new rules.RuleError(404, 'No such transaction.');
    const settled = rules.settle(t, now());
    if (settled.status !== t.status) {
      await store.updateTxn(settled);
      await store.addEvent({ txnId: t.id, actor: 'system', type: settled.status, at: new Date(now()).toISOString() });
    }
    return settled;
  };

  const save = async (before: rules.Txn, after: rules.Txn, actor: string, type: string) => {
    const saved = await store.updateTxn(after);
    await store.addEvent({ txnId: after.id, actor, type, at: new Date(now()).toISOString() });
    if (after.status !== before.status) {
      await store.addEvent({ txnId: after.id, actor: 'system', type: after.status, at: new Date(now()).toISOString() });
    }
    return saved;
  };

  app.get('/health', async () => ({ ok: true }));

  app.post<{ Body: { idToken: string; publicKey: string } }>('/v1/auth/google', {
    schema: {
      body: {
        type: 'object',
        required: ['idToken', 'publicKey'],
        properties: { idToken: { type: 'string', maxLength: 4096 }, publicKey: { type: 'string', minLength: 40, maxLength: 64 } },
      },
    },
  }, async (req, reply) => {
    let identity;
    try {
      identity = await verifyGoogle(req.body.idToken);
    } catch {
      return reply.code(401).send({ error: 'Google sign-in could not be verified.' });
    }
    const userId = accountIdFor(identity.sub, secret);
    await store.upsertAccount({ id: userId, emailHash: emailHash(identity.email, secret), publicKey: req.body.publicKey });
    return { token: await issueSession(userId, secret), userId };
  });

  app.register(async (priv) => {
    priv.addHook('preHandler', auth);

    priv.get<{ Querystring: { email: string } }>('/v1/users/lookup', {
      schema: { querystring: { type: 'object', required: ['email'], properties: { email: { type: 'string', maxLength: 320 } } } },
    }, async (req, reply) => {
      const a = await store.accountByEmailHash(emailHash(req.query.email, secret));
      if (!a || a.status !== 'active') return reply.code(404).send({ error: 'Not found' });
      return { id: a.id, publicKey: a.publicKey };
    });

    priv.get<{ Params: { id: string } }>('/v1/users/:id', async (req, reply) => {
      const a = await store.accountById(req.params.id);
      if (!a) return reply.code(404).send({ error: 'Not found' });
      return { id: a.id, publicKey: a.publicKey };
    });

    priv.get('/v1/transactions', async (req) => {
      const rows = await store.txnsFor(req.userId);
      const out = [];
      for (const t of rows) {
        const s = rules.settle(t, now());
        if (s.status !== t.status) await store.updateTxn(s);
        out.push(s);
      }
      return { transactions: out };
    });

    priv.post<{ Body: { lenderId: string; amountMinor: number; currency: string; merchant: string; cardRef: string; idempotencyKey: string } }>(
      '/v1/transactions',
      {
        schema: {
          body: {
            type: 'object',
            required: ['lenderId', 'amountMinor', 'currency', 'merchant', 'cardRef', 'idempotencyKey'],
            properties: { lenderId: id, amountMinor: amount, currency, merchant: { type: 'string', minLength: 1, maxLength: 80 }, cardRef: id, idempotencyKey: id },
          },
        },
      },
      async (req, reply) => {
        const b = req.body;
        const existing = await store.txnByIdempotencyKey(b.idempotencyKey);
        if (existing) {
          if (existing.borrowerId !== req.userId) throw new rules.RuleError(409, 'Duplicate request.');
          return existing;
        }
        if (b.lenderId === req.userId) throw new rules.RuleError(400, 'You can’t request an OTP from yourself.');
        const lender = await store.accountById(b.lenderId);
        if (!lender || lender.status !== 'active') throw new rules.RuleError(404, 'That card’s owner isn’t on CardVault.');
        const hourAgo = new Date(now() - 60 * 60 * 1000).toISOString();
        if ((await store.countRecentRequests(b.lenderId, hourAgo)) >= rules.MAX_REQUESTS_PER_LENDER_PER_HOUR) {
          throw new rules.RuleError(429, 'Too many OTP requests for this card owner right now. Try again later.');
        }
        const t: rules.Txn = {
          id: `txn_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          kind: 'card_payment',
          lenderId: b.lenderId,
          borrowerId: req.userId,
          amountMinor: b.amountMinor,
          currency: b.currency,
          merchant: b.merchant.trim(),
          category: null,
          cardRef: b.cardRef,
          method: null,
          createdBy: req.userId,
          status: 'pending',
          requestedAt: new Date(now()).toISOString(),
          otpSharedAt: null,
          borrowerResult: null,
          lenderEvidence: null,
          confirmedAt: null,
          idempotencyKey: b.idempotencyKey,
        };
        const saved = await store.insertTxn(t);
        await store.addEvent({ txnId: t.id, actor: req.userId, type: 'requested', at: t.requestedAt });
        return reply.code(201).send(saved);
      },
    );

    priv.post<{ Params: { id: string }; Body: { payload: Sealed } }>('/v1/transactions/:id/otp', {
      schema: { body: { type: 'object', required: ['payload'], properties: { payload: sealedSchema } } },
    }, async (req) => {
      const t = await loadTxn(req.params.id, req.userId);
      const next = rules.shareOtp(t, req.userId, now());
      mailbox.send({ from: req.userId, to: t.borrowerId, kind: 'otp', txnId: t.id, payload: req.body.payload });
      return save(t, next, req.userId, 'otp_shared');
    });

    priv.post<{ Params: { id: string } }>('/v1/transactions/:id/decline', async (req) => {
      const t = await loadTxn(req.params.id, req.userId);
      return save(t, rules.decline(t, req.userId), req.userId, 'declined');
    });

    priv.post<{ Params: { id: string }; Body: { outcome: 'success' | 'failed' } }>('/v1/transactions/:id/result', {
      schema: { body: { type: 'object', required: ['outcome'], properties: { outcome: { enum: ['success', 'failed'] } } } },
    }, async (req) => {
      const t = await loadTxn(req.params.id, req.userId);
      return save(t, rules.borrowerResult(t, req.userId, req.body.outcome, now()), req.userId, `result_${req.body.outcome}`);
    });

    priv.post<{ Params: { id: string }; Body: { evidence: 'sms_match' | 'manual' | 'objected' } }>('/v1/transactions/:id/evidence', {
      schema: { body: { type: 'object', required: ['evidence'], properties: { evidence: { enum: ['sms_match', 'manual', 'objected'] } } } },
    }, async (req) => {
      const t = await loadTxn(req.params.id, req.userId);
      return save(t, rules.lenderEvidence(t, req.userId, req.body.evidence, now()), req.userId, `evidence_${req.body.evidence}`);
    });

    priv.post<{ Params: { id: string }; Body: { reason?: string } }>('/v1/transactions/:id/dispute', {
      schema: { body: { type: 'object', properties: { reason: { type: 'string', maxLength: 500 } } } },
    }, async (req) => {
      const t = await loadTxn(req.params.id, req.userId);
      return save(t, rules.dispute(t, req.userId), req.userId, 'disputed_by_user');
    });

    priv.post<{ Body: { counterpartyId: string; role: 'payer' | 'payee'; amountMinor: number; currency: string; method: string; idempotencyKey: string } }>(
      '/v1/repayments',
      {
        schema: {
          body: {
            type: 'object',
            required: ['counterpartyId', 'role', 'amountMinor', 'currency', 'method', 'idempotencyKey'],
            properties: { counterpartyId: id, role: { enum: ['payer', 'payee'] }, amountMinor: amount, currency, method: { type: 'string', maxLength: 40 }, idempotencyKey: id },
          },
        },
      },
      async (req, reply) => {
        const b = req.body;
        const existing = await store.txnByIdempotencyKey(b.idempotencyKey);
        if (existing) return existing;
        if (b.counterpartyId === req.userId) throw new rules.RuleError(400, 'You can’t repay yourself.');
        if (!(await store.accountById(b.counterpartyId))) throw new rules.RuleError(404, 'No such friend.');
        const iAmPaid = b.role === 'payee';
        const t: rules.Txn = {
          id: `txn_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          kind: 'repayment',
          lenderId: iAmPaid ? req.userId : b.counterpartyId,
          borrowerId: iAmPaid ? b.counterpartyId : req.userId,
          amountMinor: b.amountMinor,
          currency: b.currency,
          merchant: null,
          category: null,
          cardRef: null,
          method: b.method,
          createdBy: req.userId,
          status: 'pending',
          requestedAt: new Date(now()).toISOString(),
          otpSharedAt: null,
          borrowerResult: null,
          lenderEvidence: null,
          confirmedAt: null,
          idempotencyKey: b.idempotencyKey,
        };
        const saved = await store.insertTxn(t);
        await store.addEvent({ txnId: t.id, actor: req.userId, type: 'repayment_recorded', at: t.requestedAt });
        return reply.code(201).send(saved);
      },
    );

    priv.post<{ Params: { id: string } }>('/v1/repayments/:id/confirm', async (req) => {
      const t = await loadTxn(req.params.id, req.userId);
      return save(t, rules.confirmRepayment(t, req.userId, now()), req.userId, 'repayment_confirmed');
    });

    priv.post<{ Body: { to: string; kind: 'card_share' | 'card_unshare'; payload: Sealed } }>('/v1/mailbox', {
      schema: {
        body: {
          type: 'object',
          required: ['to', 'kind', 'payload'],
          properties: { to: id, kind: { enum: ['card_share', 'card_unshare'] }, payload: sealedSchema },
        },
      },
    }, async (req, reply) => {
      if (req.body.to === req.userId) throw new rules.RuleError(400, 'That’s you.');
      if (!(await store.accountById(req.body.to))) throw new rules.RuleError(404, 'No such friend.');
      const m = mailbox.send({ from: req.userId, ...req.body });
      return reply.code(201).send({ id: m.id });
    });

    priv.get('/v1/mailbox', async (req) => ({
      messages: mailbox.drain(req.userId).map(({ id, from, kind, txnId, payload, sentAt }) => ({ id, from, kind, txnId, payload, sentAt })),
    }));
  });

  return app;
}
