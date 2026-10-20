import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Notice } from '@/components/bits';
import { Button } from '@/components/Button';
import { CardScanner, canScanCards } from '@/components/CardScanner';
import { CardTapSheet, canTapCards } from '@/components/CardTapSheet';
import { CreditCardView } from '@/components/CreditCardView';
import { Field, Screen, Title, TopBar } from '@/components/layout';
import { T } from '@/components/Text';
import { cardNumberInput, detectNetwork, digitsOnly, expiryInput, formatCardNumber, isExpired, luhnValid, maxDigits, normaliseExpiry } from '@/lib/cardNumber';
import { useTheme } from '@/state/settings';
import { useVault } from '@/state/vault';
import { cardFaces, type CardFace } from '@/theme/tokens';
import { isWeb, usePreventCapture } from '@/lib/platform';

const FACES: CardFace[] = ['onyx', 'jade', 'brass', 'slate'];

export default function AddCard() {
  usePreventCapture('add-card');
  const { c } = useTheme();
  const vault = useVault();
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [holder, setHolder] = useState('');
  const [nickname, setNickname] = useState('');
  const [face, setFace] = useState<CardFace>('slate');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reader, setReader] = useState<'camera' | 'nfc' | null>(null);
  const [filledBy, setFilledBy] = useState<'camera' | 'nfc' | null>(null);

  const digits = digitsOnly(number);
  const network = detectNetwork(digits);
  const exp = normaliseExpiry(expiry);
  const errors = {
    number: !digits.length
      ? 'Enter the card number.'
      : network !== 'other' && digits.length < maxDigits(network)
        ? `${network === 'amex' ? 'Amex' : 'This'} card number has ${maxDigits(network)} digits.`
        : !luhnValid(digits)
          ? 'That number doesn’t look right. Check the digits.'
          : null,
    expiry: !exp ? 'Use MM/YY.' : isExpired(exp) ? 'This card has expired.' : null,
    cvv: cvv && !/^\d{3,4}$/.test(cvv) ? 'CVV is 3 or 4 digits.' : null,
  };
  const valid = !errors.number && !errors.expiry && !errors.cvv;

  /** Fills the form from the camera or the chip; anything already typed in the name is kept. */
  const fill = (r: { number: string | null; expiry: string | null; holder: string | null }, by: 'camera' | 'nfc') => {
    setReader(null);
    if (r.number) setNumber(cardNumberInput(r.number));
    if (r.expiry) setExpiry(r.expiry);
    if (r.holder && !holder) setHolder(r.holder.replace(/\b(\w)(\w*)/g, (_m, a: string, b: string) => a + b.toLowerCase()));
    setFilledBy(by);
    setTouched(true);
  };

  const save = async () => {
    setTouched(true);
    if (!valid || !exp) return;
    setBusy(true);
    try {
      const card = await vault.add({
        nickname: nickname.trim() || `${network === 'other' ? 'Card' : network[0].toUpperCase() + network.slice(1)} ••${digits.slice(-4)}`,
        network,
        number: digits,
        expiry: exp,
        cvv: cvv || undefined,
        holder: holder.trim() || undefined,
        face,
      });
      router.replace(`/card/${card.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen footer={<Button variant="primary" block label="Save to vault" busy={busy} onPress={save} />}>
        <TopBar back="Cancel" />
        <Title>Add a card</Title>
        {canScanCards || canTapCards ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {canScanCards ? <Button style={{ flex: 1 }} block icon="camera" label="Scan card" onPress={() => setReader('camera')} /> : null}
            {canTapCards ? <Button style={{ flex: 1 }} block icon="nfc" label="Tap card" onPress={() => setReader('nfc')} /> : null}
          </View>
        ) : null}
        {filledBy ? (
          <Notice
            tone="good"
            icon="check"
            title={filledBy === 'nfc' ? 'Read from the card’s chip' : 'Filled in from the camera'}
            body={filledBy === 'nfc' ? 'Add the CVV and name yourself if you want them saved; the chip doesn’t share them.' : 'Check the number and expiry against your card before you save.'}
          />
        ) : null}
        <View style={{ alignItems: 'center' }}>
          <CreditCardView
            nickname={nickname || 'New card'}
            network={network}
            number={digits.padEnd(16, '•')}
            expiry={exp ?? 'MM/YY'}
            holder={holder || undefined}
            face={face}
            revealed
          />
        </View>
        <Field
          label="Card number"
          mono
          keyboardType="number-pad"
          autoComplete="cc-number"
          textContentType="creditCardNumber"
          value={formatCardNumber(number)}
          onChangeText={(v) => setNumber(cardNumberInput(v))}
          maxLength={formatCardNumber('9'.repeat(maxDigits(network))).length}
          error={touched ? errors.number : null}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Valid thru" placeholder="MM/YY" keyboardType="number-pad" autoComplete="cc-exp" value={expiry} onChangeText={(v) => setExpiry((prev) => expiryInput(v, prev))} maxLength={5} error={touched ? errors.expiry : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="CVV (optional)" placeholder="•••" keyboardType="number-pad" autoComplete="cc-csc" secureTextEntry value={cvv} onChangeText={(v) => setCvv(digitsOnly(v).slice(0, network === 'amex' ? 4 : 3))} maxLength={network === 'amex' ? 4 : 3} error={touched ? errors.cvv : null} />
          </View>
        </View>
        <Field label="Name on card (optional)" autoComplete="cc-name" value={holder} onChangeText={setHolder} autoCapitalize="words" />
        <Field label="Nickname" placeholder="HDFC Millennia" value={nickname} onChangeText={setNickname} />
        <View style={{ gap: 8 }}>
          <T variant="label" color="inkMuted">Card colour</T>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 12 }}>
            {FACES.map((f) => (
              <Pressable
                key={f}
                accessibilityRole="radio"
                accessibilityLabel={f}
                accessibilityState={{ selected: face === f }}
                onPress={() => setFace(f)}
                style={{ width: 56, height: 38, borderRadius: 6, backgroundColor: cardFaces[f], borderWidth: face === f ? 3 : 1, borderColor: face === f ? c.vault : c.line }}
              />
            ))}
          </View>
        </View>
        <T variant="label" color="inkMuted" style={{ fontFamily: 'SchibstedGrotesk_400Regular' }}>
          {isWeb
            ? 'Saved only in this browser, encrypted with a key the browser won’t export. CardVault’s servers never see it.'
            : 'Saved only on this phone, encrypted in the system keystore. CardVault’s servers never see it.'}
        </T>
      </Screen>
      {reader === 'camera' ? <CardScanner onClose={() => setReader(null)} onResult={(r) => fill(r, 'camera')} /> : null}
      {reader === 'nfc' ? <CardTapSheet onClose={() => setReader(null)} onResult={(r) => fill(r, 'nfc')} /> : null}
    </View>
  );
}
