import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from 'tweetnacl-util';
import { getJSON, setJSON } from './secure';

// Card shares and OTPs are encrypted on the sender's phone to the recipient's
// public key (X25519 + XSalsa20-Poly1305). The server only relays ciphertext.

nacl.setPRNG((out, n) => {
  out.set(Crypto.getRandomBytes(n));
});

const KEY = 'cv.keypair.v1';
type StoredKeys = { publicKey: string; secretKey: string };

let cached: nacl.BoxKeyPair | null = null;

export async function getKeyPair(): Promise<nacl.BoxKeyPair> {
  if (cached) return cached;
  const stored = await getJSON<StoredKeys>(KEY);
  if (stored) {
    cached = { publicKey: decodeBase64(stored.publicKey), secretKey: decodeBase64(stored.secretKey) };
    return cached;
  }
  const kp = nacl.box.keyPair();
  await setJSON(KEY, { publicKey: encodeBase64(kp.publicKey), secretKey: encodeBase64(kp.secretKey) });
  cached = kp;
  return kp;
}

export async function myPublicKey(): Promise<string> {
  return encodeBase64((await getKeyPair()).publicKey);
}

/** A sealed message: only the holder of the recipient's secret key can open it. */
export type Sealed = { epk: string; nonce: string; box: string };

export function seal(recipientPublicKey: string, payload: unknown): Sealed {
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(decodeUTF8(JSON.stringify(payload)), nonce, decodeBase64(recipientPublicKey), eph.secretKey);
  return { epk: encodeBase64(eph.publicKey), nonce: encodeBase64(nonce), box: encodeBase64(box) };
}

export async function open<T>(sealed: Sealed): Promise<T | null> {
  const { secretKey } = await getKeyPair();
  const plain = nacl.box.open(decodeBase64(sealed.box), decodeBase64(sealed.nonce), decodeBase64(sealed.epk), secretKey);
  if (!plain) return null;
  try {
    return JSON.parse(encodeUTF8(plain)) as T;
  } catch {
    return null;
  }
}

export function randomId(prefix: string): string {
  return `${prefix}_${Crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
