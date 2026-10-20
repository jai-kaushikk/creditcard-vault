import { CameraView, useCameraPermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseCardText, type ScanResult } from '@/lib/cardScan';
import { fonts } from '@/theme/tokens';
import { CardOcr } from '../../modules/card-ocr';
import { Button } from './Button';
import { Icon } from './Icon';
import { T } from './Text';

/** Card scanning works where on-device text recognition is built in (Android for now). */
export const canScanCards = CardOcr != null;

const CARD_RATIO = 1.586; // ID-1 card: 85.6 × 54 mm
const SLOW_HINT_MS = 15_000;

/**
 * Full-screen camera that reads a card's number and expiry on the phone.
 * It takes a quiet photo about once a second, reads the text with ML Kit,
 * and deletes the photo straight away. Nothing is uploaded.
 */
export function CardScanner({ onResult, onClose }: { onResult: (r: ScanResult) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<ComponentRef<typeof CameraView> | null>(null);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);
  const [hint, setHint] = useState('Hold your card flat inside the frame');
  const done = useRef(onResult);
  useEffect(() => {
    done.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!ready || !CardOcr) return;
    const ocr = CardOcr;
    let stopped = false;
    const best: ScanResult = { number: null, expiry: null, holder: null };
    let framesWithNumber = 0;
    const started = Date.now();
    (async () => {
      while (!stopped) {
        let uri: string | null = null;
        try {
          const pic = await camera.current?.takePictureAsync({ skipProcessing: true, shutterSound: false });
          uri = pic?.uri ?? null;
          if (!uri) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          if (stopped) continue;
          const r = parseCardText(await ocr.recognize(uri));
          best.number ??= r.number;
          best.expiry ??= r.expiry;
          best.holder ??= r.holder;
          if (best.number) framesWithNumber++;
          // Stop once there's a number and an expiry, or a few tries after the number without one.
          if (best.number && (best.expiry || framesWithNumber >= 4)) {
            stopped = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            done.current({ ...best });
          } else if (best.number) {
            setHint('Got the number. Hold still for the expiry date…');
          } else if (Date.now() - started > SLOW_HINT_MS) {
            setHint('Still looking. Try more light, or move the card a little closer.');
          }
        } catch {
          await new Promise((r) => setTimeout(r, 600));
        } finally {
          if (uri) {
            try {
              new File(uri).delete();
            } catch {
              // Already gone.
            }
          }
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [ready]);

  const frameW = Math.min(width - 48, 420);
  const frameH = frameW / CARD_RATIO;

  let body: React.ReactNode;
  if (!permission) {
    body = <ActivityIndicator color="#fff" />;
  } else if (!permission.granted) {
    body = (
      <View style={{ gap: 14, paddingHorizontal: 24, alignItems: 'center' }}>
        <Icon name="camera" size={36} color="#fff" />
        <T variant="headline" style={{ color: '#fff', textAlign: 'center' }}>Let CardVault use the camera</T>
        <T variant="body" style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
          It reads the number and expiry on the phone. Photos are deleted right away and never leave this device.
        </T>
        {permission.canAskAgain ? (
          <Button variant="primary" label="Allow camera" onPress={async () => { await requestPermission(); }} />
        ) : (
          <Button variant="primary" label="Open settings" onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  } else {
    body = (
      <>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          animateShutter={false}
          onCameraReady={() => setReady(true)}
        />
        <View pointerEvents="none" style={{ alignItems: 'center', gap: 16 }}>
          <View style={{ width: frameW, height: frameH, borderRadius: 16, borderWidth: 3, borderColor: '#fff' }} />
          <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}>
            <T variant="label" style={{ color: '#fff', fontFamily: fonts.medium, textAlign: 'center' }}>{hint}</T>
          </View>
        </View>
      </>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 20 }]}>
      {body}
      <View style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close scanner" onPress={onClose} hitSlop={10} style={round}>
          <Icon name="x" size={20} color="#fff" />
        </Pressable>
        {permission?.granted ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Light"
            accessibilityState={{ checked: torch }}
            onPress={() => setTorch((t) => !t)}
            hitSlop={10}
            style={[round, torch ? { backgroundColor: '#fff' } : null]}
          >
            <T style={{ color: torch ? '#000' : '#fff', fontFamily: fonts.semibold, fontSize: 13 }}>Light</T>
          </Pressable>
        ) : null}
      </View>
      <T variant="caption" style={{ position: 'absolute', bottom: insets.bottom + 20, left: 24, right: 24, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
        Read on this phone. Photos are deleted right away.
      </T>
    </View>
  );
}

const round = {
  minWidth: 44,
  height: 44,
  paddingHorizontal: 10,
  borderRadius: 22,
  backgroundColor: 'rgba(0,0,0,0.55)',
  alignItems: 'center',
  justifyContent: 'center',
} as const;
