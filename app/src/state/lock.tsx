import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './auth';
import { useSettings } from './settings';

type Ctx = {
  locked: boolean;
  unlock: () => Promise<boolean>;
  /** Fresh biometric check before revealing a card number or sharing. */
  confirm: (reason: string) => Promise<boolean>;
};

const LockContext = createContext<Ctx | null>(null);

async function authenticate(promptMessage: string): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  // A phone with no screen lock at all: there is nothing to check against.
  if (level === LocalAuthentication.SecurityLevel.NONE) return true;
  const res = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
  return res.success;
}

export function LockProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { settings, ready } = useSettings();
  // Until settings load we don't know whether the lock is on; stay locked.
  const [locked, setLocked] = useState(true);
  const backgroundAt = useRef<number | null>(null);
  const enabled = settings.biometricLock;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && backgroundAt.current) {
        const away = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (enabled && away > settings.lockAfterSeconds * 1000) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled, settings.lockAfterSeconds]);

  const unlock = useCallback(async () => {
    const ok = await authenticate('Unlock CardVault');
    if (ok) setLocked(false);
    return ok;
  }, []);

  const confirm = useCallback(async (reason: string) => {
    if (!enabled) return true;
    return authenticate(reason);
  }, [enabled]);

  const value = useMemo(
    () => ({ locked: (!ready || enabled) && status === 'signedIn' && locked, unlock, confirm }),
    [ready, enabled, status, locked, unlock, confirm],
  );
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error('useLock outside LockProvider');
  return ctx;
}
