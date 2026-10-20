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

const webDir = process.env.WEB_DIR ?? new URL('../web', import.meta.url).pathname;
// Until a release keystore exists, CI signs APKs with the standard React Native debug key.
const DEBUG_KEY_SHA256 = 'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C';
const androidCertSha256 = (process.env.ANDROID_CERT_SHA256 || DEBUG_KEY_SHA256).split(',').map((x) => x.trim()).filter(Boolean);
const app = buildApp({ store, mailbox, verifyGoogle: googleVerifier(webClientId), secret, logger: true, webDir, androidCertSha256 });
const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await store.close();
    process.exit(0);
  });
}
