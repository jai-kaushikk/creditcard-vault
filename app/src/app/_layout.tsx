import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
import { SchibstedGrotesk_400Regular } from '@expo-google-fonts/schibsted-grotesk/400Regular';
import { SchibstedGrotesk_500Medium } from '@expo-google-fonts/schibsted-grotesk/500Medium';
import { SchibstedGrotesk_600SemiBold } from '@expo-google-fonts/schibsted-grotesk/600SemiBold';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LockScreen } from '@/components/LockScreen';
import { AuthProvider } from '@/state/auth';
import { DataProvider } from '@/state/data';
import { LockProvider, useLock } from '@/state/lock';
import { SettingsProvider, useSettings } from '@/state/settings';
import { VaultProvider } from '@/state/vault';

export default function RootLayout() {
  const [loaded] = useFonts({
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <AuthProvider>
          <LockProvider>
            <VaultProvider>
              <DataProvider>
                <Shell />
              </DataProvider>
            </VaultProvider>
          </LockProvider>
        </AuthProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { c, scheme, settings } = useSettings();
  const { locked } = useLock();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.surface).catch(() => {});
  }, [c.surface]);

  // Hide the vault from the app switcher (Android: FLAG_SECURE, which also blocks screenshots).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!settings.hideInSwitcher) {
      if (Platform.OS === 'ios') ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
      else ScreenCapture.allowScreenCaptureAsync('app').catch(() => {});
      return;
    }
    if (Platform.OS === 'ios') ScreenCapture.enableAppSwitcherProtectionAsync(0.9).catch(() => {});
    else ScreenCapture.preventScreenCaptureAsync('app').catch(() => {});
  }, [settings.hideInSwitcher]);

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.surface } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        <Stack.Screen name="otp/[id]" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
        <Stack.Screen name="settle/[friendId]" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} />
      </Stack>
      {locked ? <LockScreen /> : null}
    </View>
  );
}
