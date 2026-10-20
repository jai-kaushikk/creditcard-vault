import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/state/settings';
import { fonts, radius } from '@/theme/tokens';
import { CardNfc, type ChipCard } from '../../modules/card-nfc';
import { Button } from './Button';
import { Icon } from './Icon';
import { T } from './Text';

/** Tap-to-add works on Android phones with NFC. */
export const canTapCards = CardNfc != null && CardNfc.isSupported();

type State = { kind: 'waiting' } | { kind: 'off' } | { kind: 'error'; message: string };

/**
 * Asks for the card to be held against the back of the phone and reads its
 * number and expiry from the chip. Nothing is charged and no history is read.
 */
export function CardTapSheet({ onResult, onClose }: { onResult: (card: ChipCard) => void; onClose: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ kind: 'waiting' });
  const [attempt, setAttempt] = useState(0);
  const done = useRef(onResult);
  useEffect(() => {
    done.current = onResult;
  }, [onResult]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!CardNfc) return;
    const nfc = CardNfc;
    let live = true;
    const t = setTimeout(() => {
      if (!nfc.isEnabled()) {
        setState({ kind: 'off' });
        return;
      }
      setState({ kind: 'waiting' });
      nfc.readCard().then(
        (card) => {
          if (!live) return;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          done.current(card);
        },
        (e: { code?: string; message?: string }) => {
          if (!live || e.code === 'ERR_CANCELLED') return;
          setState(e.code === 'ERR_NFC_OFF' ? { kind: 'off' } : { kind: 'error', message: e.message ?? 'Couldn’t read that card.' });
        },
      );
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
      nfc.cancel().catch(() => {});
    };
  }, [attempt]);

  // Coming back from NFC settings, or from the background, starts listening again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') retry();
    });
    return () => sub.remove();
  }, [retry]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 20 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1 }} onPress={onClose} />
      <View style={{ backgroundColor: c.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 24, paddingBottom: insets.bottom + 24, gap: 14, alignItems: 'center' }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: state.kind === 'error' ? c.oweSoft : c.vaultSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={state.kind === 'error' ? 'alert' : 'nfc'} size={40} color={state.kind === 'error' ? c.owe : c.vault} strokeWidth={1.8} />
        </View>
        {state.kind === 'off' ? (
          <>
            <T variant="headline" style={{ textAlign: 'center' }}>Turn on NFC</T>
            <T variant="body" color="inkMuted" style={{ textAlign: 'center' }}>CardVault reads the card’s chip over NFC. Turn it on in settings, then come back here.</T>
            <Button variant="primary" block label="Open NFC settings" onPress={() => CardNfc?.openSettings()} />
          </>
        ) : state.kind === 'error' ? (
          <>
            <T variant="headline" style={{ textAlign: 'center' }}>Couldn’t read the card</T>
            <T variant="body" color="inkMuted" style={{ textAlign: 'center' }}>{state.message}</T>
            <Button variant="primary" block label="Try again" onPress={retry} />
          </>
        ) : (
          <>
            <T variant="headline" style={{ textAlign: 'center' }}>Hold your card to the back of the phone</T>
            <T variant="body" color="inkMuted" style={{ textAlign: 'center' }}>
              Keep it still for a second, near the camera. CardVault reads the number and expiry from the chip. Nothing is charged.
            </T>
          </>
        )}
        <T variant="caption" color="inkMuted" style={{ textAlign: 'center', fontFamily: fonts.regular }}>
          The chip doesn’t hold the CVV, so type it yourself if you want it saved.
        </T>
        <Button variant="quiet" block label="Cancel" onPress={onClose} />
      </View>
    </View>
  );
}
