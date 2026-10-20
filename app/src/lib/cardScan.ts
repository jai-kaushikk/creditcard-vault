import { luhnValid, maxDigits, detectNetwork } from './cardNumber.ts';

// Reads a card number, expiry and name out of the lines of text found in a
// camera frame. OCR misreads (O for 0, S for 5…) are fixed only inside groups
// that are mostly digits, and a number counts only if it passes the Luhn check.

export type ScanResult = { number: string | null; expiry: string | null; holder: string | null };

const LOOKALIKE: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0', U: '0', I: '1', l: '1', i: '1', '|': '1', '!': '1', Z: '2', z: '2',
  S: '5', s: '5', B: '8', G: '6', b: '6', T: '7', q: '9', g: '9',
};
const fix = (s: string) => s.replace(/[^\d]/g, (ch) => LOOKALIKE[ch] ?? ch);

/** The groups on a line that look like parts of a card number ("4315", "81OO"). */
function digitGroups(line: string): string[] {
  return line
    .split(/[\s\-.]+/)
    // Only digits and digit lookalikes, and at least half real digits ("81OO" yes, "SOS" no).
    .filter((tok) => tok.length >= 2 && /^[\dOoDQUIli|!ZzSsBGbTqg]+$/.test(tok) && (tok.match(/\d/g)?.length ?? 0) * 2 >= tok.length)
    .map(fix)
    .filter((tok) => /^\d+$/.test(tok));
}

function findNumber(lines: string[]): string | null {
  // Card numbers sit on one line, or (embossed cards) occasionally across two.
  const rows = [...lines.map(digitGroups), ...lines.slice(1).map((l, i) => [...digitGroups(lines[i]), ...digitGroups(l)])];
  const found: string[] = [];
  for (const groups of rows) {
    for (let start = 0; start < groups.length; start++) {
      let joined = '';
      for (let end = start; end < groups.length && joined.length < 19; end++) {
        joined += groups[end];
        if (joined.length >= 13 && joined.length <= 19 && luhnValid(joined) && joined.length === maxDigits(detectNetwork(joined))) {
          found.push(joined);
        }
      }
    }
  }
  // Prefer the longest valid number (a 16-digit match over a 13-digit slice of it).
  return found.sort((a, b) => b.length - a.length)[0] ?? null;
}

const DATE = /(?:^|[^\d/])([0-3OoIlSB]?[0-9OoIlSB])\s?[/\\]\s?((?:20)?[0-9OoIlSB]{2})(?![\d/])/g;

function findExpiry(lines: string[]): string | null {
  let best: { key: number; text: string } | null = null;
  for (const line of lines) {
    for (const m of line.matchAll(DATE)) {
      const mm = Number(fix(m[1]));
      const yy = Number(fix(m[2]).slice(-2));
      if (!(mm >= 1 && mm <= 12) || Number.isNaN(yy)) continue;
      // "VALID FROM" and "MEMBER SINCE" dates are earlier; the expiry is the latest date.
      const key = yy * 12 + mm;
      if (!best || key > best.key) best = { key, text: `${String(mm).padStart(2, '0')}/${String(yy).padStart(2, '0')}` };
    }
  }
  return best?.text ?? null;
}

const NOT_A_NAME = new Set(
  ('VALID THRU FROM UPTO TILL MONTH YEAR GOOD EXPIRES EXPIRY END BANK CARD CREDIT DEBIT PREPAID VISA MASTERCARD MASTER RUPAY AMEX AMERICAN ' +
    'EXPRESS DINERS CLUB DISCOVER MAESTRO PLATINUM GOLD SILVER TITANIUM SIGNATURE INFINITE WORLD ELITE PRIVILEGE REWARDS SELECT ' +
    'MEMBER SINCE CUSTOMER AUTHORIZED AUTHORISED SIGNATURE ELECTRONIC USE ONLY INTERNATIONAL DOMESTIC CONTACTLESS ' +
    'HDFC ICICI SBI AXIS KOTAK YES INDUSIND IDFC FIRST RBL HSBC CITI STANDARD CHARTERED AU BOB CANARA PNB UNION FEDERAL ' +
    'MILLENNIA REGALIA INFINIA DINERS CORAL RUBYX SAPPHIRO AMAZON PAY FLIPKART SWIGGY TATA NEU NEO ACE MAGNUS ATLAS ' +
    'MONEYBACK FREEDOM CASHBACK SIMPLYSAVE SIMPLYCLICK ELITE PRIME EDGE BUSINESS CORPORATE COMMERCIAL').split(' '),
);

function findHolder(lines: string[]): string | null {
  const candidates = lines
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter((l) => /^[A-Z][A-Z .'-]{3,30}$/.test(l))
    .filter((l) => {
      const words = l.split(' ').filter(Boolean);
      return words.length >= 2 && words.length <= 4 && words.every((w) => !NOT_A_NAME.has(w.replace(/[.'-]/g, '')));
    });
  // Names are printed near the bottom, after the number.
  return candidates.at(-1) ?? null;
}

export function parseCardText(lines: string[]): ScanResult {
  return { number: findNumber(lines), expiry: findExpiry(lines), holder: findHolder(lines) };
}
