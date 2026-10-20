import { createHash, createHmac } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { jwtVerify, SignJWT } from 'jose';

export type GoogleIdentity = { sub: string; email: string; name?: string | null; picture?: string | null };
export type VerifyGoogle = (idToken: string) => Promise<GoogleIdentity>;

/** Checks a Google ID token was issued to our web client and the email is verified. */
export function googleVerifier(webClientId: string): VerifyGoogle {
  const client = new OAuth2Client();
  return async (idToken) => {
    const ticket = await client.verifyIdToken({ idToken, audience: webClientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || !p.email_verified) throw new Error('Google account email is not verified.');
    return { sub: p.sub, email: p.email, name: p.name ?? null, picture: p.picture ?? null };
  };
}

export function accountIdFor(googleSub: string, secret: string): string {
  return `usr_${createHmac('sha256', secret).update(`sub:${googleSub}`).digest('hex').slice(0, 16)}`;
}

export function emailHash(email: string, secret: string): string {
  return createHmac('sha256', secret).update(`email:${email.trim().toLowerCase()}`).digest('hex');
}

const key = (secret: string) => createHash('sha256').update(`jwt:${secret}`).digest();
const SESSION_DAYS = 30;

export async function issueSession(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setIssuer('cardvault')
    .sign(key(secret));
}

export async function readSession(token: string, secret: string): Promise<string> {
  const { payload } = await jwtVerify(token, key(secret), { issuer: 'cardvault', algorithms: ['HS256'] });
  if (!payload.sub) throw new Error('No subject');
  return payload.sub;
}
