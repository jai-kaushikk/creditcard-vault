// Pulls the OTP (and the amount, when the bank includes it) out of a pasted
// bank SMS, so the card owner can copy the whole message instead of the digits.

export type ParsedSms = { otp: string | null; amountMinor: number | null };

const OTP_NEAR = /(?:otp|one[\s-]?time\s*(?:password|pin|code)|verification\s*code|passcode|code)\D{0,25}?(\d{4,8})\b/i;
const OTP_BEFORE = /\b(\d{4,8})\b\s*(?:is\s*(?:your|the)?\s*)(?:otp|one[\s-]?time|verification)/i;
const AMOUNT = /(?:₹|rs\.?|inr|amt\.?|amount)\s*:?\s*([\d,]+(?:\.\d{1,2})?)/i;

export function parseBankSms(text: string): ParsedSms {
  const t = text.replace(/\s+/g, ' ').trim();
  const amountMatch = t.match(AMOUNT);
  const amountMinor = amountMatch ? Math.round(Number(amountMatch[1].replace(/,/g, '')) * 100) : null;
  let otp = t.match(OTP_BEFORE)?.[1] ?? t.match(OTP_NEAR)?.[1] ?? null;
  if (!otp) {
    // No keyword: take a lone 4–8 digit number that isn't part of the amount, a card ending or a date.
    const scrubbed = t
      .replace(AMOUNT, ' ')
      .replace(/(?:x{2,}|\*{2,}|ending\s*(?:with|in)?)\s*\d+/gi, ' ')
      .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ');
    const lone = scrubbed.match(/\b\d{4,8}\b/g);
    if (lone?.length === 1 || /^\d{4,8}$/.test(t)) otp = lone?.[0] ?? t;
  }
  return { otp, amountMinor: amountMinor && Number.isFinite(amountMinor) && amountMinor > 0 ? amountMinor : null };
}
