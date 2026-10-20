import { useState } from 'react';
import { useAuth } from '@/state/auth';
import { Button } from './Button';

/** "Continue with Google" on Android/iOS. The web build uses GoogleButton.web.tsx. */
export function GoogleButton({ onError }: { onError: (message: string | null) => void }) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="primary"
      block
      icon="google"
      label="Continue with Google"
      busy={busy}
      onPress={async () => {
        onError(null);
        setBusy(true);
        try {
          await signInWithGoogle();
        } catch (e) {
          onError(e instanceof Error ? e.message : 'Sign-in failed. Try again.');
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
