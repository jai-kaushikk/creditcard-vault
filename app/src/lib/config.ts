// Inlined at build time from EXPO_PUBLIC_* environment variables.
export const config = {
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
};

export const googleConfigured = config.googleWebClientId.length > 0;
export const serverConfigured = config.apiUrl.length > 0;
