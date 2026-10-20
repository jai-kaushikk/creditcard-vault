// Browser version of secure.ts. There is no OS keystore on the web, so values
// are encrypted with AES-GCM under a key that is generated in this browser,
// kept in IndexedDB and marked non-extractable: page scripts can use it but
// can't read it out. The ciphertext lives in localStorage. This keeps data
// unreadable at rest; it can't protect against someone using this browser
// profile, which is why the web version is for your own device only.

const DB = 'cardvault';
const STORE = 'keys';
const KEY_ID = 'vault-key-v1';
const PREFIX = 'cv.enc.';

let keyPromise: Promise<CryptoKey> | null = null;

function idb<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

function vaultKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const existing = await idb<CryptoKey | undefined>('readonly', (s) => s.get(KEY_ID));
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await idb('readwrite', (s) => s.put(key, KEY_ID));
    return key;
  })();
  return keyPromise;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = localStorage.getItem(PREFIX + key);
  if (!raw) return null;
  try {
    const [iv, data] = raw.split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await vaultKey(), unb64(data));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultKey(), new TextEncoder().encode(JSON.stringify(value))),
  );
  localStorage.setItem(PREFIX + key, `${b64(iv)}.${b64(data)}`);
}

export async function remove(key: string): Promise<void> {
  localStorage.removeItem(PREFIX + key);
}
