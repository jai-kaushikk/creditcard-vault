import { buildApp } from './app.ts';
import { googleVerifier } from './auth.ts';
import type { Relay } from './mailbox.ts';
import { PgRelay, PgStore } from './pgStore.ts';
import { MemoryStore, type Store } from './store.ts';

const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Set ${name}.`);
  return v;
};

const webClientId = env('GOOGLE_WEB_CLIENT_ID');
const secret = env('SESSION_SECRET');
if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');

let store: Store;
let mailbox: Relay | undefined;
if (process.env.STORE === 'memory') {
  console.warn('STORE=memory: data is lost on restart. Use DATABASE_URL in production.');
  store = new MemoryStore();
} else {
  const pg = new PgStore(env('DATABASE_URL'));
  await pg.migrate();
  store = pg;
  mailbox = new PgRelay(pg);
}

const app = buildApp({ store, mailbox, verifyGoogle: googleVerifier(webClientId), secret, logger: true });
const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await store.close();
    process.exit(0);
  });
}
