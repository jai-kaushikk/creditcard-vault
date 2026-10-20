import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { parseBankSms } from '@/lib/sms';
import { useTheme } from '@/state/settings';
import { radius, type as typo } from '@/theme/tokens';
import { T } from './Text';

const MAX = 8;

/**
 * One box per digit, over a single hidden field so the keyboard, SMS autofill
 * and paste all work as usual. Pasting a whole bank SMS keeps just the OTP.
 */
export function OtpInput({ value, onChange, autoFocus }: { value: string; onChange: (otp: string) => void; autoFocus?: boolean }) {
  const { c } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput> | null>(null);
  const [focused, setFocused] = useState(false);
  const boxes = Math.max(6, Math.min(MAX, value.length));

  const change = (text: string) => {
    // More than one new character at once is a paste (or autofill): read it like an SMS.
    if (text.length > value.length + 1) {
      const otp = parseBankSms(text).otp;
      onChange((otp ?? text.replace(/\D/g, '')).slice(0, MAX));
      return;
    }
    onChange(text.replace(/\D/g, '').slice(0, MAX));
  };

  return (
    <Pressable accessible={false} onPress={() => input.current?.focus()} style={{ position: 'relative' }}>
      <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
        {Array.from({ length: boxes }, (_, i) => {
          const active = focused && (i === value.length || (i === boxes - 1 && value.length >= boxes));
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 52,
                height: 60,
                borderRadius: radius.sm,
                backgroundColor: c.surfaceSunken,
                borderWidth: 2,
                borderColor: active ? c.vault : value[i] ? c.lineStrong : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <T style={[typo.otp, { color: c.ink, fontSize: 26, lineHeight: 32 }]}>{value[i] ?? ''}</T>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        accessibilityLabel="One-time password"
        value={value}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden={false}
        style={{ position: 'absolute', inset: 0, opacity: 0.02, color: 'transparent', fontSize: 1 }}
      />
    </Pressable>
  );
}
