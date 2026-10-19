import { BlurTargetView } from 'expo-blur';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useRef, type ComponentRef } from 'react';
import { View } from 'react-native';
import { TabBar } from '@/components/TabBar';
import { useAuth } from '@/state/auth';
import { useTheme } from '@/state/settings';

export default function TabsLayout() {
  const { status } = useAuth();
  const { c } = useTheme();
  const target = useRef<ComponentRef<typeof View> | null>(null);

  if (status === 'loading') return null;
  if (status === 'signedOut') return <Redirect href="/welcome" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {/* The tab bar sits outside the blur target so Android can blur what scrolls under it. */}
      <BlurTargetView ref={target} style={{ flex: 1, backgroundColor: c.surface }}>
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.surface } }}>
          <Tabs.Screen name="index" options={{ title: 'Vault' }} />
          <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
          <Tabs.Screen name="ledger" options={{ title: 'Ledger' }} />
          <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        </Tabs>
      </BlurTargetView>
      <TabBar blurTarget={target} />
    </View>
  );
}
