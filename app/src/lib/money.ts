// Amounts are integer minor units (paise) everywhere. Formatting is done by
// hand so the output is identical on every Hermes/ICU build.

const SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

function groupIndian(int: string): string {
  if (int.length <= 3) return int;
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

function groupWestern(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoney(minor: number, currency = 'INR'): string {
  const abs = Math.abs(Math.round(minor));
  const whole = Math.floor(abs / 100).toString();
  const paise = abs % 100;
  const grouped = currency === 'INR' ? groupIndian(whole) : groupWestern(whole);
  const frac = paise ? `.${paise.toString().padStart(2, '0')}` : '';
  return `${SYMBOL[currency] ?? `${currency} `}${grouped}${frac}`;
}

/** Parses what a person types ("2,400", "₹ 1,250.5") into minor units, or null. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[^\d.]/g, '');
  if (!cleaned || (cleaned.match(/\./g) ?? []).length > 1) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}
