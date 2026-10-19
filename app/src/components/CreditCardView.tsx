import { View } from 'react-native';
import { formatCardNumber, maskedNumber, NETWORK_LABEL, type Network } from '@/lib/cardNumber';
import { useTheme } from '@/state/settings';
import { cardFaces, cardTag, onCard, onCardMuted, radius, type CardFace } from '@/theme/tokens';
import { T } from './Text';

export function CreditCardView({
  nickname,
  network,
  number,
  expiry,
  holder,
  face,
  revealed,
  tag,
  width = 320,
}: {
  nickname: string;
  network: Network;
  number: string;
  expiry?: string;
  holder?: string;
  face: CardFace;
  revealed?: boolean;
  tag?: string | null;
  width?: number;
}) {
  const { scheme } = useTheme();
  const scale = width / 320;
  const last4 = number.slice(-4);
  return (
    <View
      accessible
      accessibilityLabel={`${nickname}, ${NETWORK_LABEL[network]} ending ${last4}${tag ? `, ${tag}` : ''}`}
      style={{
        width,
        aspectRatio: 1.586,
        borderRadius: radius.md,
        backgroundColor: cardFaces[face],
        padding: 24 * scale,
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOpacity: scheme === 'dark' ? 0.5 : 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <T variant="label" color={onCard} numberOfLines={1} style={{ flexShrink: 1 }}>{nickname}</T>
        {tag ? (
          <View style={{ backgroundColor: cardTag, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <T variant="caption" color={onCard} style={{ fontFamily: 'SchibstedGrotesk_600SemiBold' }}>{tag}</T>
          </View>
        ) : null}
      </View>
      <View style={{ width: 40 * scale, height: 30 * scale, borderRadius: radius.sm, backgroundColor: '#c8952c' }} />
      <T variant="cardNumber" color={onCard} style={{ fontSize: 18 * scale, lineHeight: 24 * scale }} numberOfLines={1}>
        {revealed ? formatCardNumber(number) : maskedNumber(last4)}
      </T>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {holder ? (
            <View>
              <T variant="caption" color={onCardMuted} style={{ fontSize: 10, letterSpacing: 0.6 }}>CARD HOLDER</T>
              <T variant="label" color={onCard} numberOfLines={1}>{holder}</T>
            </View>
          ) : null}
          {expiry ? (
            <View>
              <T variant="caption" color={onCardMuted} style={{ fontSize: 10, letterSpacing: 0.6 }}>VALID THRU</T>
              <T variant="label" color={onCard}>{expiry}</T>
            </View>
          ) : null}
        </View>
        <T variant="headline" color={onCard} style={{ fontFamily: 'SchibstedGrotesk_700Bold', letterSpacing: 1, fontSize: 15 }}>
          {NETWORK_LABEL[network].toUpperCase()}
        </T>
      </View>
    </View>
  );
}
