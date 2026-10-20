import { Platform } from 'react-native';

// Inlined at build time from EXPO_PUBLIC_* environment variables. The web
// build is served by the API server itself, so it defaults to its own origin.
const builtInApi = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const config = {
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  apiUrl: builtInApi || (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : ''),
};

export const googleConfigured = config.googleWebClientId.length > 0;
export const serverConfigured = config.apiUrl.length > 0;
