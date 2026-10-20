import type { ExpoConfig } from 'expo/config';

// Values that differ per deployment come from the environment at build time
// (GitHub Actions passes repository variables through). See ../README.md.
const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID ?? '';
const iosUrlScheme = iosClientId
  ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
  : 'com.googleusercontent.apps.not-configured';

// Invite links (https://<server>/invite/<code>) open the app directly when it's installed.
const apiHost = (() => {
  try {
    return process.env.EXPO_PUBLIC_API_URL ? new URL(process.env.EXPO_PUBLIC_API_URL).host : null;
  } catch {
    return null;
  }
})();

const config: ExpoConfig = {
  name: 'CardVault',
  slug: 'cardvault',
  version: '0.1.0',
  scheme: 'cardvault',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#f6f4ef',
  ios: {
    bundleIdentifier: 'app.cardvault',
    supportsTablet: false,
    infoPlist: {
      NSFaceIDUsageDescription: 'CardVault uses Face ID to unlock your vault and reveal card numbers.',
    },
  },
  android: {
    package: 'app.cardvault',
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    adaptiveIcon: {
      backgroundColor: '#0f5c4a',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    allowBackup: false,
    permissions: ['android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT', 'android.permission.POST_NOTIFICATIONS'],
    intentFilters: apiHost
      ? [{
          action: 'VIEW',
          autoVerify: true,
          data: [{ scheme: 'https', host: apiHost, pathPrefix: '/invite/' }],
          category: ['BROWSABLE', 'DEFAULT'],
        }]
      : [],
  },
  web: {
    output: 'single',
    bundler: 'metro',
    favicon: './assets/favicon.png',
    name: 'CardVault',
    shortName: 'CardVault',
    themeColor: '#0f5c4a',
    backgroundColor: '#f6f4ef',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-local-authentication', { faceIDPermission: 'CardVault uses Face ID to unlock your vault and reveal card numbers.' }],
    ['@react-native-google-signin/google-signin', { iosUrlScheme }],
    // Local notifications only for now; server push (FCM / APNs) comes later.
    ['expo-notifications', { color: '#0f5c4a', enableRemoteNotifications: false }],
    './plugins/withAndroidBuild',
  ],
  experiments: {
    typedRoutes: false,
  },
};

export default config;
