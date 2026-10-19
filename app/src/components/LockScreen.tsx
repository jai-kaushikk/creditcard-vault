import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLock } from '@/state/lock';
import { useTheme } from '@/state/settings';
import { Button } from './Button';
import { Glass } from './Glass';
import { Icon } from './Icon';
import { T } from './Text';

export function LockScreen() {
  const { c } = useTheme();
  const { unlock } = useLock();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    unlock().then((ok) => setFailed(!ok));
  }, [unlock]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: 24, paddingBottom: insets.bottom + 24 }]}>
      <Glass radius={64} style={{ marginBottom: 24 }}>
        <View style={{ width: 128, height: 128, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="faceId" size={56} color={c.vault} strokeWidth={1.5} />
        </View>
      </Glass>
      <T variant="display" style={{ textAlign: 'center' }}>Vault locked</T>
      <T variant="body" color="inkMuted" style={{ textAlign: 'center', marginTop: 8, marginBottom: 32 }}>
        {failed ? 'Unlock didn’t go through. Try again.' : 'Confirm it’s you to open CardVault.'}
      </T>
      <Button variant="primary" block label="Unlock" icon="lock" onPress={() => unlock().then((ok) => setFailed(!ok))} style={{ width: '100%' }} />
    </View>
  );
}
