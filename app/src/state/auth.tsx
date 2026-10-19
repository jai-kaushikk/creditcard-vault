import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, clearSession, loadSession } from '@/lib/api';
import { config, googleConfigured, serverConfigured } from '@/lib/config';
import { myPublicKey } from '@/lib/crypto';
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
  signInWithGoogle: () => Promise<'ok' | 'cancelled'>;
  continueOffline: () => Promise<void>;
  signOut: () => Promise<void>;
};

const KEY = 'cv.user.v1';
const AuthContext = createContext<Ctx | null>(null);

if (googleConfigured) {
  GoogleSignin.configure({ webClientId: config.googleWebClientId });
}

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

  const signInWithGoogle = useCallback(async () => {
    if (!googleConfigured) {
      throw new Error('Google sign-in isn’t set up in this build yet. Add GOOGLE_WEB_CLIENT_ID and rebuild.');
    }
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (!isSuccessResponse(res)) return 'cancelled' as const;
      const { idToken, user: g } = res.data;
      let id = `g_${g.id}`;
      if (serverConfigured) {
        if (!idToken) throw new Error('Google didn’t return an ID token. Check the web client ID.');
        const session = await api.signInWithGoogle(idToken, await myPublicKey());
        id = session.userId;
      }
      await save({ id, email: g.email, name: g.name ?? g.email.split('@')[0], photo: g.photo, mode: 'google' });
      return 'ok' as const;
    } catch (e) {
      if (isErrorWithCode(e)) {
        if (e.code === statusCodes.IN_PROGRESS) return 'cancelled' as const;
        if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          throw new Error('Google Play services are missing or out of date on this phone.');
        }
        if (e.code === 'DEVELOPER_ERROR' || e.code === '10') {
          throw new Error('Google rejected this app’s signing key. Register the APK’s SHA-1 in Google Cloud (see README).');
        }
      }
      throw e;
    }
  }, [save]);

  const continueOffline = useCallback(async () => {
    await save({ id: 'me', email: '', name: 'You', mode: 'offline' });
  }, [save]);

  const signOut = useCallback(async () => {
    if (user?.mode === 'google' && googleConfigured) {
      await GoogleSignin.signOut().catch(() => {});
    }
    await clearSession();
    await remove(KEY);
    setUser(null);
    setStatus('signedOut');
  }, [user]);

  const value = useMemo(
    () => ({ status, user, signInWithGoogle, continueOffline, signOut }),
    [status, user, signInWithGoogle, continueOffline, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
