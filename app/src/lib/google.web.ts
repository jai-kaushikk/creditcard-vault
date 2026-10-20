import { config } from './config';

// Web Google sign-in uses Google Identity Services: Google renders its own
// button (see components/GoogleButton.web.tsx) and hands back an ID token.

export type GoogleProfile = { id: string; email: string; name: string | null; photo: string | null };
export type GoogleResult = { idToken: string | null; profile: GoogleProfile } | 'cancelled';

type Gis = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; use_fedcm_for_prompt?: boolean }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
      disableAutoSelect: () => void;
    };
  };
};
declare global {
  interface Window {
    google?: Gis;
  }
}

let loading: Promise<Gis> | null = null;

export function loadGis(): Promise<Gis> {
  loading ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google sign-in didn’t load.')));
    s.onerror = () => reject(new Error('Google sign-in didn’t load. Check your connection.'));
    document.head.appendChild(s);
  });
  return loading;
}

/** Reads the profile out of a Google ID token (display only; the server verifies the token). */
export function profileFromIdToken(idToken: string): GoogleProfile {
  const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')), (c) => c.charCodeAt(0));
  const json = JSON.parse(new TextDecoder().decode(bytes));
  return { id: String(json.sub), email: String(json.email), name: json.name ?? null, photo: json.picture ?? null };
}

export const webClientId = config.googleWebClientId;

export async function googleSignIn(): Promise<GoogleResult> {
  throw new Error('On the web, sign in with the Google button.');
}

export async function googleSignOut(): Promise<void> {
  window.google?.accounts.id.disableAutoSelect();
}
