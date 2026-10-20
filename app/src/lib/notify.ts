import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { AppState, Platform } from 'react-native';

// System notifications for things that need you (an OTP request, a friend
// request). They're local: the app raises them when its sync sees something
// new, which works while the app is open or recently backgrounded. Server push
// (FCM) is a later step. The web version uses notify.web.ts.

Notifications.setNotificationHandler({
  // While the app is in front, the in-app banner shows it instead.
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

let ready: Promise<boolean> | null = null;

/** Asks once for permission (Android 13+ and iOS) and sets up the channel. */
export function enableSystemNotifications(): Promise<boolean> {
  ready ??= (async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('activity', {
        name: 'OTP and friend requests',
        importance: AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  })().catch(() => false);
  return ready;
}

export async function systemNotify(n: { title: string; body: string; href?: string }) {
  if (AppState.currentState === 'active') return;
  if (!(await enableSystemNotifications())) return;
  await Notifications.scheduleNotificationAsync({
    content: { title: n.title, body: n.body, data: { href: n.href } },
    trigger: Platform.OS === 'android' ? { channelId: 'activity' } : null,
  }).catch(() => {});
}

/** Tapping a notification opens the screen it's about. Returns an unsubscribe. */
export function onNotificationTap(): () => void {
  const open = (r: Notifications.NotificationResponse | null) => {
    const href = r?.notification.request.content.data?.href;
    if (typeof href === 'string') router.push(href as never);
  };
  open(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
