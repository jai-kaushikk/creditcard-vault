import { usePreventScreenCapture } from 'expo-screen-capture';
import { Alert, Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';

/** Blocks screenshots on Android while the screen is shown. Browsers can't, so it's a no-op there. */
export const usePreventCapture: (key: string) => void = isWeb ? () => {} : usePreventScreenCapture;

/** A yes/no question. React Native's Alert has no buttons on the web, so use the browser's dialog there. */
export function confirmAction(title: string, message: string, confirmLabel: string, destructive = false): Promise<boolean> {
  if (isWeb) return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function notify(title: string, message: string): void {
  if (isWeb) window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
