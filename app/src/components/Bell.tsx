import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useData } from '@/state/data';
import { useTheme } from '@/state/settings';
import { fonts } from '@/theme/tokens';
import { Glass } from './Glass';
import { Icon } from './Icon';
import { T } from './Text';

/** Opens the notification list; shows how many are unread. */
export function Bell() {
  const { c } = useTheme();
  const { unread } = useData();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} new` : 'Notifications'}
      onPress={() => router.push('/notifications')}
      hitSlop={8}
    >
      <Glass>
        <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bell" size={20} color={c.ink} strokeWidth={1.8} />
        </View>
      </Glass>
      {unread ? (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: c.owe, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ color: '#fff', fontSize: 11, lineHeight: 14, fontFamily: fonts.bold }}>{unread > 9 ? '9+' : unread}</T>
        </View>
      ) : null}
    </Pressable>
  );
}
