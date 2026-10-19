import { router } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/Button';
import { CreditCardView } from '@/components/CreditCardView';
import { Field, Screen, Title, TopBar } from '@/components/layout';
import { T } from '@/components/Text';
import { detectNetwork, digitsOnly, formatCardNumber, isExpired, luhnValid, normaliseExpiry } from '@/lib/cardNumber';
import { useTheme } from '@/state/settings';
import { useVault } from '@/state/vault';
import { cardFaces, type CardFace } from '@/theme/tokens';

const FACES: CardFace[] = ['onyx', 'jade', 'brass', 'slate'];

export default function AddCard() {
  usePreventScreenCapture('add-card');
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

  const digits = digitsOnly(number);
  const network = detectNetwork(digits);
  const exp = normaliseExpiry(expiry);
  const errors = {
    number: digits.length && !luhnValid(digits) ? 'That number doesn’t look right. Check the digits.' : !digits.length ? 'Enter the card number.' : null,
    expiry: !exp ? 'Use MM/YY.' : isExpired(exp) ? 'This card has expired.' : null,
    cvv: cvv && !/^\d{3,4}$/.test(cvv) ? 'CVV is 3 or 4 digits.' : null,
  };
  const valid = !errors.number && !errors.expiry && !errors.cvv;

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
    <Screen footer={<Button variant="primary" block label="Save to vault" busy={busy} onPress={save} />}>
      <TopBar back="Cancel" />
      <Title>Add a card</Title>
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
        onChangeText={setNumber}
        maxLength={23}
        error={touched ? errors.number : null}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Valid thru" placeholder="MM/YY" keyboardType="number-pad" autoComplete="cc-exp" value={expiry} onChangeText={setExpiry} maxLength={5} error={touched ? errors.expiry : null} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="CVV (optional)" placeholder="•••" keyboardType="number-pad" autoComplete="cc-csc" secureTextEntry value={cvv} onChangeText={setCvv} maxLength={4} error={touched ? errors.cvv : null} />
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
        Saved only on this phone, encrypted in the system keystore. CardVault’s servers never see it.
      </T>
    </Screen>
  );
}
