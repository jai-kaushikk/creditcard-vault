import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, clearSession, loadSession } from '@/lib/api';
import { googleConfigured, serverConfigured } from '@/lib/config';
import { myPublicKey } from '@/lib/crypto';
import { googleSignIn, googleSignOut, type GoogleProfile } from '@/lib/google';
import { getJSON, remove, setJSON } from '@/lib/secure';

export type User = {
  id: string;
  email: string;
  name: string;
  photo?: string | null;
  mode: 'google' | 'offline';
};

type Ctx = {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
  /** Native: opens Google's sign-in sheet. */
  signInWithGoogle: () => Promise<'ok' | 'cancelled'>;
  /** Web: Google's own button hands us the ID token directly. */
  signInWithIdToken: (idToken: string, profile: GoogleProfile) => Promise<void>;
  continueOffline: () => Promise<void>;
  signOut: () => Promise<void>;
};

const KEY = 'cv.user.v1';
const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Ctx['status']>('loading');

  useEffect(() => {
    (async () => {
      await loadSession();
      const saved = await getJSON<User>(KEY);
      setUser(saved);
      setStatus(saved ? 'signedIn' : 'signedOut');
    })().catch(() => setStatus('signedOut'));
  }, []);

  const save = useCallback(async (u: User) => {
    await setJSON(KEY, u);
    setUser(u);
    setStatus('signedIn');
  }, []);

  const signInWithIdToken = useCallback(async (idToken: string | null, profile: GoogleProfile) => {
    let id = `g_${profile.id}`;
    if (serverConfigured) {
      if (!idToken) throw new Error('Google didn’t return an ID token. Check the web client ID.');
      const session = await api.signInWithGoogle(idToken, await myPublicKey());
      id = session.userId;
    }
    await save({ id, email: profile.email, name: profile.name ?? profile.email.split('@')[0], photo: profile.photo, mode: 'google' });
  }, [save]);

  const signInWithGoogle = useCallback(async () => {
    if (!googleConfigured) {
      throw new Error('Google sign-in isn’t set up in this build yet. Add GOOGLE_WEB_CLIENT_ID and rebuild.');
    }
    const res = await googleSignIn();
    if (res === 'cancelled') return 'cancelled' as const;
    await signInWithIdToken(res.idToken, res.profile);
    return 'ok' as const;
  }, [signInWithIdToken]);

  const continueOffline = useCallback(async () => {
    await save({ id: 'me', email: '', name: 'You', mode: 'offline' });
  }, [save]);

  const signOut = useCallback(async () => {
    if (user?.mode === 'google') await googleSignOut();
    await clearSession();
    await remove(KEY);
    setUser(null);
    setStatus('signedOut');
  }, [user]);

  const value = useMemo(
    () => ({ status, user, signInWithGoogle, signInWithIdToken, continueOffline, signOut }),
    [status, user, signInWithGoogle, signInWithIdToken, continueOffline, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
