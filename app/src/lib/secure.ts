import * as SecureStore from 'expo-secure-store';

// Everything sensitive lives in the iOS Keychain / Android Keystore-backed
// store, readable only on this device while it is unlocked.
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(key, OPTS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value), OPTS);
}

export async function remove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key, OPTS);
}
