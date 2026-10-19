import type { ExpoConfig } from 'expo/config';

// Values that differ per deployment come from the environment at build time
// (GitHub Actions passes repository variables through). See ../README.md.
const iosClientId = process.env.GOOGLE_IOS_CLIENT_ID ?? '';
const iosUrlScheme = iosClientId
  ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
  : 'com.googleusercontent.apps.not-configured';

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
    permissions: ['android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT'],
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    ['expo-local-authentication', { faceIDPermission: 'CardVault uses Face ID to unlock your vault and reveal card numbers.' }],
    ['@react-native-google-signin/google-signin', { iosUrlScheme }],
    './plugins/withAndroidBuild',
  ],
  experiments: {
    typedRoutes: false,
  },
};

export default config;
