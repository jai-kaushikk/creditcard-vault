import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Amount, Avatar, Notice } from '@/components/bits';
import { Button } from '@/components/Button';
import { GoogleButton } from '@/components/GoogleButton';
import { CreditCardView } from '@/components/CreditCardView';
import { Glass } from '@/components/Glass';
import { T } from '@/components/Text';
import { googleConfigured } from '@/lib/config';
import { useAuth } from '@/state/auth';
import { useTheme } from '@/state/settings';

export default function Welcome() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, continueOffline } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (status === 'signedIn') return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>
      <View style={{ height: 300 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ position: 'absolute', left: 4, top: 20, transform: [{ rotate: '-9deg' }] }}>
          <CreditCardView nickname="Amazon Pay ICICI" network="visa" number="4627450033110937" expiry="02/28" face="jade" width={300} />
        </View>
        <View style={{ position: 'absolute', left: 16, top: 100, transform: [{ rotate: '5deg' }] }}>
          <CreditCardView nickname="HDFC Millennia" network="visa" number="4315810022904821" expiry="08/29" face="onyx" tag="Shared with Rahul" width={300} />
        </View>
        <Glass style={{ position: 'absolute', right: 0, top: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 8, paddingRight: 16 }}>
            <Avatar name="Rahul Verma" size={36} />
            <View>
              <T variant="caption" color="inkMuted">Rahul owes you</T>
              <Amount minor={315000} direction="lent" signed={false} />
            </View>
          </View>
        </Glass>
      </View>
      <T variant="display" style={{ marginTop: 16 }}>Your cards stay on your phone.</T>
      <T variant="body" color="inkMuted" style={{ marginTop: 12 }}>
        Share a card with a friend, approve every payment with your OTP, and keep a fair ledger of who owes what.
      </T>
      <View style={{ flex: 1 }} />
      <View style={{ gap: 8 }}>
        {error ? <Notice tone="bad" icon="alert" title="Couldn’t sign in" body={error} /> : null}
        <GoogleButton onError={setError} />
        {!googleConfigured ? (
          <Button variant="quiet" block label="Try it offline on this device" onPress={continueOffline} />
        ) : null}
        <T variant="caption" color="inkMuted" style={{ textAlign: 'center', marginTop: 8 }}>
          Google tells us only your name and email. Card details never leave this device unencrypted.{' '}
          <T variant="caption" color="vault" onPress={() => Linking.openURL('https://github.com/jai-kaushikk/creditcard-vault#privacy')}>Privacy</T>
        </T>
      </View>
    </View>
  );
}
