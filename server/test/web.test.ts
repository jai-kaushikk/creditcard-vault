import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/app.ts';
import { MemoryStore } from '../src/store.ts';

test('serves the web app next to the API', async (t) => {
  const base = await mkdtemp(join(tmpdir(), 'cv-web-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const dir = join(base, 'web');
  await mkdir(dir);
  await writeFile(join(base, 'cv-secret.txt'), 'outside');
  await writeFile(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  await mkdir(join(dir, '_expo/static/js/web'), { recursive: true });
  await writeFile(join(dir, '_expo/static/js/web/[id]-abc.js'), 'console.log(1)');

  const app = buildApp({
    store: new MemoryStore(),
    secret: 'test-secret-that-is-at-least-32-characters-long',
    verifyGoogle: async () => { throw new Error('unused'); },
    webDir: dir,
  });

  const home = await app.inject({ method: 'GET', url: '/' });
  assert.equal(home.statusCode, 200);
  assert.match(home.headers['content-type'] as string, /text\/html/);
  assert.match(home.headers['content-security-policy'] as string, /frame-ancestors 'none'/);
  assert.equal(home.headers['cache-control'], 'no-cache');

  // Client-side routes fall back to index.html.
  const route = await app.inject({ method: 'GET', url: '/card/abc?x=1' });
  assert.equal(route.statusCode, 200);
  assert.equal(route.body, home.body);

  const js = await app.inject({ method: 'GET', url: '/_expo/static/js/web/%5Bid%5D-abc.js' });
  assert.equal(js.statusCode, 200);
  assert.match(js.headers['content-type'] as string, /javascript/);
  assert.match(js.headers['cache-control'] as string, /immutable/);

  assert.equal((await app.inject({ method: 'GET', url: '/missing.js' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/..%2fcv-secret.txt' })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: '/%2e%2e/cv-secret.txt' })).statusCode, 404);

  // The API keeps its JSON 404s and auth.
  const api = await app.inject({ method: 'GET', url: '/v1/nope' });
  assert.equal(api.statusCode, 404);
  assert.deepEqual(api.json(), { error: 'Not found' });
  assert.equal((await app.inject({ method: 'GET', url: '/v1/transactions' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/health' })).json().ok, true);
});
