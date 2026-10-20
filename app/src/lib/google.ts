import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { config, googleConfigured } from './config';

// Native Google Sign-In (Android/iOS). The web build uses google.web.ts.

export type GoogleProfile = { id: string; email: string; name: string | null; photo: string | null };
export type GoogleResult = { idToken: string | null; profile: GoogleProfile } | 'cancelled';

if (googleConfigured) {
  GoogleSignin.configure({ webClientId: config.googleWebClientId });
}

export async function googleSignIn(): Promise<GoogleResult> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return 'cancelled';
    const { idToken, user } = res.data;
    return { idToken, profile: { id: user.id, email: user.email, name: user.name, photo: user.photo } };
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.IN_PROGRESS) return 'cancelled';
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play services are missing or out of date on this phone.');
      }
      if (e.code === 'DEVELOPER_ERROR' || e.code === '10') {
        throw new Error('Google rejected this app’s signing key. Register the APK’s SHA-1 in Google Cloud (see README).');
      }
    }
    throw e;
  }
}

export async function googleSignOut(): Promise<void> {
  if (googleConfigured) await GoogleSignin.signOut().catch(() => {});
}
