import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';

// Serves the exported web app (app/dist, copied to server/web at build time)
// from the same origin as the API, so the browser needs no CORS and the app
// can use window.location.origin as its API URL.

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

// Google Identity Services needs its script, styles, iframe and endpoints.
const GSI = 'https://accounts.google.com/gsi/';
export const CSP = [
  "default-src 'self'",
  `script-src 'self' ${GSI}client`,
  // react-native-web writes component styles into <style> tags at runtime.
  `style-src 'self' 'unsafe-inline' ${GSI}style`,
  `frame-src ${GSI}`,
  `connect-src 'self' ${GSI}`,
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Hashed build output can be cached forever; everything else is revalidated. */
const immutable = (path: string) => path.startsWith('/_expo/static/') || path.startsWith('/assets/');

export function registerWeb(app: FastifyInstance, dir: string) {
  const root = resolve(dir);
  const index = resolve(root, 'index.html');
  if (!existsSync(index)) {
    app.log.info(`No web build in ${root}; serving the API only.`);
    return false;
  }

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('strict-transport-security', 'max-age=31536000');
  });

  const sendFile = async (reply: FastifyReply, file: string, path: string) => {
    const body = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    reply.header('content-type', type);
    reply.header('cache-control', immutable(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (type.startsWith('text/html')) {
      reply.header('content-security-policy', CSP);
      // The Google sign-in popup has to be able to talk back to this window.
      reply.header('cross-origin-opener-policy', 'same-origin-allow-popups');
      reply.header('x-frame-options', 'DENY');
    }
    return reply.send(body);
  };

  app.setNotFoundHandler(async (req, reply) => {
    const path = req.url.split('?')[0];
    if ((req.method !== 'GET' && req.method !== 'HEAD') || path.startsWith('/v1/') || path === '/v1') {
      return reply.code(404).send({ error: 'Not found' });
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return reply.code(400).send({ error: 'Bad path' });
    }
    if (decoded.includes('\0')) return reply.code(400).send({ error: 'Bad path' });
    const file = resolve(root, `.${decoded}`);
    if (file !== root && !file.startsWith(root + sep)) return reply.code(404).send({ error: 'Not found' });

    const info = await stat(file).catch(() => null);
    if (info?.isFile()) return sendFile(reply, file, decoded);
    // A missing file is a 404; anything else is a client-side route.
    if (extname(decoded)) return reply.code(404).send({ error: 'Not found' });
    return sendFile(reply, index, '/index.html');
  });
  return true;
}
