import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { loadGis, profileFromIdToken, webClientId } from '@/lib/google.web';
import { useAuth } from '@/state/auth';
import { useTheme } from '@/state/settings';

/** Google's own "Sign in with Google" button (Google Identity Services). */
export function GoogleButton({ onError }: { onError: (message: string | null) => void }) {
  const { signInWithIdToken } = useAuth();
  const { scheme, c } = useTheme();
  const host = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!webClientId) {
      onError('Google sign-in isn’t set up in this build yet.');
      return;
    }
    loadGis()
      .then((g) => {
        if (cancelled || !host.current) return;
        g.accounts.id.initialize({
          client_id: webClientId,
          use_fedcm_for_prompt: true,
          callback: async ({ credential }) => {
            onError(null);
            setBusy(true);
            try {
              await signInWithIdToken(credential, profileFromIdToken(credential));
            } catch (e) {
              onError(e instanceof Error ? e.message : 'Sign-in failed. Try again.');
            } finally {
              setBusy(false);
            }
          },
        });
        g.accounts.id.renderButton(host.current, {
          type: 'standard',
          theme: scheme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          logo_alignment: 'left',
          width: Math.min(host.current.clientWidth || 360, 400),
        });
      })
      .catch((e: Error) => onError(e.message));
    return () => {
      cancelled = true;
    };
  }, [onError, scheme, signInWithIdToken]);

  return (
    <View style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
      {/* Keep Google's button mounted; it's rendered once into this div. */}
      <div ref={host} style={{ width: '100%', display: 'flex', justifyContent: 'center', visibility: busy ? 'hidden' : 'visible' }} />
      {busy ? <ActivityIndicator color={c.vault} style={{ position: 'absolute' }} /> : null}
    </View>
  );
}
