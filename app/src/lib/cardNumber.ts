export type Network = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'diners' | 'other';

export const NETWORK_LABEL: Record<Network, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  rupay: 'RuPay',
  amex: 'Amex',
  diners: 'Diners',
  other: 'Card',
};

export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '');
}

export function luhnValid(number: string): boolean {
  const digits = digitsOnly(number);
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function detectNetwork(number: string): Network {
  const d = digitsOnly(number);
  if (/^3[47]/.test(d)) return 'amex';
  if (/^3(0[0-5]|[68])/.test(d)) return 'diners';
  if (/^(60|65|81|82|508|353|356)/.test(d)) return 'rupay';
  if (/^4/.test(d)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'mastercard';
  return 'other';
}

/** How many digits a card number on this network has. */
export function maxDigits(network: Network): number {
  return network === 'amex' ? 15 : network === 'diners' ? 14 : network === 'other' ? 19 : 16;
}

/** Keeps typed input to digits, capped at the network's length. */
export function cardNumberInput(text: string): string {
  const d = digitsOnly(text);
  return d.slice(0, maxDigits(detectNetwork(d)));
}

/** "4315810022904821" → "4315 8100 2290 4821" (Amex: 4-6-5). */
export function formatCardNumber(number: string): string {
  const d = digitsOnly(number).slice(0, 19);
  if (detectNetwork(d) === 'amex') {
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  }
  return d.replace(/(.{4})(?=.)/g, '$1 ');
}

export function maskedNumber(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

/**
 * Formats MM/YY as it's typed: "1" → "1", "12" → "12/", "4" → "04/", "1229" → "12/29".
 * Backspacing over the slash removes the digit before it.
 */
export function expiryInput(next: string, prev: string): string {
  let d = digitsOnly(next).slice(0, 4);
  if (prev.endsWith('/') && next === prev.slice(0, -1)) d = d.slice(0, -1);
  if (d.length === 1 && Number(d) > 1) d = `0${d}`;
  return d.length >= 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Accepts "0829", "08/29", "8/29"; returns "08/29" or null. */
export function normaliseExpiry(text: string): string | null {
  const m = text.replace(/\s/g, '').match(/^(\d{1,2})\/?(\d{2})$/);
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  return `${String(month).padStart(2, '0')}/${m[2]}`;
}

export function isExpired(expiry: string, now = new Date()): boolean {
  const [mm, yy] = expiry.split('/').map(Number);
  const endOfMonth = new Date(2000 + yy, mm, 1);
  return endOfMonth <= now;
}
