import { router } from 'expo-router';

// Browser notifications while a CardVault tab is open in the background.

export async function enableSystemNotifications(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export async function systemNotify(n: { title: string; body: string; href?: string }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  const note = new Notification(n.title, { body: n.body, icon: '/favicon.ico', tag: n.href });
  note.onclick = () => {
    window.focus();
    if (n.href) router.push(n.href as never);
    note.close();
  };
}

export function onNotificationTap(): () => void {
  return () => {};
}
